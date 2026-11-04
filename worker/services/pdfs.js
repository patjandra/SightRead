// All PDF SQL and R2 access lives here; routes never touch D1 or R2 directly.
import { ApiError } from "../errors.js";

export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_USER_BYTES = 500 * 1024 * 1024;
export const MAX_PDFS_PER_USER = 100;
const MAX_NAME_LENGTH = 200;
const MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

const COLUMNS = "id, name, size, sha256, created_at AS createdAt";

/** Trim, drop control characters, and bound the length of a client-supplied filename. */
export function cleanName(raw) {
  let decoded = "";
  try {
    decoded = decodeURIComponent(raw ?? "");
  } catch {
    // fall through to the empty-name error
  }
  const name = decoded.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_NAME_LENGTH);
  if (!name) throw new ApiError(400, "invalid_name", "A file name is required.");
  return name;
}

export function hasPdfMagic(bytes) {
  return bytes.length >= MAGIC.length && MAGIC.every((b, i) => bytes[i] === b);
}

/**
 * Read a request body into memory, refusing to buffer more than `limit` bytes
 * no matter what Content-Length claims.
 */
export async function readCapped(request, limit) {
  const declared = request.headers.get("Content-Length");
  if (declared === null || !/^\d+$/.test(declared)) {
    throw new ApiError(411, "length_required", "Content-Length is required.");
  }
  if (Number(declared) > limit) throw tooLarge();
  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

const tooLarge = () =>
  new ApiError(413, "too_large", `PDFs can be at most ${MAX_PDF_BYTES / 1024 / 1024} MB.`);

export async function listPdfs(db, userId) {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM pdfs WHERE user_id = ? ORDER BY created_at DESC`)
    .bind(userId)
    .all();
  return results;
}

export async function usage(db, userId) {
  const row = await db
    .prepare("SELECT COALESCE(SUM(size), 0) AS used, COUNT(*) AS count FROM pdfs WHERE user_id = ?")
    .bind(userId)
    .first();
  return { usedBytes: row.used, count: row.count };
}

/** Hex SHA-256 of the file's bytes. Always computed here; clients are not trusted for it. */
export async function sha256Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

const byHash = (db, userId, sha256) =>
  db
    .prepare(`SELECT ${COLUMNS} FROM pdfs WHERE user_id = ? AND sha256 = ?`)
    .bind(userId, sha256)
    .first();

/**
 * Store a PDF. Resolves to `{ pdf, duplicate }`.
 *
 * Idempotent on (user, id): re-sending an id returns the stored record without
 * writing again. If this account already holds a file with the same contents
 * (under any id or name) that record is returned with `duplicate: true` and
 * nothing is stored, so it costs no quota. R2 is written first; if the row
 * insert fails the object is removed so nothing is orphaned.
 */
export async function savePdf(env, userId, id, name, bytes) {
  const existing = await env.DB.prepare(`SELECT ${COLUMNS} FROM pdfs WHERE user_id = ? AND id = ?`)
    .bind(userId, id)
    .first();
  if (existing) return { pdf: existing, duplicate: false };

  if (!hasPdfMagic(bytes)) {
    throw new ApiError(415, "not_a_pdf", "That file is not a PDF.");
  }
  const sha256 = await sha256Hex(bytes);
  const same = await byHash(env.DB, userId, sha256);
  if (same) return { pdf: same, duplicate: true };

  const { usedBytes, count } = await usage(env.DB, userId);
  if (count >= MAX_PDFS_PER_USER) {
    throw new ApiError(409, "pdf_limit", `You can keep at most ${MAX_PDFS_PER_USER} PDFs.`);
  }
  if (usedBytes + bytes.byteLength > MAX_USER_BYTES) {
    throw new ApiError(413, "quota_exceeded", "Not enough storage left in your account.");
  }

  const key = `${userId}/${crypto.randomUUID()}`;
  await env.PDFS.put(key, bytes, { httpMetadata: { contentType: "application/pdf" } });
  try {
    const pdf = await env.DB.prepare(
      `INSERT INTO pdfs (user_id, id, name, size, r2_key, sha256, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING ${COLUMNS}`
    )
      .bind(userId, id, name, bytes.byteLength, key, sha256, new Date().toISOString())
      .first();
    return { pdf, duplicate: false };
  } catch (err) {
    await env.PDFS.delete(key).catch(() => {});
    // Two saves of the same file at once: the unique index let one win.
    const winner = await byHash(env.DB, userId, sha256).catch(() => null);
    if (winner) return { pdf: winner, duplicate: true };
    throw err;
  }
}

/** The R2 object for one of the caller's PDFs, or a 404 (also for other users' ids). */
export async function openPdf(env, userId, id) {
  const row = await env.DB.prepare(
    "SELECT name, r2_key FROM pdfs WHERE user_id = ? AND id = ?"
  )
    .bind(userId, id)
    .first();
  const object = row && (await env.PDFS.get(row.r2_key));
  if (!object) throw new ApiError(404, "not_found", "No such PDF.");
  return { name: row.name, object };
}

export async function deletePdf(env, userId, id) {
  const row = await env.DB.prepare("SELECT r2_key FROM pdfs WHERE user_id = ? AND id = ?")
    .bind(userId, id)
    .first();
  if (!row) return;
  await env.PDFS.delete(row.r2_key);
  await env.DB.prepare("DELETE FROM pdfs WHERE user_id = ? AND id = ?").bind(userId, id).run();
}

/** Remove every R2 object and row belonging to a user (account deletion). */
export async function deleteAllPdfs(env, userId) {
  const prefix = `${userId}/`;
  let cursor;
  do {
    const page = await env.PDFS.list({ prefix, cursor });
    if (page.objects.length) await env.PDFS.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  await env.DB.prepare("DELETE FROM pdfs WHERE user_id = ?").bind(userId).run();
}
