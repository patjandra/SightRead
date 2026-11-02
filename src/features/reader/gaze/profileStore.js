/**
 * Durable local persistence for calibration profiles, backed by IndexedDB.
 *
 * Why IndexedDB (not localStorage, not SQLite):
 *   localStorage is synchronous, string-only, and easy to clobber. IndexedDB is
 *   a real structured store — transactional, per-object, and far larger — while
 *   still being built into every browser with zero dependencies. (A WASM SQLite
 *   build would work too, but it's hundreds of KB and needs a Web Worker + OPFS;
 *   for a handful of small profile records that's more than the data warrants.)
 *
 * Schema (DB "sightread", version 1):
 *   profiles  — keyPath "id"; one record per calibration profile.
 *   meta      — keyPath "key"; small key/value rows (selected profile id, the
 *               migration flag).
 *
 * All exports are async (they return Promises); the consuming hook hydrates
 * React state from them on mount and writes through on every mutation.
 */

import { CALIBRATION_VERSION } from "../../../config.js";

const DB_NAME = "sightread";
const DB_VERSION = 1;
const PROFILE_STORE = "profiles";
const META_STORE = "meta";

const SELECTED_KEY = "selectedProfileId";
const MIGRATED_KEY = "migratedFromLocalStorage";

// Pre-IndexedDB localStorage keys, read once to migrate any existing profiles.
const LEGACY_PROFILES_KEY = "sightread_profiles";
const LEGACY_SELECTED_KEY = "sightread_selected_profile";

// ─── Low-level IndexedDB plumbing ────────────────────────────────────────────

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PROFILE_STORE)) {
        db.createObjectStore(PROFILE_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Resolve when a single request succeeds (for reads). */
function reqDone(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Resolve when a transaction fully commits (for writes). */
function txDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function store(db, name, mode) {
  return db.transaction(name, mode).objectStore(name);
}

// ─── One-time migration from the old localStorage layout ─────────────────────
// Deduped behind a single promise so concurrent first reads don't double-run it.

let migrationPromise = null;

function ensureMigrated(db) {
  if (!migrationPromise) migrationPromise = runMigration(db);
  return migrationPromise;
}

async function runMigration(db) {
  const flag = await reqDone(store(db, META_STORE, "readonly").get(MIGRATED_KEY));
  if (flag?.value) return;

  // Pull whatever the old localStorage keys held (tolerating malformed JSON).
  let legacyProfiles = [];
  let legacySelected = null;
  try {
    const raw = localStorage.getItem(LEGACY_PROFILES_KEY);
    legacyProfiles = raw ? JSON.parse(raw) : [];
    legacySelected = localStorage.getItem(LEGACY_SELECTED_KEY);
  } catch {
    legacyProfiles = [];
  }

  const transaction = db.transaction([PROFILE_STORE, META_STORE], "readwrite");
  const profiles = transaction.objectStore(PROFILE_STORE);
  for (const p of legacyProfiles) {
    if (p && p.id) profiles.put(p);
  }
  const meta = transaction.objectStore(META_STORE);
  if (legacySelected) meta.put({ key: SELECTED_KEY, value: legacySelected });
  // Stamp the flag so a later "deleted all profiles" state isn't re-seeded from
  // the stale localStorage copy on the next load.
  meta.put({ key: MIGRATED_KEY, value: true });
  await txDone(transaction);
}

// ─── Profile CRUD (async) ────────────────────────────────────────────────────

export async function getAllProfiles() {
  const db = await openDB();
  await ensureMigrated(db);
  return reqDone(store(db, PROFILE_STORE, "readonly").getAll());
}

export async function getProfile(id) {
  const db = await openDB();
  return reqDone(store(db, PROFILE_STORE, "readonly").get(id));
}

export async function createProfile(name, points) {
  const profile = {
    id: Date.now().toString(),
    name: name.trim() || "Default",
    createdAt: new Date().toISOString(),
    points,
    // Only meaningful once points exist; stamp the version they were made with.
    calibrationVersion: points ? CALIBRATION_VERSION : null,
  };
  const db = await openDB();
  const transaction = db.transaction(PROFILE_STORE, "readwrite");
  transaction.objectStore(PROFILE_STORE).put(profile);
  await txDone(transaction);
  return profile;
}

export async function updateProfile(id, points) {
  const existing = await getProfile(id);
  if (!existing) return undefined;
  const updated = {
    ...existing,
    points,
    calibrationVersion: CALIBRATION_VERSION,
    updatedAt: new Date().toISOString(),
  };
  const db = await openDB();
  const transaction = db.transaction(PROFILE_STORE, "readwrite");
  transaction.objectStore(PROFILE_STORE).put(updated);
  await txDone(transaction);
  return updated;
}

export async function deleteProfile(id) {
  const db = await openDB();
  const transaction = db.transaction(PROFILE_STORE, "readwrite");
  transaction.objectStore(PROFILE_STORE).delete(id);
  await txDone(transaction);

  // If the deleted profile was selected, fall back to whatever remains.
  const selected = await getSelectedProfileId();
  if (selected === id) {
    const remaining = await getAllProfiles();
    await setSelectedProfileId(remaining[0] ? remaining[0].id : null);
  }
}

// ─── Selected-profile pointer ────────────────────────────────────────────────

export async function getSelectedProfileId() {
  const db = await openDB();
  await ensureMigrated(db);
  const rec = await reqDone(store(db, META_STORE, "readonly").get(SELECTED_KEY));
  return rec?.value ?? null;
}

export async function setSelectedProfileId(id) {
  const db = await openDB();
  const transaction = db.transaction(META_STORE, "readwrite");
  const meta = transaction.objectStore(META_STORE);
  if (id == null) meta.delete(SELECTED_KEY);
  else meta.put({ key: SELECTED_KEY, value: id });
  await txDone(transaction);
}
