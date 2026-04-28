const STORAGE_KEY = "sightread_profiles";
const SELECTED_KEY = "sightread_selected_profile";

// ─── Profile CRUD ─────────────────────────────────────────────────────────────

export function loadProfiles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveProfiles(profiles) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export function loadSelectedProfileId() {
  return localStorage.getItem(SELECTED_KEY) || null;
}

export function saveSelectedProfileId(id) {
  localStorage.setItem(SELECTED_KEY, id);
}

export function createProfile(name, points) {
  const profile = {
    id: Date.now().toString(),
    name: name.trim() || "Default",
    createdAt: new Date().toISOString(),
    points,
  };
  const existing = loadProfiles();
  saveProfiles([...existing, profile]);
  return profile;
}

export function updateProfile(id, points) {
  const profiles = loadProfiles();
  const updated = profiles.map((p) =>
    p.id === id ? { ...p, points, updatedAt: new Date().toISOString() } : p
  );
  saveProfiles(updated);
  return updated.find((p) => p.id === id);
}

export function deleteProfile(id) {
  const profiles = loadProfiles().filter((p) => p.id !== id);
  saveProfiles(profiles);
  const selected = loadSelectedProfileId();
  if (selected === id) {
    const next = profiles[0];
    saveSelectedProfileId(next ? next.id : null);
  }
}

// ─── Calibration mapping ───────────────────────────────────────────────────────

/**
 * Piecewise linear map: raw gaze value → [0,1] screen position.
 *
 * Calibration anchors:
 *   points.top    → calibrated 0
 *   points.center → calibrated 0.5
 *   points.bottom → calibrated 1
 *
 * @param {number} rawY
 * @param {{ points: { top: number, center: number, bottom: number } }} profile
 * @returns {number|null}
 */
export function mapRawToCalibratedY(rawY, profile) {
  if (!profile || !profile.points) return null;

  const { top, center, bottom } = profile.points;

  if (
    typeof top !== "number" ||
    typeof center !== "number" ||
    typeof bottom !== "number" ||
    isNaN(top) ||
    isNaN(center) ||
    isNaN(bottom)
  ) {
    return null;
  }

  let calibrated;

  // Upper segment: top → center maps to 0 → 0.5
  if (rawY <= center) {
    const range = center - top;
    if (Math.abs(range) < 1e-6) {
      calibrated = 0.5;
    } else {
      calibrated = ((rawY - top) / range) * 0.5;
    }
  } else {
    // Lower segment: center → bottom maps to 0.5 → 1
    const range = bottom - center;
    if (Math.abs(range) < 1e-6) {
      calibrated = 0.5;
    } else {
      calibrated = 0.5 + ((rawY - center) / range) * 0.5;
    }
  }

  if (!isFinite(calibrated) || isNaN(calibrated)) return null;

  return Math.min(1, Math.max(0, calibrated));
}
