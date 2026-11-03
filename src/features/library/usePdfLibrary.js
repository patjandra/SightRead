import { useCallback, useEffect, useState } from "react";
import * as api from "./pdfApi.js";

/**
 * The signed-in user's saved PDFs. Guests have no library: the list is empty
 * and nothing is requested. `onUnauthorized` is called when the API says the
 * session is gone, so the caller can re-check it.
 */
export function usePdfLibrary({ user, onUnauthorized }) {
  const userId = user?.id ?? null;
  const [pdfs, setPdfs] = useState([]);
  const [usage, setUsage] = useState({ usedBytes: 0, limitBytes: 0 });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

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
  }, []);

  useEffect(() => {
    setError(null);
    if (!userId) {
      setPdfs([]);
      setUsage({ usedBytes: 0, limitBytes: 0 });
      return;
    }
    let cancelled = false;
    api
      .listPdfs()
      .then(({ pdfs, usedBytes, limitBytes }) => {
        if (cancelled) return;
        setPdfs(pdfs);
        setUsage({ usedBytes, limitBytes });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 401) onUnauthorized?.();
        setError("Couldn't load your library.");
      });
    return () => {
      cancelled = true;
    };
  }, [userId, onUnauthorized]);

  /** Upload a file; resolves to the stored record. Rejects (and sets `error`) on failure. */
  const save = useCallback(
    async (file) => {
      setError(null);
      setBusy(true);
      try {
        const pdf = await api.uploadPdf(crypto.randomUUID(), file);
        await reload();
        return pdf;
      } catch (err) {
        return fail(err);
      } finally {
        setBusy(false);
      }
    },
    [reload, fail]
  );

  /** Download a saved PDF as a Blob. */
  const open = useCallback(
    async (id) => {
      setError(null);
      try {
        return await api.downloadPdf(id);
      } catch (err) {
        return fail(err);
      }
    },
    [fail]
  );

  const remove = useCallback(
    async (id) => {
      setError(null);
      try {
        await api.deletePdf(id);
        await reload();
      } catch (err) {
        fail(err);
      }
    },
    [reload, fail]
  );

  return { pdfs, ...usage, error, busy, save, open, remove };
}
