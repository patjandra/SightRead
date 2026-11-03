import React, { useState } from "react";

const MB = 1024 * 1024;
// Past this many PDFs the list scrolls inside a fixed height and gains a search box.
const SCROLL_AFTER = 5;

const formatSize = (bytes) =>
  bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Control-panel section for the account's saved PDFs: save the open file, reopen
 * or delete saved ones, and see how much storage is used.
 */
export default function PdfLibrarySection({
  signedIn,
  showList = signedIn,
  pdfs,
  offlineCount = 0,
  offlineBytes = 0,
  onClearOffline,
  usedBytes,
  limitBytes,
  error,
  busy,
  canSave,
  onSave,
  onOpen,
  onDelete,
  activeId,
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const visible = needle ? pdfs.filter((p) => p.name.toLowerCase().includes(needle)) : pdfs;
  const many = pdfs.length > SCROLL_AFTER;

  return (
    <section className="space-y-1.5">
      {canSave && (
        <button
          onClick={onSave}
          disabled={busy}
          className="w-full text-left bg-slate-700/60 hover:bg-slate-700 disabled:opacity-60 border border-slate-600 rounded-lg px-3 py-1.5 text-xs transition-colors"
        >
          {busy ? "Saving…" : signedIn ? "Save to account" : "Sign in to save to account"}
        </button>
      )}
      {error && <p className="text-xs text-red-400 leading-snug">{error}</p>}

      {showList && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 pt-1">
            Your library
          </p>
          {pdfs.length === 0 ? (
            <p className="text-xs text-slate-500">No saved PDFs yet.</p>
          ) : (
            <>
              {many && (
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your PDFs"
                  aria-label="Search your PDFs"
                  className="w-full rounded-md bg-slate-900/60 border border-slate-600 px-2 py-1 text-xs placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              )}
              {visible.length === 0 && (
                <p className="text-xs text-slate-500">No PDFs match "{query.trim()}".</p>
              )}
            <ul className={`space-y-1 ${many ? "max-h-56 overflow-y-auto pr-1 sr-scroll" : ""}`}>
              {visible.map((pdf) => (
                <li
                  key={pdf.id}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                    pdf.id === activeId ? "border-indigo-500/60 bg-indigo-500/10" : "border-slate-700"
                  }`}
                >
                  <button
                    onClick={() => onOpen(pdf)}
                    className="min-w-0 flex-1 text-left hover:text-white"
                    title={`Open ${pdf.name}`}
                  >
                    <span className="block truncate">{pdf.name}</span>
                    <span className="text-[10px] text-slate-500">
                      {formatSize(pdf.size)}
                      {pdf.offline && " · Saved offline"}
                    </span>
                  </button>
                  <button
                    onClick={() => onDelete(pdf)}
                    className="text-slate-500 hover:text-red-400 px-1"
                    aria-label={`Delete ${pdf.name}`}
                    title="Delete"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            </>
          )}
          {offlineCount > 0 && (
            <p className="text-[10px] text-slate-500 flex items-center justify-between gap-2">
              <span>
                Kept on this device: {offlineCount} {offlineCount === 1 ? "file" : "files"},{" "}
                {formatSize(offlineBytes)}
              </span>
              <button
                onClick={onClearOffline}
                className="underline hover:text-slate-300 shrink-0"
              >
                Clear
              </button>
            </p>
          )}
          {limitBytes > 0 && (
            <div>
              <div className="h-1 rounded bg-slate-700 overflow-hidden">
                <div
                  className="h-full bg-indigo-500"
                  style={{ width: `${Math.min(100, (usedBytes / limitBytes) * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {formatSize(usedBytes)} of {formatSize(limitBytes)} used
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
