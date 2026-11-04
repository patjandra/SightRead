import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./useAuth.js";

// Shared circle for the signed-in avatar and the guest placeholder.
const AVATAR = "w-8 h-8 rounded-full flex-shrink-0";

function GuestAvatar() {
  return (
    <div
      className={`${AVATAR} bg-slate-700 border border-slate-600 text-slate-400 flex items-center justify-center`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    </div>
  );
}

/** Account controls for the side panel: sign in (guest) or identity + sign out. */
export default function AccountSection() {
  const { status, user, signOut, deleteAccount, openSignIn, openSwitchAccount } = useAuth();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [signOutError, setSignOutError] = useState(null);

  async function handleSignOut() {
    setSignOutError(null);
    try {
      await signOut();
    } catch {
      setSignOutError("Couldn't sign out. Please try again.");
    }
  }

  async function handleDelete() {
    setDeleteError(null);
    try {
      await deleteAccount();
    } catch {
      setDeleteError("Couldn't delete your account. Please try again.");
    }
  }

  if (status === "loading") return null;

  return (
    <section className="mt-auto pt-3 border-t border-slate-700 space-y-2">
      {user && (
        <div className="flex items-center gap-2.5">
          {user.picture ? (
            <img
              src={user.picture}
              alt=""
              referrerPolicy="no-referrer"
              className={AVATAR}
            />
          ) : (
            <div className={`${AVATAR} bg-slate-600`} />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">{user.name || user.email}</p>
            <button
              onClick={handleSignOut}
              className="text-[11px] text-slate-400 hover:text-white underline underline-offset-2"
            >
              Sign out
            </button>
            {" · "}
            <button
              onClick={openSwitchAccount}
              aria-label="Switch account"
              className="text-[11px] text-slate-400 hover:text-white underline underline-offset-2"
            >
              Switch
            </button>
            {" · "}
            <button
              onClick={() => setConfirmingDelete(true)}
              aria-label="Delete account"
              className="text-[11px] text-slate-500 hover:text-red-400 underline underline-offset-2"
            >
              Delete
            </button>
            {signOutError && <p className="text-[11px] text-red-400">{signOutError}</p>}
          </div>
        </div>
      )}
      {user && confirmingDelete && (
        <div role="alertdialog" aria-label="Delete account" className="rounded-md border border-red-500/40 bg-red-500/10 p-2 space-y-1.5">
          <p className="text-[11px] leading-snug">
            This permanently deletes your account, saved PDFs and synced profiles. It can't be undone.
          </p>
          <div className="flex gap-2">
            <button onClick={handleDelete} className="text-[11px] bg-red-600 hover:bg-red-500 rounded px-2 py-0.5">
              Delete everything
            </button>
            <button onClick={() => setConfirmingDelete(false)} className="text-[11px] text-slate-400 hover:text-white">
              Cancel
            </button>
          </div>
          {deleteError && <p className="text-[11px] text-red-400">{deleteError}</p>}
        </div>
      )}
      {!user && (
        <div className="flex items-center gap-2.5">
          <GuestAvatar />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">Guest</p>
            <button
              onClick={openSignIn}
              className="text-[11px] text-slate-400 hover:text-white underline underline-offset-2"
            >
              Sign in
            </button>
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-500 text-center">
        <Link to="/privacy" className="hover:text-slate-300 underline">Privacy</Link>
        {" · "}
        <Link to="/terms" className="hover:text-slate-300 underline">Terms</Link>
      </p>
    </section>
  );
}
