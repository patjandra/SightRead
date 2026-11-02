import React, { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import GoogleSignInButton from "./GoogleSignInButton.jsx";
import { useAuth } from "./useAuth.js";

export default function SignInPage() {
  const { status, completeSignIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  if (status === "signed-in") return <Navigate to="/" replace />;

  async function handleCredential(credential) {
    setError(null);
    try {
      await completeSignIn(credential);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <img src="/sight-read-logo.png" alt="" className="w-14 h-14 rounded-xl mx-auto" />
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">SightRead</h1>
          <p className="text-sm text-slate-400">
            Sign in to keep your profiles and sheet music across devices.
          </p>
        </div>

        <GoogleSignInButton onCredential={handleCredential} oneTap />
        {error && <p className="text-sm text-red-400">{error}</p>}

        <Link
          to="/"
          className="block text-sm text-slate-400 hover:text-white underline underline-offset-4"
        >
          Continue without signing in
        </Link>

        <p className="text-xs text-slate-500">
          <Link to="/privacy" className="hover:text-slate-300 underline">Privacy</Link>
          {" · "}
          <Link to="/terms" className="hover:text-slate-300 underline">Terms</Link>
        </p>
      </div>
    </main>
  );
}
