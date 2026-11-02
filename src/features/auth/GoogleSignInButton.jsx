import React, { useEffect, useRef, useState } from "react";
import { getNonce } from "./authClient.js";
import { loadGoogleIdentity } from "./googleIdentity.js";

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

    (async () => {
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
        if (oneTap) google.accounts.id.prompt();
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not start Google sign-in.");
      }
    })();

    return () => {
      cancelled = true;
      google?.accounts.id.cancel();
    };
  }, [oneTap]);

  if (error) {
    return <p className="text-sm text-red-400 text-center">{error}</p>;
  }
  return <div ref={buttonRef} className="min-h-[44px] flex justify-center" />;
}
