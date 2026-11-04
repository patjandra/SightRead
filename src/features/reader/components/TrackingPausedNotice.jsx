import React from "react";

/**
 * Brief top-center notice about tracking: paused because the user scrolled, or
 * why tracking couldn't start. `kind` picks the icon and colour.
 */
export default function TrackingPausedNotice({ show, message, kind = "paused" }) {
  if (!show) return null;
  const alert = kind === "alert";
  return (
    <div
      role="status"
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg shadow-lg ring-1 ring-black/10 ${
        alert ? "bg-amber-500 text-slate-900" : "bg-slate-100 text-slate-900"
      }`}
    >
      {alert ? (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      )}
      {message}
    </div>
  );
}
