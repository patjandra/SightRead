import { useEffect, useRef } from "react";
import { useAuth } from "./useAuth.js";

/**
 * Calls `callback` when a signed-in user signs out (signed-in -> guest). It does
 * not fire on first load, or for a guest who never signed in. Use it to drop
 * anything that belongs to the account, such as an open document.
 */
export function useOnSignOut(callback) {
  const { status } = useAuth();
  const prevRef = useRef(status);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (prevRef.current === "signed-in" && status === "guest") {
      callbackRef.current();
    }
    prevRef.current = status;
  }, [status]);
}
