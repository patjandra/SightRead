import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./pdfApi.js";
import { useOnline } from "../../hooks/useOnline.js";
import * as cache from "./offlineCache.js";

const POLL_MS = 15_000;
const MIN_GAP_MS = 2_000;

// A failing cache must never break the library; it only costs offline access.
const quietly = (promise) => promise.catch((err) => console.error("[SightRead] Offline cache:", err));

/**
 * The signed-in user's saved PDFs. Guests have no library: the list is empty
 * and nothing is requested. `onUnauthorized` is called when the API says the
 * session is gone, so the caller can re-check it.
 *
 * Opened PDFs are also kept on this device (offlineCache.js) so they open with
 * no network. `authStatus` / `sessionUnknown` say whether the session check has
 * finished and whether it failed: when the API can't be reached the last
 * cached account's files are listed, and only a confirmed sign-out clears them.
 */
export function usePdfLibrary({ user, authStatus = "loading", sessionUnknown = false, onUnauthorized }) {
  const online = useOnline();
  const userId = user?.id ?? null;
  const [pdfs, setPdfs] = useState([]);
  const [usage, setUsage] = useState({ usedBytes: 0, limitBytes: 0 });
  const [error, setError] = useState(null);
  // A non-error heads-up, e.g. the file was already in the library.
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  // Cached files for the account whose library is showing: id -> summary.
  const [cached, setCached] = useState(new Map());
  // Whose files are shown without a confirmed session (offline start-up).
  const [offlineUserId, setOfflineUserId] = useState(null);
  const [fromCache, setFromCache] = useState(false);
  const cacheUserId = userId ?? offlineUserId;

  const refreshCached = useCallback(async (uid) => {
    const list = uid ? await cache.listCached(uid) : [];
    setCached(new Map(list.map((c) => [c.id, c])));
    return list;
  }, []);

  const fail = useCallback(
    (err) => {
      if (err.status === 401) onUnauthorized?.();
      setError(err.message || "Something went wrong.");
      throw err;
    },
    [onUnauthorized]
  );

  const reload = useCallback(async () => {
    const { pdfs, usedBytes, limitBytes } = await api.listPdfs();
    setPdfs(pdfs);
    setUsage({ usedBytes, limitBytes });
    setFromCache(false);
    if (userId) {
      quietly(cache.retainOnly(userId, pdfs.map((p) => p.id)).then(() => refreshCached(userId)));
    }
  }, [userId, refreshCached]);

  useEffect(() => {
    setError(null);
    if (!userId) {
      setPdfs([]);
      setUsage({ usedBytes: 0, limitBytes: 0 });
      setFromCache(false);
      return;
    }
    let cancelled = false;
    api
      .listPdfs()
      .then(({ pdfs, usedBytes, limitBytes }) => {
        if (cancelled) return;
        setPdfs(pdfs);
        setUsage({ usedBytes, limitBytes });
        setFromCache(false);
        // Mirror the server: drop copies of files deleted elsewhere, and any other account's.
        quietly(
          cache
            .purgeOtherUsers(userId)
            .then(() => cache.retainOnly(userId, pdfs.map((p) => p.id)))
            .then(() => refreshCached(userId))
        );
      })
      .catch(async (err) => {
        if (cancelled) return;
        if (err.status === 401) onUnauthorized?.();
        const list = await cache.listCached(userId).catch(() => []);
        if (cancelled) return;
        if (list.length > 0) {
          setPdfs(list.map(({ id, name, size }) => ({ id, name, size })));
          setFromCache(true);
          setCached(new Map(list.map((c) => [c.id, c])));
        }
        setError(
          err.status === 401 || list.length === 0
            ? "Couldn't load your library."
            : "Offline: showing the files saved on this device."
        );
      });
    return () => {
      cancelled = true;
    };
  }, [userId, onUnauthorized, refreshCached]);

  // No session to check (offline start-up): show the files kept for the last
  // account on this device. A confirmed guest has no cached files at all.
  useEffect(() => {
    if (userId) {
      setOfflineUserId(null);
      return;
    }
    if (authStatus === "guest" && !sessionUnknown) {
      setOfflineUserId(null);
      setCached(new Map());
      quietly(cache.clearCache());
      return;
    }
    if (authStatus === "guest" && sessionUnknown) {
      let cancelled = false;
      quietly(
        cache.getLastCachedUser().then(async (uid) => {
          if (cancelled || !uid) return;
          const list = await cache.listCached(uid);
          if (cancelled || list.length === 0) return;
          setOfflineUserId(uid);
          setPdfs(list.map(({ id, name, size }) => ({ id, name, size })));
          setCached(new Map(list.map((c) => [c.id, c])));
          setFromCache(true);
        })
      );
      return () => {
        cancelled = true;
      };
    }
  }, [userId, authStatus, sessionUnknown]);

  // Pick up changes made on other devices: re-fetch when the tab regains focus
  // and every POLL_MS while it is visible. Failures are silent; the next tick retries.
  useEffect(() => {
    if (!userId || !online) return;
    let last = Date.now();
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < MIN_GAP_MS) return;
      last = Date.now();
      reload().catch((err) => {
        if (err.status === 401) onUnauthorized?.();
      });
    };
    const timer = setInterval(refreshIfVisible, POLL_MS);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [userId, online, reload, onUnauthorized]);

  // Back online: refresh straight away rather than waiting for the next tick.
  const wasOnlineRef = useRef(online);
  useEffect(() => {
    const cameBack = online && !wasOnlineRef.current;
    wasOnlineRef.current = online;
    if (cameBack && userId) {
      reload().catch((err) => {
        if (err.status === 401) onUnauthorized?.();
      });
    }
  }, [online, userId, reload, onUnauthorized]);

  /** Upload a file; resolves to the stored record. Rejects (and sets `error`) on failure. */
  const save = useCallback(
    async (file, accountUser = null) => {
      setError(null);
      setNotice(null);
      setBusy(true);
      try {
        // Already have this exact file? Skip the upload. (The server checks too,
        // so a stale list or another device can't create a second copy.)
        const sha256 = await api.fileSha256(file).catch(() => null);
        const known = sha256 && pdfs.find((p) => p.sha256 === sha256);
        const { pdf, duplicate } = known
          ? { pdf: known, duplicate: true }
          : await api.uploadPdf(crypto.randomUUID(), file);
        if (duplicate) setNotice(`Already in your library as "${pdf.name}".`);
        // The file is already in hand, so keep a copy for offline use right away.
        // `accountUser` is passed when saving as the continuation of sign-in, when
        // this hook's own user is still the pre-sign-in one.
        const uid = accountUser?.id ?? cacheUserId;
        if (uid) {
          await quietly(cache.putCached(uid, pdf, file));
          await quietly(refreshCached(uid));
        }
        await reload();
        return pdf;
      } catch (err) {
        return fail(err);
      } finally {
        setBusy(false);
      }
    },
    [reload, fail, cacheUserId, refreshCached, pdfs]
  );

  /**
   * A saved PDF as a Blob: the copy on this device if there is one, otherwise
   * downloaded (and kept for next time).
   */
  const open = useCallback(
    async (id) => {
      setError(null);
      const uid = cacheUserId;
      if (uid) {
        const local = await cache.getCached(uid, id).catch(() => null);
        if (local) return local;
      }
      try {
        const blob = await api.downloadPdf(id);
        const meta = pdfs.find((p) => p.id === id);
        if (uid && meta) {
          quietly(
            cache.putCached(uid, meta, blob).then(() => refreshCached(uid))
          );
        }
        return blob;
      } catch (err) {
        if (!err.status) {
          setError("This PDF isn't available offline.");
          throw err;
        }
        return fail(err);
      }
    },
    [cacheUserId, pdfs, fail, refreshCached]
  );

  const remove = useCallback(
    async (id) => {
      setError(null);
      try {
        await api.deletePdf(id);
        if (cacheUserId) quietly(cache.removeCached(cacheUserId, id));
        await reload();
      } catch (err) {
        fail(err);
      }
    },
    [reload, fail, cacheUserId]
  );

  const offlineBytes = [...cached.values()].reduce((n, c) => n + c.size, 0);

  return {
    // `showList`: there is a library to show, even if the session can't be confirmed.
    showList: !!cacheUserId,
    fromCache,
    pdfs: pdfs.map((p) => ({ ...p, offline: cached.has(p.id) })),
    ...usage,
    offlineCount: cached.size,
    offlineBytes,
    error,
    notice,
    busy,
    save,
    open,
    remove,
  };
}
