// Saved PDFs the user has opened, kept on this device so they open without a
// network. Separate IndexedDB database from the profile store. Records are
// keyed by (userId, id) so one account never sees another's files, and the
// whole thing is visible and clearable from the library panel.

const DB_NAME = "sightread-pdfcache";
const STORE = "pdfs";
const META = "meta";
const LAST_USER_KEY = "lastUserId";

/** Total bytes kept; least recently opened files are evicted past this. */
export const MAX_CACHE_BYTES = 100 * 1024 * 1024;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore(STORE, { keyPath: ["userId", "id"] });
      db.createObjectStore(META, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const reqDone = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const txDone = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

async function allRecords() {
  const db = await openDB();
  return reqDone(db.transaction(STORE).objectStore(STORE).getAll());
}

async function deleteKeys(keys) {
  if (keys.length === 0) return;
  const db = await openDB();
  const tx = db.transaction(STORE, "readwrite");
  for (const key of keys) tx.objectStore(STORE).delete(key);
  await txDone(tx);
}

// Stored as raw bytes (not a Blob) so the record is plain structured data.
function toBuffer(blob) {
  if (blob.arrayBuffer) return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

const keyOf = (r) => [r.userId, r.id];
const summary = ({ id, name, size, lastOpenedAt }) => ({ id, name, size, lastOpenedAt });

/** This user's cached files (no file contents), most recently opened first. */
export async function listCached(userId) {
  const records = await allRecords();
  return records
    .filter((r) => r.userId === userId)
    .map(summary)
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

/** The cached file as a Blob, or null. Counts as opening it. */
export async function getCached(userId, id) {
  const db = await openDB();
  const record = await reqDone(db.transaction(STORE).objectStore(STORE).get([userId, id]));
  if (!record) return null;
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put({ ...record, lastOpenedAt: Date.now() });
  await txDone(tx);
  return new Blob([record.data], { type: "application/pdf" });
}

/**
 * Keep a copy of `blob`. Evicts the least recently opened files (across all
 * accounts on this device) to stay under the cap; a file bigger than the cap
 * is not kept. Resolves to whether it was stored.
 */
export async function putCached(userId, { id, name, size }, blob, maxBytes = MAX_CACHE_BYTES) {
  if (blob.size > maxBytes) return false;
  const records = (await allRecords()).filter((r) => !(r.userId === userId && r.id === id));
  records.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt); // newest first
  let total = blob.size;
  const doomed = [];
  for (const r of records) {
    if (total + r.data.byteLength <= maxBytes) total += r.data.byteLength;
    else doomed.push(keyOf(r));
  }
  await deleteKeys(doomed);

  const data = await toBuffer(blob);
  const db = await openDB();
  const tx = db.transaction([STORE, META], "readwrite");
  tx.objectStore(STORE).put({ userId, id, name, size, data, lastOpenedAt: Date.now() });
  tx.objectStore(META).put({ key: LAST_USER_KEY, value: userId });
  await txDone(tx);
  return true;
}

export async function removeCached(userId, id) {
  await deleteKeys([[userId, id]]);
}

/** Drop this user's cached files that are not in `keepIds` (deleted elsewhere). */
export async function retainOnly(userId, keepIds) {
  const keep = new Set(keepIds);
  const records = await allRecords();
  await deleteKeys(records.filter((r) => r.userId === userId && !keep.has(r.id)).map(keyOf));
}

/** Drop every other account's files. */
export async function purgeOtherUsers(keepUserId) {
  const records = await allRecords();
  await deleteKeys(records.filter((r) => r.userId !== keepUserId).map(keyOf));
}

/** Remove everything cached on this device (sign-out, account deletion, Clear). */
export async function clearCache() {
  const db = await openDB();
  const tx = db.transaction([STORE, META], "readwrite");
  tx.objectStore(STORE).clear();
  tx.objectStore(META).clear();
  await txDone(tx);
}

/** Whose files were cached last; used to show them when the session can't be checked offline. */
export async function getLastCachedUser() {
  const db = await openDB();
  const row = await reqDone(db.transaction(META).objectStore(META).get(LAST_USER_KEY));
  return row?.value ?? null;
}
