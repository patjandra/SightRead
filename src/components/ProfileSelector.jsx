import React, { useState, useRef, useEffect } from "react";

/**
 * Dropdown profile picker with inline "create new" form.
 *
 * Props:
 *   profiles    - array of { id, name, points }
 *   selectedId  - currently active profile id or null
 *   onSelect    - (id) => void
 *   onDelete    - (id) => void
 *   onCreate    - (name) => void  — called only after uniqueness check passes
 */
export default function ProfileSelector({
  profiles,
  selectedId,
  onSelect,
  onDelete,
  onCreate,
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
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
                  <span className="flex-1 truncate">{p.name}</span>
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
                      confirmDelete === p.id ? "Click again to confirm delete" : "Delete profile"
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
