import React from "react";

export default function TrackingWarning({ show }) {
  if (!show) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded shadow-lg">
      Tracking lost. Recenter face or recalibrate.
    </div>
  );
}
