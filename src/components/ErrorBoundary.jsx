import React from "react";

/**
 * Catches render/runtime errors anywhere in the tree so a crash shows a
 * readable message (and reload) instead of a blank white page.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surfaced in the console for debugging.
    console.error("[SightRead] Uncaught error:", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      const err = this.state.error;
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100 p-6">
          <div className="max-w-lg w-full bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-xl">
            <h1 className="text-lg font-bold text-red-400 mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-slate-400 mb-4">
              The app hit an unexpected error. Reloading usually fixes it.
            </p>
            <pre className="text-xs bg-slate-900 border border-slate-700 rounded-lg p-3 overflow-auto max-h-48 text-red-300 whitespace-pre-wrap">
              {err.name}: {err.message}
              {err.stack ? "\n\n" + err.stack : ""}
            </pre>
            <button
              className="mt-4 bg-indigo-600 hover:bg-indigo-500 rounded-lg px-4 py-2 text-sm font-semibold"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
