import React, { createContext, useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { getMe, signInWithGoogle, signOut as apiSignOut, deleteAccount as apiDeleteAccount } from "./authClient.js";
import SignInPrompt from "./SignInPrompt.jsx";

export const AuthContext = createContext(null);

/**
 * Session state for the whole app.
 *
 *   status: "loading" (checking the session) | "guest" | "signed-in"
 *
 * `requireAuth(action)` is the save gate: signed-in users run `action(user)`
 * immediately; guests get the sign-in prompt, and `action(user)` runs once they
 * have signed in. The user is passed in because the caller's own copy of auth
 * state is still the pre-sign-in one when the action fires. Dismissing the prompt discards it. `openSignIn()` shows the same
 * prompt without a pending action.
 */
export default function AuthProvider({ children }) {
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);
  // True when the session check failed (API unreachable), as opposed to the
  // server confirming there is no session. Callers must not treat this as a
  // sign-out, e.g. by deleting locally cached account data.
  const [sessionUnknown, setSessionUnknown] = useState(false);
  // null = closed; "save" = a guest tried to save; "signin" = they chose Sign in.
  const [promptMode, setPromptMode] = useState(null);
  const pendingRef = useRef(null);
  const userRef = useRef(null);
  userRef.current = user;

  /** (Re)check the session with the server. */
  const refresh = useCallback(async () => {
    try {
      const { user } = await getMe();
      setUser(user);
      setSessionUnknown(false);
      setStatus(user ? "signed-in" : "guest");
    } catch {
      // API unreachable: behave as a guest so the local app still works, but
      // flag that we don't actually know.
      setSessionUnknown(true);
      setStatus((s) => (s === "loading" ? "guest" : s));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Exchange a Google credential for a session. Throws on failure. */
  const completeSignIn = useCallback(async (credential) => {
    const { user } = await signInWithGoogle(credential);
    // Picking a different account is a sign-out of the old one first, so its
    // profiles, cached PDFs and open document are dropped like on Sign out.
    // Picking the same account just refreshes it.
    if (userRef.current && userRef.current.id !== user.id) {
      flushSync(() => {
        setUser(null);
        setStatus("guest");
      });
    }
    setUser(user);
    setSessionUnknown(false);
    setStatus("signed-in");

    const pending = pendingRef.current;
    pendingRef.current = null;
    setPromptMode(null);
    if (pending) {
      try {
        await pending(user);
      } catch (err) {
        console.error("[SightRead] Action after sign-in failed:", err);
      }
    }
    return user;
  }, []);

  // Only flips to guest once the server has cleared the cookie; on failure the
  // session is still valid, so keep the UI signed in and let the caller see it.
  const signOut = useCallback(async () => {
    await apiSignOut();
    setUser(null);
    setStatus("guest");
  }, []);

  // Same as signing out once the server has removed the account.
  const deleteAccount = useCallback(async () => {
    await apiDeleteAccount();
    setUser(null);
    setStatus("guest");
  }, []);

  const requireAuth = useCallback(
    (action) => {
      if (user) return action(user);
      pendingRef.current = action;
      setPromptMode("save");
    },
    [user]
  );

  // Open the sign-in modal over the current page (no navigation, so whatever
  // is loaded, e.g. the open PDF, stays put).
  const openSignIn = useCallback(() => {
    pendingRef.current = null;
    setPromptMode("signin");
  }, []);

  // Ask Google for an account while staying signed in; nothing changes unless
  // a different account is chosen.
  const openSwitchAccount = useCallback(() => {
    pendingRef.current = null;
    setPromptMode("switch");
  }, []);

  const closePrompt = useCallback(() => {
    pendingRef.current = null;
    setPromptMode(null);
  }, []);

  const value = {
    status,
    user,
    sessionUnknown,
    refresh,
    completeSignIn,
    signOut,
    deleteAccount,
    requireAuth,
    openSignIn,
    openSwitchAccount,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {promptMode && <SignInPrompt mode={promptMode} onClose={closePrompt} />}
    </AuthContext.Provider>
  );
}
