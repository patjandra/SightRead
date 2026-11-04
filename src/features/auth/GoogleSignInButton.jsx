import React, { useEffect, useRef, useState } from "react";
import { getNonce } from "./authClient.js";
import { loadGoogleIdentity } from "./googleIdentity.js";

// Server nonce cookie TTL is 5 min (worker/services/session.js); refresh sooner.
const NONCE_REFRESH_MS = 3 * 60 * 1000;

/**
 * Renders Google's sign-in button (and optionally One Tap). Fetches a fresh
 * nonce first so the resulting ID token is bound to this browser.
 *
 * Props:
 *   onCredential - (credential: string) => void
 *   oneTap       - also show the One Tap prompt
 */
export default function GoogleSignInButton({ onCredential, oneTap = false }) {
  const buttonRef = useRef(null);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;
  const [error, setError] = useState(null);

  useEffect(() => {
    // `cancelled` guards against StrictMode's double mount: only the latest
    // effect may initialize, so the nonce cookie and the GIS config agree.
    let cancelled = false;
    let google = null;
    let lastIssued = Date.now();

    // (Re)issue a nonce and point GIS at it. The nonce cookie lives only a few
    // minutes, so this reruns before it expires and when the tab is shown again;
    // otherwise a click on a long-open page would fail with "Sign-in expired".
    async function setup(first) {
      try {
        const [{ nonce, clientId }, loaded] = await Promise.all([
          getNonce(),
          loadGoogleIdentity(),
        ]);
        if (cancelled) return;
        google = loaded;

        google.accounts.id.initialize({
          client_id: clientId,
          nonce,
          callback: (response) => callbackRef.current?.(response.credential),
          auto_select: false,
          use_fedcm_for_prompt: true,
        });
        google.accounts.id.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          width: 260,
        });
        if (first && oneTap) google.accounts.id.prompt();
        lastIssued = Date.now();
      } catch (err) {
        if (first && !cancelled) setError(err.message || "Could not start Google sign-in.");
      }
    }

    const maybeRefresh = () => {
      if (!cancelled && Date.now() - lastIssued > NONCE_REFRESH_MS) setup(false);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") maybeRefresh();
    };

    setup(true);
    const timer = setInterval(maybeRefresh, 60 * 1000);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      google?.accounts.id.cancel();
    };
  }, [oneTap]);

  if (error) {
    return <p className="text-sm text-red-400 text-center">{error}</p>;
  }
  return <div ref={buttonRef} className="min-h-[44px] flex justify-center" />;
}
