import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/useAuth.js";
import { useOnSignOut } from "../auth/useOnSignOut.js";
import {
  MESSAGE_TYPE,
  clearTokens,
  exchangeCode,
  loadTokens,
  refreshTokens,
  saveTokens,
  startLogin,
} from "./spotifyAuth.js";
import { deleteLink, fetchToken, saveLink } from "./spotifyServerLink.js";

const REFRESH_MARGIN_MS = 60_000;

const fromServer = ({ accessToken, expiresIn }) => ({
  access: accessToken,
  expiresAt: Date.now() + expiresIn * 1000,
  remembered: true,
});

/**
 * Spotify login state.
 *
 * Tokens live in sessionStorage (this tab only). With "Remember me" the refresh
 * token is kept encrypted on the SightRead account instead: the browser then
 * only ever holds short-lived access tokens, renewed through the server, and a
 * signed-in user gets Spotify back on their next visit without clicking.
 *
 * status: "signed-out" | "connecting" | "signed-in"
 */
export function useSpotifyAuth() {
  const { status: appStatus } = useAuth();
  const canRemember = appStatus === "signed-in";

  const [tokens, setTokens] = useState(() => loadTokens());
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [remember, setRemember] = useState(false);
  const rememberRef = useRef(remember);
  rememberRef.current = remember && canRemember;
  const restoreTried = useRef(false);

  const adopt = useCallback((next) => {
    saveTokens(next);
    setTokens(next);
  }, []);

  const dropLocal = useCallback(() => {
    clearTokens();
    setTokens(null);
  }, []);

  // Disconnect: forget it here and, if it was remembered, on the account too.
  const logout = useCallback(() => {
    dropLocal();
    setError(null);
    if (canRemember) deleteLink().catch(() => {});
  }, [dropLocal, canRemember]);

  // Remember me, toggled while connected. Ticking saves this login to the account;
  // unticking forgets it there. An unticked remembered login has no refresh token
  // in the browser, so this tab's session simply runs until its token expires.
  const setRemembered = useCallback(
    async (on) => {
      if (!tokens || !canRemember) return;
      setError(null);
      if (on) {
        if (!tokens.refresh) {
          setError("Connect Spotify again to remember it.");
          return;
        }
        try {
          await saveLink(tokens.refresh);
          adopt({ access: tokens.access, expiresAt: tokens.expiresAt, remembered: true });
        } catch {
          setError("Couldn't remember Spotify on your account.");
        }
      } else {
        try {
          await deleteLink();
          adopt({ access: tokens.access, expiresAt: tokens.expiresAt, remembered: false });
        } catch {
          setError("Couldn't update your account. Try again.");
        }
      }
    },
    [tokens, canRemember, adopt]
  );

  // Signing out of SightRead ends the Spotify session in this tab. The remembered
  // login stays on the account, so signing back in restores it.
  useOnSignOut(() => {
    dropLocal();
    setRemember(false);
    restoreTried.current = false;
  });

  // Signed in to SightRead with nothing in this tab: bring back a remembered login.
  useEffect(() => {
    if (appStatus !== "signed-in") {
      restoreTried.current = false;
      return;
    }
    if (tokens || restoreTried.current) return;
    restoreTried.current = true;
    fetchToken()
      .then((minted) => adopt(fromServer(minted)))
      .catch(() => {}); // nothing remembered, or the server is unreachable: show Connect
  }, [appStatus, tokens, adopt]);

  // Finish the login when the popup reports back.
  useEffect(() => {
    const onMessage = async (e) => {
      if (e.origin !== window.location.origin) return;
      if (!e.data || e.data.type !== MESSAGE_TYPE) return;
      if (e.data.error || !e.data.code) {
        setConnecting(false);
        setError("Spotify sign-in was cancelled.");
        return;
      }
      try {
        const next = await exchangeCode(e.data.code, e.data.state);
        setError(null);
        if (rememberRef.current) {
          try {
            await saveLink(next.refresh);
            // The server holds the refresh token now; keep only the access token here.
            adopt({ access: next.access, expiresAt: next.expiresAt, remembered: true });
            return;
          } catch {
            setError("Couldn't remember Spotify on your account.");
          }
        }
        adopt(next);
      } catch (err) {
        setError(err.message);
      } finally {
        setConnecting(false);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [adopt]);

  // Renew shortly before expiry; a failed renewal ends the session in this tab.
  useEffect(() => {
    if (!tokens) return;
    const wait = Math.max(0, tokens.expiresAt - Date.now() - REFRESH_MARGIN_MS);
    const id = setTimeout(async () => {
      try {
        adopt(tokens.remembered ? fromServer(await fetchToken()) : await refreshTokens(tokens.refresh));
      } catch {
        dropLocal();
        setError("Spotify session expired. Connect again.");
      }
    }, wait);
    return () => clearTimeout(id);
  }, [tokens, adopt, dropLocal]);

  const login = useCallback(async () => {
    setError(null);
    setConnecting(true);
    const popup = await startLogin();
    if (!popup) {
      setConnecting(false);
      setError("Allow pop-ups for this site to connect Spotify.");
      return;
    }
    // Re-enable the button if the user closes the popup without finishing.
    const poll = setInterval(() => {
      if (popup.closed) {
        clearInterval(poll);
        setConnecting(false);
      }
    }, 500);
  }, []);

  return {
    status: tokens ? "signed-in" : connecting ? "connecting" : "signed-out",
    accessToken: tokens?.access ?? null,
    error,
    login,
    logout,
    remember,
    setRemember,
    canRemember,
    remembered: !!tokens?.remembered,
    setRemembered,
  };
}
