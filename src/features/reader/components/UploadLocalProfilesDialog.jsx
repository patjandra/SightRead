import React, { useEffect, useState } from "react";

/**
 * One-time offer shown after a first sign-in on a device: upload the profiles
 * that were created as a guest. Unchecked ones stay on this device only.
 *
 * Props:
 *   profiles  - guest-local profiles being offered
 *   onConfirm - (ids: string[]) => void
 *   onSkip    - () => void
 */
export default function UploadLocalProfilesDialog({ profiles, onConfirm, onSkip }) {
  const [checked, setChecked] = useState(() => new Set(profiles.map((p) => p.id)));

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onSkip();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  function toggle(id) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const count = checked.size;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onSkip()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-local-title"
        className="w-full max-w-sm rounded-xl bg-slate-800 border border-slate-700 p-6 text-slate-100 space-y-4"
      >
        <div className="space-y-1">
          <h2 id="upload-local-title" className="text-lg font-semibold">
            Save your profiles to your account?
          </h2>
          <p className="text-sm text-slate-400">
            These were created on this device. Saved profiles are available on
            any device you sign in on. Anything you leave unchecked stays here.
          </p>
        </div>

        <ul className="space-y-1.5 max-h-48 overflow-y-auto">
          {profiles.map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-slate-700/60 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  className="accent-indigo-500"
                  checked={checked.has(p.id)}
                  onChange={() => toggle(p.id)}
                />
                <span className="truncate flex-1">{p.name}</span>
                {!p.points && <span className="text-xs text-amber-400">uncalibrated</span>}
              </label>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-end gap-2">
          <button onClick={onSkip} className="px-3 py-1.5 text-sm text-slate-400 hover:text-white">
            Not now
          </button>
          <button
            disabled={count === 0}
            onClick={() => onConfirm([...checked])}
            className="px-3 py-1.5 text-sm font-semibold rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600"
          >
            {count === 0 ? "Save" : `Save ${count} ${count === 1 ? "profile" : "profiles"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
