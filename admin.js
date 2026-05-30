const firebaseConfig = {
  apiKey: "AIzaSyB8z_w1xGFyK2ZcjYieImlyaHdOPv6RQS4",
  authDomain: "barterhub-3c947.firebaseapp.com",
  databaseURL: "https://barterhub-3c947-default-rtdb.firebaseio.com",
  projectId: "barterhub-3c947",
  storageBucket: "barterhub-3c947.appspot.com",
  messagingSenderId: "812276220118",
  appId: "1:812276220118:web:6c4893c3ad05c0fb598977",
  measurementId: "G-XLD6NQ0KLY",
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.database();
const functions = firebase.app().functions("us-central1");

const state = {
  users: {},
  deletionRequests: {},
  transactions: [],
  adminUid: "",
  pendingAction: null,
};

const $ = (id) => document.getElementById(id);
const loginPage = $("loginPage");
const appShell = $("appShell");
const loginForm = $("loginForm");
const loginError = $("loginError");
const signOutBtn = $("signOutBtn");
const themeToggleBtn = $("themeToggleBtn");
const adminEmail = $("adminEmail");
const reasonModal = $("reasonModal");
const reasonTitle = $("reasonTitle");
const reasonText = $("reasonText");
const reasonInput = $("reasonInput");
const reasonConfirmBtn = $("reasonConfirmBtn");
const reasonCancelBtn = $("reasonCancelBtn");

applyTheme(localStorage.getItem("barterhub-admin-theme") || "light");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";

  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (error) {
    loginError.textContent = error.message || "Could not sign in.";
  }
});

signOutBtn.addEventListener("click", () => auth.signOut());

themeToggleBtn.addEventListener("click", () => {
  const currentTheme = document.body.dataset.theme || "light";
  const nextTheme = currentTheme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  localStorage.setItem("barterhub-admin-theme", nextTheme);
});

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    showLogin();
    return;
  }

  const adminSnap = await db.ref("admin_users/" + user.uid).get();
  const isAdmin = adminSnap.val() === true;

  if (!isAdmin) {
    loginError.textContent = "This account is not an admin.";
    await auth.signOut();
    return;
  }

  state.adminUid = user.uid;
  adminEmail.textContent = user.email || user.uid;
  showApp();
  startListeners();
});

document.querySelectorAll(".nav-btn").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((btn) => btn.classList.remove("active"));
    document.querySelectorAll(".view").forEach((view) => view.classList.add("hidden"));
    button.classList.add("active");
    $(button.dataset.view).classList.remove("hidden");
  });
});

$("refreshBtn").addEventListener("click", renderAll);
[
  "idSearchInput", "idStatusFilter", "deletionSearchInput",
  "deletionStatusFilter", "userSearchInput", "userStatusFilter",
  "transactionSearchInput", "transactionTypeFilter",
].forEach((id) => {
  $(id).addEventListener("input", renderAll);
  $(id).addEventListener("change", renderAll);
});

reasonCancelBtn.addEventListener("click", closeReasonModal);
reasonConfirmBtn.addEventListener("click", async () => {
  if (!state.pendingAction) return;
  const action = state.pendingAction;
  closeReasonModal();
  await action(reasonInput.value.trim());
});

function showLogin() {
  appShell.classList.add("hidden");
  loginPage.classList.remove("hidden");
}

function showApp() {
  loginPage.classList.add("hidden");
  appShell.classList.remove("hidden");
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  if (themeToggleBtn) {
    themeToggleBtn.textContent = theme === "dark" ? "Light mode" : "Dark mode";
  }
}

function startListeners() {
  db.ref("users").on("value", (snapshot) => {
    state.users = snapshot.val() || {};
    renderAll();
  });

  db.ref("account_deletion_requests").on("value", (snapshot) => {
    state.deletionRequests = snapshot.val() || {};
    renderAll();
  });

  listenTransactions();
}

function listenTransactions() {
  [
    "coin_transactions",
    "premium_transactions",
    "paymongo_payments",
    "paymongo_checkout_sessions",
    "processed_paymongo_payments",
    "transactions",
  ].forEach((source) => {
    db.ref(source).limitToLast(80).on("value", (snapshot) => {
      const rows = flattenNode(source, snapshot.val() || {});
      state.transactions = state.transactions
        .filter((item) => item.source !== source)
        .concat(rows);
      renderAll();
    });
  });
}

function flattenNode(source, value, parentKey = "") {
  if (!value || typeof value !== "object") return [];

  return Object.entries(value).flatMap(([key, child]) => {
    const id = parentKey ? parentKey + "/" + key : key;
    const looksLikeRecord = child && typeof child === "object" && (
      child.status || child.type || child.amount || child.coins ||
      child.paymentId || child.sessionId || child.timestamp || child.createdAt
    );

    if (looksLikeRecord) return [Object.assign({id, source}, child)];
    if (child && typeof child === "object") return flattenNode(source, child, id);
    return [{id, source, value: child}];
  });
}

