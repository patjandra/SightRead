import React from "react";
import { Link, useNavigate } from "react-router-dom";
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
  const { status, user, signOut } = useAuth();
  const navigate = useNavigate();

  if (status === "loading") return null;

  return (
    <section className="mt-auto pt-3 border-t border-slate-700 space-y-2">
      {user ? (
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
              onClick={signOut}
              className="text-[11px] text-slate-400 hover:text-white underline underline-offset-2"
            >
              Sign out
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2.5">
          <GuestAvatar />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">Guest</p>
            <button
              onClick={() => navigate("/signin")}
              className="text-[11px] text-slate-400 hover:text-white underline underline-offset-2"
            >
              Sign in
            </button>
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-500">
        <Link to="/privacy" className="hover:text-slate-300 underline">Privacy</Link>
        {" · "}
        <Link to="/terms" className="hover:text-slate-300 underline">Terms</Link>
      </p>
    </section>
  );
}
