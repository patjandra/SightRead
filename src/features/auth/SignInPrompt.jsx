import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import GoogleSignInButton from "./GoogleSignInButton.jsx";
import { useAuth } from "./useAuth.js";

/** Sign-in modal (save gate or Sign in button). Rendered by AuthProvider. */
export default function SignInPrompt({ mode = "save", onClose }) {
  const { completeSignIn } = useAuth();
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleCredential(credential) {
    setError(null);
    try {
      await completeSignIn(credential);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-prompt-title"
        className="w-full max-w-sm rounded-xl bg-slate-800 border border-slate-700 p-6 text-slate-100 space-y-4"
      >
        <div className="space-y-1">
          <h2 id="signin-prompt-title" className="text-lg font-semibold">
            {mode === "save" ? "Sign in to save" : mode === "switch" ? "Switch account" : "Sign in to SightRead"}
          </h2>
          <p className="text-sm text-slate-400">
            {mode === "save"
              ? "Saving keeps your profiles and sheet music with your account so you can use them on any device."
              : mode === "switch"
              ? "Choose the account to use. Close this to stay signed in as you are."
              : "Sign in to keep your profiles and sheet music with your account across devices."}
          </p>
        </div>

        <GoogleSignInButton onCredential={handleCredential} />
        {error && <p className="text-sm text-red-400 text-center">{error}</p>}

        <div className="flex items-center justify-between text-xs text-slate-500">
          <button onClick={onClose} className="hover:text-slate-300">
            Not now
          </button>
          <span>
            <Link to="/privacy" className="hover:text-slate-300 underline">Privacy</Link>
            {" · "}
            <Link to="/terms" className="hover:text-slate-300 underline">Terms</Link>
          </span>
        </div>
      </div>
    </div>
  );
}