function renderAll() {
  renderDashboard();
  renderVerification();
  renderDeletionRequests();
  renderUsers();
  renderTransactions();
}

function userRows() {
  return Object.entries(state.users).map(([uid, user]) => Object.assign({uid}, user || {}));
}

function renderDashboard() {
  const users = userRows();
  const pendingIds = users.filter((user) => getIdStatus(user) === "pending" && hasIdUpload(user)).length;
  const pendingDeletion = Object.values(state.deletionRequests).filter((request) => request.status === "pending").length;
  const payments = state.transactions.filter((item) => item.source.indexOf("paymongo") >= 0).length;

  $("statUsers").textContent = users.length;
  $("statPendingIds").textContent = pendingIds;
  $("statDeletion").textContent = pendingDeletion;
  $("statPayments").textContent = payments;
}

function renderVerification() {
  const search = getValue("idSearchInput").toLowerCase();
  const status = getValue("idStatusFilter");
  const rows = userRows().filter(hasIdUpload).filter((user) => {
    const idStatus = getIdStatus(user);
    if (status !== "all" && idStatus !== status) return false;
    return searchUser(user, search);
  });

  const list = $("verificationList");
  if (rows.length === 0) {
    list.innerHTML = empty("No ID verification records found.");
    return;
  }

  list.innerHTML = rows.map((user) => {
    const idStatus = getIdStatus(user);
    const front = user.idFrontUrl || user.idFrontPath || "";
    const back = user.idBackUrl || user.idBackPath || "";

    return `
      <article class="record-card">
        <div class="record-top">
          <div>
            <h3>${escapeHtml(displayName(user))}</h3>
            <div class="meta">
              <span>Email: ${escapeHtml(user.email || "No email")}</span>
              <span>Phone: ${escapeHtml(user.phoneNumber || "")}</span>
              <span>UID: ${escapeHtml(user.uid)}</span>
            </div>
          </div>
          <span class="badge ${idStatus}">${escapeHtml(idStatus)}</span>
        </div>
        <div class="image-row">${imageTag(front, "Front ID")}${imageTag(back, "Back ID")}</div>
        <div class="actions">
          <button class="success-btn" onclick="setIdStatus('${user.uid}', 'verified')">Approve</button>
          <button class="danger-btn" onclick="setIdStatus('${user.uid}', 'rejected')">Reject</button>
          <button class="secondary-btn" onclick="setIdStatus('${user.uid}', 'pending')">Reset Pending</button>
        </div>
      </article>`;
  }).join("");
}

function renderDeletionRequests() {
  const search = getValue("deletionSearchInput").toLowerCase();
  const status = getValue("deletionStatusFilter");
  const rows = Object.entries(state.deletionRequests)
    .map(([uid, request]) => Object.assign({uid}, request || {}))
    .filter((request) => {
      const user = state.users[request.uid] || {};
      if (status !== "all" && request.status !== status) return false;
      return searchRequest(request, user, search);
    })
    .sort((a, b) => Number(b.requestedAt || 0) - Number(a.requestedAt || 0));

  const list = $("deletionList");
  if (rows.length === 0) {
    list.innerHTML = empty("No account deletion requests found.");
    return;
  }

  list.innerHTML = rows.map((request) => {
    const user = state.users[request.uid] || {};
    const requestStatus = request.status || "pending";

    return `
      <article class="record-card">
        <div class="record-top">
          <div>
            <h3>${escapeHtml(displayName(user))}</h3>
            <div class="meta">
              <span>Email: ${escapeHtml(user.email || "No email")}</span>
              <span>UID: ${escapeHtml(request.uid)}</span>
              <span>Requested: ${formatTime(request.requestedAt)}</span>
              <span>Source: ${escapeHtml(request.source || "")}</span>
            </div>
          </div>
          <span class="badge ${requestStatus}">${escapeHtml(requestStatus)}</span>
        </div>
        <div class="actions">
          <button class="danger-btn" onclick="confirmCompleteDeletion('${request.uid}')">Complete Deletion</button>
          <button class="secondary-btn" onclick="confirmRejectDeletion('${request.uid}')">Reject Request</button>
        </div>
      </article>`;
  }).join("");
}

function renderUsers() {
  const search = getValue("userSearchInput").toLowerCase();
  const status = getValue("userStatusFilter");
  const rows = userRows().filter((user) => {
    if (!searchUser(user, search)) return false;
    if (status === "all") return true;
    if (status === "premium") return user.isPremium === true;
    return user.accountStatus === status;
  });

  const list = $("usersList");
  if (rows.length === 0) {
    list.innerHTML = empty("No users found.");
    return;
  }

  list.innerHTML = rows.map((user) => {
    const coins = user.wallet && user.wallet.coins !== undefined ? user.wallet.coins : 0;
    const premiumExpiry = user.premiumExpiry ? formatTime(user.premiumExpiry) : "Not premium";
    const statusText = user.accountStatus || getIdStatus(user);

    return `
      <article class="record-card">
        <div class="record-top">
          <div>
            <h3>${escapeHtml(displayName(user))}</h3>
            <div class="meta">
              <span>Email: ${escapeHtml(user.email || "No email")}</span>
              <span>Username: ${escapeHtml(user.username || "")}</span>
              <span>UID: ${escapeHtml(user.uid)}</span>
              <span>Coins: ${escapeHtml(String(coins))}</span>
              <span>Premium expiry: ${escapeHtml(premiumExpiry)}</span>
            </div>
          </div>
          <span class="badge ${statusText}">${escapeHtml(statusText)}</span>
        </div>
      </article>`;
  }).join("");
}

