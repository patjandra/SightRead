import React from "react";

const MB = 1024 * 1024;
const formatSize = (bytes) =>
  bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Control-panel section for the account's saved PDFs: save the open file, reopen
 * or delete saved ones, and see how much storage is used.
 */
export default function PdfLibrarySection({
  signedIn,
  pdfs,
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

      {signedIn && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 pt-1">
            Your library
          </p>
          {pdfs.length === 0 ? (
            <p className="text-xs text-slate-500">No saved PDFs yet.</p>
          ) : (
            <ul className="space-y-1">
              {pdfs.map((pdf) => (
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
                    <span className="text-[10px] text-slate-500">{formatSize(pdf.size)}</span>
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
