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
 * Profile record:
 *   { id (UUID), name, createdAt, updatedAt, points, calibrationVersion,
 *     ownerId, syncState, deletedAt }
 *   ownerId     null = guest-local; otherwise the account (user id) it belongs to.
 *   syncState   "local" (guest-only), "synced", or "pending" (needs pushing).
 *   deletedAt   tombstone marker for an account profile whose delete has not
 *               been confirmed by the server yet; hidden from getAllProfiles().
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
const UUID_IDS_KEY = "profileIdsAreUuids";
const UPLOAD_OFFERED_PREFIX = "uploadOffered:";

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

// ─── One-time migrations ──────────────────────────────────────────────────────
// Deduped behind a single promise so concurrent first reads don't double-run
// them. Order matters: localStorage -> IndexedDB first, then ids -> UUIDs.

let migrationPromise = null;

function ensureMigrated(db) {
  if (!migrationPromise) {
    migrationPromise = runMigration(db).then(() => migrateToUuidIds(db));
  }
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Profile ids used to be `Date.now()` strings. Those can collide across devices
 * and aren't accepted by the server, so give every existing profile a UUID,
 * fill in the sync fields, and remap the selected-profile pointer. Runs once.
 * Written with request callbacks (not awaits) so it all stays inside one
 * IndexedDB transaction.
 */
function migrateToUuidIds(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PROFILE_STORE, META_STORE], "readwrite");
    const profiles = transaction.objectStore(PROFILE_STORE);
    const meta = transaction.objectStore(META_STORE);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);

    const flagReq = meta.get(UUID_IDS_KEY);
    flagReq.onsuccess = () => {
      if (flagReq.result?.value) return;
      const allReq = profiles.getAll();
      allReq.onsuccess = () => {
        const selectedReq = meta.get(SELECTED_KEY);
        selectedReq.onsuccess = () => {
          let selected = selectedReq.result?.value ?? null;
          for (const old of allReq.result) {
            const record = normalize(old);
            if (!UUID_RE.test(record.id)) {
              profiles.delete(old.id);
              const newId = crypto.randomUUID();
              if (selected === old.id) selected = newId;
              record.id = newId;
            }
            profiles.put(record);
          }
          if (selected !== null) meta.put({ key: SELECTED_KEY, value: selected });
          meta.put({ key: UUID_IDS_KEY, value: true });
        };
      };
    };
  });
}

/** Fill in fields that records written by older versions don't have. */
function normalize(record) {
  return {
    ...record,
    updatedAt: record.updatedAt ?? record.createdAt ?? new Date().toISOString(),
    ownerId: record.ownerId ?? null,
    syncState: record.syncState ?? "local",
    deletedAt: record.deletedAt ?? null,
  };
}

const byCreated = (a, b) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1;

// ─── Reads ───────────────────────────────────────────────────────────────────

/** Every record, including tombstones. For the sync layer. */
export async function getAllRecords() {
  const db = await openDB();
  await ensureMigrated(db);
  const records = await reqDone(store(db, PROFILE_STORE, "readonly").getAll());
  return records.map(normalize).sort(byCreated);
}

/** One record by id, including a tombstone. For the sync layer. */
export async function getRecord(id) {
  const db = await openDB();
  await ensureMigrated(db);
  const record = await reqDone(store(db, PROFILE_STORE, "readonly").get(id));
  return record ? normalize(record) : undefined;
}

/** Profiles to show: everything except tombstones, oldest first. */
export async function getAllProfiles() {
  return (await getAllRecords()).filter((p) => !p.deletedAt);
}

export async function getProfile(id) {
  const db = await openDB();
  await ensureMigrated(db);
  const record = await reqDone(store(db, PROFILE_STORE, "readonly").get(id));
  return record && !record.deletedAt ? normalize(record) : undefined;
}

// ─── Writes (local only; the sync layer decides when to talk to the server) ──