function renderTransactions() {
  const search = getValue("transactionSearchInput").toLowerCase();
  const source = getValue("transactionTypeFilter");
  const rows = state.transactions
    .filter((item) => source === "all" || item.source === source)
    .filter((item) => JSON.stringify(item).toLowerCase().includes(search))
    .sort((a, b) => Number(b.timestamp || b.createdAt || 0) - Number(a.timestamp || a.createdAt || 0))
    .slice(0, 150);

  const list = $("transactionsList");
  if (rows.length === 0) {
    list.innerHTML = empty("No transaction records found.");
    return;
  }

  list.innerHTML = rows.map((item) => {
    const time = item.timestamp || item.createdAt || item.updatedAt;
    const amount = item.amount || item.coins || item.coinsDeducted || "";
    const statusText = item.status || "record";

    return `
      <article class="record-card">
        <div class="record-top">
          <div>
            <h3>${escapeHtml(item.type || item.status || item.source)}</h3>
            <div class="meta">
              <span>Source: ${escapeHtml(item.source)}</span>
              <span>ID: ${escapeHtml(item.id)}</span>
              <span>UID: ${escapeHtml(item.uid || item.userId || "")}</span>
              <span>Amount/coins: ${escapeHtml(String(amount))}</span>
              <span>Time: ${formatTime(time)}</span>
            </div>
          </div>
          <span class="badge ${statusText}">${escapeHtml(statusText)}</span>
        </div>
      </article>`;
  }).join("");
}

async function setIdStatus(uid, status) {
  if (!window.confirm("Set ID verification to " + status + "?")) return;
  try {
    await functions.httpsCallable("adminSetIdVerification")({uid, status});
    window.alert("ID verification updated.");
  } catch (error) {
    window.alert(error.message || "Could not update ID verification.");
  }
}

function confirmCompleteDeletion(uid) {
  reasonTitle.textContent = "Complete Account Deletion";
  reasonText.textContent = "This will anonymize the user profile and delete the Auth account.";
  reasonInput.value = "Processed by admin.";
  state.pendingAction = async (note) => {
    try {
      await functions.httpsCallable("adminCompleteAccountDeletion")({uid, note});
      window.alert("Account deletion completed.");
    } catch (error) {
      window.alert(error.message || "Could not complete deletion.");
    }
  };
  reasonModal.classList.add("open");
}

function confirmRejectDeletion(uid) {
  reasonTitle.textContent = "Reject Deletion Request";
  reasonText.textContent = "Add a short reason or note for rejecting this request.";
  reasonInput.value = "";
  state.pendingAction = async (reason) => {
    try {
      await functions.httpsCallable("adminRejectAccountDeletion")({uid, reason});
      window.alert("Deletion request rejected.");
    } catch (error) {
      window.alert(error.message || "Could not reject request.");
    }
  };
  reasonModal.classList.add("open");
}

function closeReasonModal() {
  reasonModal.classList.remove("open");
  state.pendingAction = null;
}

function hasIdUpload(user) {
  return Boolean(user.idFrontUrl || user.idBackUrl || user.idFrontPath || user.idBackPath);
}

function getIdStatus(user) {
  return user.isIDVerified || user.idVerificationStatus || "pending";
}

function displayName(user) {
  return user.fullName || user.username || user.name || "No name";
}

function searchUser(user, search) {
  const target = [user.uid, user.fullName, user.username, user.email, user.phone, user.phoneNumber].join(" ").toLowerCase();
  return target.includes(search);
}

function searchRequest(request, user, search) {
  const target = [request.uid, request.status, request.source, user.fullName, user.username, user.email].join(" ").toLowerCase();
  return target.includes(search);
}

function getValue(id) {
  return $(id).value;
}

function imageTag(src, alt) {
  if (!src || src.indexOf("id_verifications/") === 0) {
    return `<div class="empty">${escapeHtml(alt)} path saved</div>`;
  }
  return `<a href="${escapeHtml(src)}" target="_blank" rel="noopener"><img class="id-image" src="${escapeHtml(src)}" alt="${alt}"></a>`;
}

function empty(message) {
  return `<div class="panel empty">${escapeHtml(message)}</div>`;
}

function formatTime(value) {
  const number = Number(value || 0);
  if (!number) return "Unknown";
  return new Date(number).toLocaleString();
}

function escapeHtml(value) {
  return String(value === undefined || value === null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
