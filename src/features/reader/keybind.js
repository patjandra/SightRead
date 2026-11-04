// A keyboard shortcut is stored as { code, ctrl, alt, shift, meta }. `code` is the
// physical key (KeyboardEvent.code), so it doesn't change with keyboard layout.

// Keys that scroll the page. Binding one would make the shortcut count as a
// manual scroll, so they can't be used.
const SCROLL_KEYS = new Set([
  "Space", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End",
]);
const MODIFIER_CODES = /^(Shift|Control|Alt|Meta)(Left|Right)$/;

export const isScrollKey = (code) => SCROLL_KEYS.has(code);

/** True for events that scroll the reader when pressed outside a text field. */
export const isScrollKeyEvent = (e) => !e.ctrlKey && !e.altKey && !e.metaKey && SCROLL_KEYS.has(e.code);

/** Turn a keydown into a binding, or null for a bare modifier press. */
export function eventToBinding(e) {
  if (MODIFIER_CODES.test(e.code)) return null;
  return { code: e.code, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
}

export function matchesBinding(binding, e) {
  return (
    !!binding &&
    e.code === binding.code &&
    e.ctrlKey === binding.ctrl &&
    e.altKey === binding.alt &&
    e.shiftKey === binding.shift &&
    e.metaKey === binding.meta
  );
}

export function formatBinding(binding) {
  if (!binding) return "";
  const key = binding.code
    .replace(/^Key/, "")
    .replace(/^Digit/, "")
    .replace(/^Arrow/, "");
  return [
    binding.ctrl && "Ctrl",
    binding.alt && "Alt",
    binding.shift && "Shift",
    binding.meta && "Cmd",
    key,
  ]
    .filter(Boolean)
    .join("+");
}

/** Whether a keyboard event came from somewhere the user is typing. */
export function isTypingTarget(target) {
  const tag = target?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!target?.isContentEditable;
}

// The chosen shortcut is a device preference with no account data, so it stays
// in localStorage like the sidebar section state.
const STORAGE_KEY = "sightread-tracking-key";

export function loadBinding() {
  try {
    const b = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return b && typeof b.code === "string" ? { ctrl: false, alt: false, shift: false, meta: false, ...b } : null;
  } catch {
    return null;
  }
}

export function saveBinding(binding) {
  try {
    if (binding) localStorage.setItem(STORAGE_KEY, JSON.stringify(binding));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: the shortcut still works for this visit.
  }
}
