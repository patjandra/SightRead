import React from "react";

// Section heading with a caret; clicking it expands or collapses the section.
export default function SectionToggle({ open, onToggle, children, className = "" }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 focus:outline-none focus-visible:text-white ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={`transition-transform ${open ? "rotate-90" : ""}`}
      >
        <path d="m9 6 6 6-6 6" />
      </svg>
      {children}
    </button>
  );
}
