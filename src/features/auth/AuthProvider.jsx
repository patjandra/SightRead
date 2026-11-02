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
 * signed in. Dismissing the prompt discards it.
 */
export default function AuthProvider({ children }) {
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);
  const [promptOpen, setPromptOpen] = useState(false);
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
    setPromptOpen(false);
    if (pending) {
      try {
        await pending();
      } catch (err) {
        console.error("[SightRead] Action after sign-in failed:", err);
      }
    }
    return user;
  }, []);

  const signOut = useCallback(async () => {
    await apiSignOut().catch(() => {});
    setUser(null);
    setStatus("guest");
  }, []);

  const requireAuth = useCallback(
    (action) => {
      if (user) return action();
      pendingRef.current = action;
      setPromptOpen(true);
    },
    [user]
  );

  const closePrompt = useCallback(() => {
    pendingRef.current = null;
    setPromptOpen(false);
  }, []);

  const value = { status, user, completeSignIn, signOut, requireAuth };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {promptOpen && <SignInPrompt onClose={closePrompt} />}
    </AuthContext.Provider>
  );
}