/** Insert or replace a record as-is (used by sync to adopt remote state). */
export async function putRecord(record) {
  const db = await openDB();
  await ensureMigrated(db);
  const transaction = db.transaction(PROFILE_STORE, "readwrite");
  transaction.objectStore(PROFILE_STORE).put(normalize(record));
  await txDone(transaction);
}

/** Physically remove a record (after its delete is confirmed, or for guests). */
export async function removeRecord(id) {
  const db = await openDB();
  await ensureMigrated(db);
  const transaction = db.transaction(PROFILE_STORE, "readwrite");
  transaction.objectStore(PROFILE_STORE).delete(id);
  await txDone(transaction);
  await reconcileSelected();
}

/**
 * @param {string} name
 * @param {object|null} points
 * @param {{ ownerId?: string|null }} [opts] ownerId set => account profile
 */
export async function createProfile(name, points, { ownerId = null } = {}) {
  const now = new Date().toISOString();
  const profile = {
    id: crypto.randomUUID(),
    name: name.trim() || "Default",
    createdAt: now,
    updatedAt: now,
    points,
    // Only meaningful once points exist; stamp the version they were made with.
    calibrationVersion: points ? CALIBRATION_VERSION : null,
    ownerId,
    syncState: ownerId ? "pending" : "local",
    deletedAt: null,
  };
  await putRecord(profile);
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
    syncState: existing.ownerId ? "pending" : "local",
  };
  await putRecord(updated);
  return updated;
}

/**
 * Delete a profile. Guest-local profiles are removed outright. Account
 * profiles become tombstones until the server confirms the delete, so other
 * devices learn about it.
 */
export async function deleteProfile(id) {
  const existing = await getProfile(id);
  if (!existing) return;

  if (existing.ownerId) {
    const now = new Date().toISOString();
    await putRecord({ ...existing, deletedAt: now, updatedAt: now, syncState: "pending" });
    await reconcileSelected();
  } else {
    await removeRecord(id);
  }
}

/** Make a guest-local profile belong to an account; it then needs uploading. */
export async function claimProfile(id, ownerId) {
  const existing = await getProfile(id);
  if (!existing || existing.ownerId) return existing;
  const claimed = { ...existing, ownerId, syncState: "pending" };
  await putRecord(claimed);
  return claimed;
}

/**
 * Remove account-owned profiles from this device, except those of
 * `keepOwnerId` (pass null on sign-out to remove all of them). Guest-local
 * profiles are never touched. Returns how many records were removed.
 */
export async function purgeAccountRecords(keepOwnerId = null) {
  const db = await openDB();
  await ensureMigrated(db);
  const records = await getAllRecords();
  const doomed = records.filter((r) => r.ownerId && r.ownerId !== keepOwnerId);
  if (doomed.length === 0) return 0;

  const transaction = db.transaction(PROFILE_STORE, "readwrite");
  const profiles = transaction.objectStore(PROFILE_STORE);
  for (const r of doomed) profiles.delete(r.id);
  await txDone(transaction);
  await reconcileSelected();
  return doomed.length;
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

/**
 * If the selected profile no longer exists, fall back to whatever remains.
 * Leaves "nothing selected" alone.
 */
async function reconcileSelected() {
  const selected = await getSelectedProfileId();
  if (!selected) return;
  const remaining = await getAllProfiles();
  if (remaining.some((p) => p.id === selected)) return;
  await setSelectedProfileId(remaining[0]?.id ?? null);
}

// ─── Upload-offer flag ───────────────────────────────────────────────────────
// The one-time "upload your local profiles?" dialog is shown once per account
// per device.

export async function hasOfferedUpload(userId) {
  const db = await openDB();
  await ensureMigrated(db);
  const rec = await reqDone(store(db, META_STORE, "readonly").get(UPLOAD_OFFERED_PREFIX + userId));
  return !!rec?.value;
}

export async function markUploadOffered(userId) {
  const db = await openDB();
  const transaction = db.transaction(META_STORE, "readwrite");
  transaction.objectStore(META_STORE).put({ key: UPLOAD_OFFERED_PREFIX + userId, value: true });
  await txDone(transaction);
}
