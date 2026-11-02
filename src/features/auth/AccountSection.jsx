import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth.js";

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
              className="w-8 h-8 rounded-full flex-shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-slate-600 flex-shrink-0" />
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
        <button
          onClick={() => navigate("/signin")}
          className="w-full bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg px-3 py-2 text-sm transition-colors"
        >
          Sign in
        </button>
      )}
      <p className="text-[11px] text-slate-500">
        <Link to="/privacy" className="hover:text-slate-300 underline">Privacy</Link>
        {" · "}
        <Link to="/terms" className="hover:text-slate-300 underline">Terms</Link>
      </p>
    </section>
  );
}
