import React, { createContext, useCallback, useEffect, useRef, useState } from "react";
import { getMe, signInWithGoogle, signOut as apiSignOut } from "./authClient.js";
import SignInPrompt from "./SignInPrompt.jsx";

export const AuthContext = createContext(null);

/**
 * Session state for the whole app.
 *
 *   status: "loading" (checking the session) | "guest" | "signed-in"
 *
 * `requireAuth(action)` is the save gate: signed-in users run `action`
 * immediately; guests get the sign-in prompt, and `action` runs once they have
 * signed in. Dismissing the prompt discards it. `openSignIn()` shows the same
 * prompt without a pending action.
 */
export default function AuthProvider({ children }) {
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);
  // null = closed; "save" = a guest tried to save; "signin" = they chose Sign in.
  const [promptMode, setPromptMode] = useState(null);
  const pendingRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then(({ user }) => {
        if (cancelled) return;
        setUser(user);
        setStatus(user ? "signed-in" : "guest");
      })
      .catch(() => {
        // API unreachable: behave as a guest so the local app still works.
        if (!cancelled) setStatus("guest");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Exchange a Google credential for a session. Throws on failure. */
  const completeSignIn = useCallback(async (credential) => {
    const { user } = await signInWithGoogle(credential);
    setUser(user);
    setStatus("signed-in");

    const pending = pendingRef.current;
    pendingRef.current = null;
    setPromptMode(null);
    if (pending) {
      try {
        await pending();
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

  const requireAuth = useCallback(
    (action) => {
      if (user) return action();
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

  const closePrompt = useCallback(() => {
    pendingRef.current = null;
    setPromptMode(null);
  }, []);

  const value = { status, user, completeSignIn, signOut, requireAuth, openSignIn };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {promptMode && <SignInPrompt mode={promptMode} onClose={closePrompt} />}
    </AuthContext.Provider>
  );
}
