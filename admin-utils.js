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

function transactionSearchText(item) {
  return [
    JSON.stringify(item),
    userLabel(transactionUid(item)),
    participantLabel(item, "from"),
    participantLabel(item, "to"),
  ].join(" ").toLowerCase();
}

function userLabel(uid) {
  if (!uid) return "Unknown user";
  const user = userRecord(uid);
  const name = displayName(user);
  if (name && name !== "No name") return name + " (" + uid + ")";
  if (user.email) return user.email + " (" + uid + ")";
  return uid;
}

function participantLabel(item, side) {
  const uidPaths = side === "from"
    ? ["senderUid", "fromUid", "senderId", "fromUserId", "from", "sender.uid"]
    : ["receiverUid", "toUid", "receiverId", "toUserId", "to", "receiver.uid"];
  const namePaths = side === "from"
    ? ["fromName", "senderName", "sender.username", "sender.name"]
    : ["toName", "receiverName", "receiver.username", "receiver.name"];
  const uid = getFirstValue(item, uidPaths);
  const name = getFirstValue(item, namePaths);

  if (name && uid) return name + " (" + uid + ")";
  if (name) return name;
  return userLabel(uid);
}

function normalizeTransaction(item) {
  if (!item || typeof item !== "object") return null;
  const normalized = Object.assign({}, item);
  normalized.source = canonicalSource(normalized.source);
  if (normalized.source === "transactions" && isWalletTransfer(normalized)) {
    normalized.source = "user_transactions";
  }
  normalized.uid = transactionUid(normalized);
  normalized.status = normalizeStatus(normalized.status || normalized.paymentStatus || normalized.state ||
    getFirstValue(normalized, ["data.attributes.status", "attributes.status", "payment.status"]) || "record");
  normalized.timestamp = transactionTimestamp(normalized);
  return normalized;
}

function transactionUid(item) {
  return item.uid || item.userId || item.userUID || item.user_uid || item.user_id ||
    getFirstValue(item, [
      "metadata.uid",
      "metadata.userId",
      "data.attributes.metadata.uid",
      "data.attributes.metadata.userId",
      "attributes.metadata.uid",
      "attributes.metadata.userId",
      "checkout.metadata.uid",
      "payment.metadata.uid",
    ]) ||
    inferUidFromPath(item.id, item) || "";
}

function transactionTimestamp(item) {
  const value = getFirstValue(item, [
    "paidAt",
    "completedAt",
    "timestamp",
    "createdAt",
    "updatedAt",
    "created_at",
    "updated_at",
    "date",
    "time",
    "data.attributes.paid_at",
    "data.attributes.created_at",
    "data.attributes.updated_at",
    "attributes.paid_at",
    "attributes.created_at",
    "attributes.updated_at",
    "payment.createdAt",
    "checkout.createdAt",
  ]);
  const number = Number(value || 0);

  if (Number.isFinite(number) && number > 0) {
    return number < 1000000000000 ? number * 1000 : number;
  }

  const parsed = Date.parse(value || "");
  if (!Number.isNaN(parsed)) return parsed;

  return relatedTransactionTimestamp(item);
}

function normalizeStatus(value) {
  return String(value || "record").toLowerCase().replace(/\s+/g, "_");
}

