async function setIdStatus(uid, status) {
  const user = state.users[uid] || {};
  const currentStatus = getIdStatus(user);
  if (currentStatus === status) return;

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

