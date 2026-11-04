import React from "react";
import { Link } from "react-router-dom";

/** Shared shell for the static legal pages. */
export default function LegalLayout({ title, updated, children }) {
  return (
    <main className="min-h-screen bg-slate-900 text-slate-200 py-10 px-6">
      <article className="max-w-2xl mx-auto space-y-5 text-sm leading-relaxed">
        <Link to="/" className="text-slate-400 hover:text-white underline underline-offset-4">
          ← Back to SightRead
        </Link>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        <p className="text-xs text-slate-500">Last updated: {updated}</p>
        {children}
      </article>
    </main>
  );
}

export function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}