function relatedTransactionTimestamp(item) {
  const uid = transactionUid(item);
  const amount = getFirstValue(item, ["amount", "data.attributes.amount", "attributes.amount", "payment.amount"]);
  const coins = getFirstValue(item, ["coins", "coinAmount", "coin_amount", "coinsAdded", "coinsDeducted"]);
  const itemId = String(item.id || "");

  const related = state.transactions
    .filter((candidate) => candidate !== item)
    .map((candidate) => ({
      candidate,
      timestamp: directTransactionTimestamp(candidate),
    }))
    .filter((entry) => entry.timestamp > 0)
    .filter((entry) => {
      const candidate = entry.candidate;
      const candidateUid = transactionUid(candidate);
      const candidateAmount = getFirstValue(candidate, ["amount", "data.attributes.amount", "attributes.amount", "payment.amount"]);
      const candidateCoins = getFirstValue(candidate, ["coins", "coinAmount", "coin_amount", "coinsAdded", "coinsDeducted"]);
      const candidateId = String(candidate.id || "");

      if (uid && candidateUid && uid !== candidateUid) return false;
      if (amount && candidateAmount && String(amount) !== String(candidateAmount)) return false;
      if (coins && candidateCoins && String(coins) !== String(candidateCoins)) return false;

      return itemId.includes(candidateId) || candidateId.includes(itemId) ||
        (uid && (amount || coins));
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  return related.length ? related[0].timestamp : 0;
}

function directTransactionTimestamp(item) {
  const value = getFirstValue(item, [
    "paidAt",
    "completedAt",
    "timestamp",
    "createdAt",
    "updatedAt",
    "created_at",
    "updated_at",
    "date",
    "time",
    "data.attributes.paid_at",
    "data.attributes.created_at",
    "data.attributes.updated_at",
    "attributes.paid_at",
    "attributes.created_at",
    "attributes.updated_at",
    "payment.createdAt",
    "checkout.createdAt",
  ]);
  const number = Number(value || 0);

  if (Number.isFinite(number) && number > 0) {
    return number < 1000000000000 ? number * 1000 : number;
  }

  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function transactionTitle(item) {
  const raw = item.type || item.action || item.category || item.event ||
    getFirstValue(item, ["data.attributes.type", "attributes.type"]) ||
    item.status || item.source;
  return titleCase(raw);
}

function titleCase(value) {
  return String(value || "record")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function transactionDetails(item) {
  const details = [];
  const amount = transactionAmountLabel(item);

  if (amount) details.push({label: "Amount", value: amount});
  const coins = getFirstValue(item, ["coins", "coinAmount", "coin_amount", "coinsAdded", "coinsDeducted"]);
  if (coins) {
    details.push({label: "Coins", value: coinLabel(coins)});
  }
  const from = getFirstValue(item, ["senderUid", "fromUid", "senderId", "fromUserId", "from", "sender.uid"]);
  if (from) {
    details.push({label: "From", value: participantLabel(item, "from")});
  }
  const to = getFirstValue(item, ["receiverUid", "toUid", "receiverId", "toUserId", "to", "receiver.uid"]);
  if (to) {
    details.push({label: "To", value: participantLabel(item, "to")});
  }
  const paymentId = getFirstValue(item, ["paymentId", "paymongoPaymentId", "data.id", "payment.id"]);
  if (paymentId) {
    details.push({label: "Payment ID", value: paymentId});
  }
  const sessionId = getFirstValue(item, ["sessionId", "checkoutSessionId", "checkout.id"]);
  if (sessionId) {
    details.push({label: "Session ID", value: sessionId});
  }
  if (item.originalSource) {
    details.push({label: "Saved at", value: item.originalSource});
  }

  return details;
}

function transactionAmountLabel(item) {
  const amount = getFirstValue(item, [
    "amount",
    "totalAmount",
    "price",
    "value",
    "amountPaid",
    "amount_paid",
    "data.attributes.amount",
    "attributes.amount",
    "payment.amount",
  ]);
  if (amount === undefined || amount === null || amount === "") return "";

  const typeText = String(item.type || item.source || item.originalSource || "").toLowerCase();
  const coins = getFirstValue(item, ["coins", "coinAmount", "coin_amount", "coinsAdded", "coinsDeducted"]);
  if (coins && String(coins) === String(amount) && isWalletTransfer(item)) return "";

  const currency = String(getFirstValue(item, [
    "currency",
    "paymentCurrency",
    "data.attributes.currency",
    "attributes.currency",
    "payment.currency",
  ]) || "").toUpperCase();

  if (currency === "PHP" || typeText.includes("paymongo") || String(item.source || "").indexOf("paymongo") >= 0 ||
    String(item.originalSource || "").indexOf("paymongo") >= 0) {
    return formatPeso(payMongoAmountToPeso(amount));
  }

  if (typeText.includes("premium") || typeText.includes("coin") || item.coins || item.coinAmount || item.coinsAdded || item.coinsDeducted) {
    return coinLabel(amount);
  }

  return String(amount);
}

function coinLabel(value) {
  const coins = Number(value || 0);
  if (Number.isFinite(coins)) {
    return new Intl.NumberFormat("en-US", {maximumFractionDigits: 0}).format(coins) + " coins";
  }
  return String(value);
}

function getFirstValue(item, paths) {
  for (const path of paths) {
    const value = getPath(item, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function getPath(item, path) {
  return String(path).split(".").reduce((current, key) => {
    if (current === undefined || current === null) return undefined;
    return current[key];
  }, item);
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

function payMongoRevenue() {
  return paidPayMongoPayments()
    .reduce((total, item) => total + payMongoAmountToPeso(item.amount), 0);
}

function paidPayMongoPayments() {
  return allTransactionRows()
    .filter((item) => item.source === "paymongo_payments")
    .filter(isPaidPayMongo);
}

function isPaidPayMongo(item) {
  const status = String(item.status || "").toLowerCase();
  return ["paid", "completed", "succeeded", "success"].includes(status);
}

function payMongoTimestamp(item) {
  const value = item.paidAt || item.completedAt || item.timestamp ||
    item.createdAt || item.updatedAt || item.created_at || item.updated_at;
  const number = Number(value || 0);
  if (number) return number;

  const parsed = Date.parse(value || "");
  if (!Number.isNaN(parsed)) return parsed;

  return Date.now();
}

function payMongoAmountToPeso(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return amount / 100;
}

function formatPeso(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(value);
}

function escapeHtml(value) {
  return String(value === undefined || value === null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
