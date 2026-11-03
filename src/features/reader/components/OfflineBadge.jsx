import React from "react";
import { useOnline } from "../../../hooks/useOnline.js";

/** Shown while offline, or while profile changes are waiting to sync. */
export default function OfflineBadge({ pendingCount = 0 }) {
  const online = useOnline();
  if (online && pendingCount === 0) return null;
  const waiting =
    pendingCount > 0
      ? `${pendingCount} ${pendingCount === 1 ? "change" : "changes"} waiting to sync`
      : null;
  return (
    <p role="status" className="text-xs text-amber-400">
      {[!online && "Offline", waiting].filter(Boolean).join(" · ")}
    </p>
  );
}
