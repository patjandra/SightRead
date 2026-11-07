import React, { useState, useRef, useEffect } from "react";

// Matches the server's profile name limit (worker/services/calibrations.js).
const MAX_NAME_LENGTH = 100;

/**
 * Dropdown profile picker with inline "create new" form.
 *
 * Props:
 *   profiles    - array of { id, name, points }
 *   selectedId  - currently active profile id or null
 *   onSelect    - (id) => void
 *   onDelete    - (id) => void
 *   onRename    - (id, name) => void  — trimmed, non-empty, changed names only
 *   onCreate    - (name) => void  — called only after uniqueness check passes
 *   syncStatus  - "idle" | "syncing" | "error" (account sync, if signed in)
 *   onSaveToAccount - (id) => void  — guest-local profile's "save to account"
 *   onRetrySync - () => void
 */

// Small cloud icons for a profile's sync state. All share one frame so the row
// doesn't shift as a profile moves between states.
function CloudIcon({ children }) {
  return (
    <svg
      viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.78A6 6 0 1 0 6 18.5" />
      {children}
    </svg>
  );
}

function SyncControl({ profile, selected, syncStatus, onSaveToAccount, onRetrySync }) {
  const idle = selected ? "text-indigo-200 hover:text-white" : "text-slate-500 hover:text-slate-200";
  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };

  if (profile.syncState === "synced") {
    return (
      <span className="text-emerald-400 flex-shrink-0" title="Saved to your account">
        <CloudIcon><path d="m9 15 2 2 4-4" /></CloudIcon>
      </span>
    );
  }

  if (profile.syncState === "pending") {
    return syncStatus === "error" ? (
      <button
        className="text-amber-400 hover:text-amber-300 flex-shrink-0"
        onClick={stop(onRetrySync)}
        title="Not synced yet. Click to retry."
        aria-label="Not synced yet. Retry."
      >
        <CloudIcon><path d="M12 12v3" /><path d="M12 18h.01" /></CloudIcon>
      </button>
    ) : (
      <span className={`flex-shrink-0 animate-pulse ${selected ? "text-indigo-200" : "text-slate-400"}`} title="Syncing…">
        <CloudIcon><path d="M12 12v4" /></CloudIcon>
      </span>
    );
  }

  // "local": only on this device. Saving needs an account.
  return (
    <button
      className={`flex-shrink-0 ${idle}`}
      onClick={stop(() => onSaveToAccount?.(profile.id))}
      title="Save to account"
      aria-label={`Save ${profile.name} to account`}
    >
      <CloudIcon><path d="M12 16v-5" /><path d="m9.5 13 2.5-2.5 2.5 2.5" /></CloudIcon>
    </button>
  );
}
export default function ProfileSelector({
  profiles,
  selectedId,
  onSelect,
  onDelete,
  onRename,
  onCreate,
  syncStatus = "idle",
  onSaveToAccount,
  onRetrySync,
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  const editDoneRef = useRef(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selected = profiles.find((p) => p.id === selectedId) || null;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setConfirmDelete(null);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Focus input when dropdown opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) {
      setNameError("Enter a name.");
      return;
    }
    const duplicate = profiles.some(
      (p) => p.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      setNameError(`"${trimmed}" already exists.`);
      return;
    }
    onCreate(trimmed);
    setNewName("");
    setNameError("");
    setOpen(false);
  }

  function handleDeleteClick(id, e) {
    e.stopPropagation();
    if (confirmDelete === id) {
      onDelete(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
    }
  }

  function startRename(p, e) {
    e.stopPropagation();
    editDoneRef.current = false;
    setConfirmDelete(null);
    setDraft(p.name);
    setEditingId(p.id);
  }

  // Enter and blur both land here; the ref keeps the second one from re-saving.
  function finishRename(p, save) {
    if (editDoneRef.current) return;
    editDoneRef.current = true;
    setEditingId(null);
    const trimmed = draft.trim();
    if (save && trimmed && trimmed !== p.name) onRename?.(p.id, trimmed);
  }

  function handleSelect(id) {
    onSelect(id);
    setOpen(false);
    setConfirmDelete(null);
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        className="w-full flex items-center justify-between gap-2 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm hover:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate text-left flex-1">
          {selected ? (
            <span>
              {selected.name}
              {!selected.points && (
                <span className="ml-1 text-amber-400 text-xs">· uncalibrated</span>
              )}
            </span>
          ) : (
            <span className="text-slate-400">Select profile…</span>
          )}
        </span>
        <svg
          viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`text-slate-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
          {/* Profile list */}
          {profiles.length > 0 && (
            <ul className="sr-scroll max-h-44 overflow-y-auto p-1">
              {profiles.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm select-none ${
                    p.id === selectedId
                      ? "bg-indigo-600 text-white"
                      : "text-slate-200 hover:bg-slate-700"
                  }`}
                  onClick={() => handleSelect(p.id)}
                >
                  {/* Calibration indicator */}
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      p.points ? "bg-emerald-400" : "bg-amber-400"
                    }`}
                    title={p.points ? "Calibrated" : "Not calibrated"}
                  />
                  {editingId === p.id ? (
                    <input
                      autoFocus
                      className="flex-1 min-w-0 bg-slate-900 text-slate-100 border border-slate-600 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-indigo-500"
                      value={draft}
                      maxLength={MAX_NAME_LENGTH}
                      aria-label={`New name for ${p.name}`}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setDraft(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => finishRename(p, true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") finishRename(p, true);
                        else if (e.key === "Escape") {
                          e.stopPropagation();
                          finishRename(p, false);
                        }
                      }}
                    />
                  ) : (
                    <>
                      <span className="flex-1 truncate">{p.name}</span>
                      <button
                        className={`flex-shrink-0 ${
                          p.id === selectedId
                            ? "text-indigo-200 hover:text-white"
                            : "text-slate-500 hover:text-slate-200"
                        }`}
                        onClick={(e) => startRename(p, e)}
                        title="Rename profile"
                        aria-label={`Rename ${p.name}`}
                      >
                        <svg
                          viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                        >
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                    </>
                  )}
                  <SyncControl
                    profile={p}
                    selected={p.id === selectedId}
                    syncStatus={syncStatus}
                    onSaveToAccount={onSaveToAccount}
                    onRetrySync={onRetrySync}
                  />
                  <button
                    className={`text-xs flex-shrink-0 px-1 rounded ${
                      confirmDelete === p.id
                        ? "text-red-300 font-bold"
                        : p.id === selectedId
                        ? "text-indigo-200 hover:text-white"
                        : "text-slate-500 hover:text-red-400"
                    }`}
                    onClick={(e) => handleDeleteClick(p.id, e)}
                    title={
                      confirmDelete === p.id
                        ? "Click again to confirm delete"
                        : p.ownerId
                        ? "Delete profile (also removes it from your account)"
                        : "Delete profile"
                    }
                  >
                    {confirmDelete === p.id ? "sure?" : "✕"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Create new */}
          <div className="border-t border-slate-700 p-2 flex flex-col gap-1.5">
            <input
              ref={inputRef}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50"
              placeholder="New profile name…"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setNameError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            {nameError && (
              <p className="text-xs text-red-400">{nameError}</p>
            )}
            <button
              className="w-full bg-indigo-600 hover:bg-indigo-500 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors"
              onClick={handleCreate}
            >
              Create profile
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
