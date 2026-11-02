// Calibration profile storage and validation. All SQL for this table lives
// here, and every statement is scoped by user_id: a user can only ever see or
// change their own rows (the primary key is (user_id, id)).

import { ApiError } from "../errors.js";

export const MAX_PROFILES_PER_USER = 50;
// Tombstones are kept so other devices learn of deletes, but they count toward
// a total row cap so create/delete churn can't grow the table without bound.
export const MAX_ROWS_PER_USER = MAX_PROFILES_PER_USER * 2;
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_NAME_LENGTH = 100;
const MAX_POINT_MAGNITUDE = 100;
// A client clock this far ahead is rejected, so a skewed device can't pin a
// profile with an "updatedAt" that no later edit could ever beat.
const MAX_FUTURE_MS = 5 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS =
  "id, name, point_top, point_center, point_bottom, calibration_version, created_at, updated_at, deleted_at";

export const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);

function badRequest(code, message) {
  return new ApiError(400, code, message);
}

// Normalize to toISOString() so stored timestamps are fixed-width UTC and
// compare correctly as plain strings.
function parseTimestamp(value, field) {
  const ms = typeof value === "string" ? Date.parse(value) : NaN;
  if (Number.isNaN(ms)) throw badRequest("invalid_profile", `${field} must be an ISO timestamp.`);
  return { ms, iso: new Date(ms).toISOString() };
}

const isCoordinate = (n) =>
  typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= MAX_POINT_MAGNITUDE;

/**
 * Validate a PUT body. Returns the fields to store.
 * @throws {ApiError} 400 on anything malformed.
 */
export function parseProfileInput(body, now = Date.now()) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw badRequest("invalid_profile", "Profile must be an object.");
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > MAX_NAME_LENGTH) {
    throw badRequest("invalid_profile", `Name must be 1-${MAX_NAME_LENGTH} characters.`);
  }

  let points = null;
  if (body.points !== null && body.points !== undefined) {
    const p = body.points;
    if (typeof p !== "object" || !isCoordinate(p.top) || !isCoordinate(p.center) || !isCoordinate(p.bottom)) {
      throw badRequest("invalid_profile", "Points must be three finite numbers.");
    }
    points = { top: p.top, center: p.center, bottom: p.bottom };
  }

  const version = body.calibrationVersion ?? null;
  if (version !== null && !(Number.isInteger(version) && version >= 0 && version <= 10000)) {
    throw badRequest("invalid_profile", "calibrationVersion must be an integer.");
  }

  const createdAt = parseTimestamp(body.createdAt, "createdAt");
  const updatedAt = parseTimestamp(body.updatedAt, "updatedAt");
  if (updatedAt.ms > now + MAX_FUTURE_MS) {
    throw badRequest("invalid_timestamp", "updatedAt is too far in the future.");
  }

  return { name, points, calibrationVersion: version, createdAt: createdAt.iso, updatedAt: updatedAt.iso };
}

function toProfile(row) {
  const hasPoints = row.point_top !== null && row.point_center !== null && row.point_bottom !== null;
  return {
    id: row.id,
    name: row.name,
    points: hasPoints
      ? { top: row.point_top, center: row.point_center, bottom: row.point_bottom }
      : null,
    calibrationVersion: row.calibration_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

async function getRow(db, userId, id) {
  return db
    .prepare(`SELECT ${COLUMNS} FROM calibration_profiles WHERE user_id = ? AND id = ?`)
    .bind(userId, id)
    .first();
}

/** All of a user's profiles, including tombstones (so other devices see deletes). */
export async function listProfiles(db, userId) {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM calibration_profiles WHERE user_id = ? ORDER BY created_at, id`)
    .bind(userId)
    .all();
  return results.map(toProfile);
}

/**
 * Create or update a profile (idempotent, keyed by the client's UUID).
 *
 * Newest `updatedAt` wins: an update only applies if it is newer than what is
 * stored, and the winning record is always returned so the client can adopt it.
 * A deleted profile is never resurrected.
 *
 * @throws {ApiError} 409 `profile_limit` when creating beyond the cap.
 */
export async function upsertProfile(db, userId, id, input) {
  const existing = await getRow(db, userId, id);

  if (!existing) {
    // Expired tombstones free up room (a device offline longer than this must
    // re-sync from scratch anyway).
    await db
      .prepare("DELETE FROM calibration_profiles WHERE user_id = ? AND deleted_at IS NOT NULL AND deleted_at < ?")
      .bind(userId, new Date(Date.now() - TOMBSTONE_TTL_MS).toISOString())
      .run();
    // One statement checks both caps and inserts, so concurrent first writes
    // can't both pass the check. DO NOTHING covers a duplicate of the same id.
    await db
      .prepare(
        `INSERT INTO calibration_profiles
           (user_id, id, name, point_top, point_center, point_bottom, calibration_version, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE (SELECT COUNT(*) FROM calibration_profiles WHERE user_id = ? AND deleted_at IS NULL) < ?
            AND (SELECT COUNT(*) FROM calibration_profiles WHERE user_id = ?) < ?
         ON CONFLICT(user_id, id) DO NOTHING`
      )
      .bind(
        userId, id, input.name,
        input.points?.top ?? null, input.points?.center ?? null, input.points?.bottom ?? null,
        input.calibrationVersion, input.createdAt, input.updatedAt,
        userId, MAX_PROFILES_PER_USER, userId, MAX_ROWS_PER_USER
      )
      .run();
    if (!(await getRow(db, userId, id))) {
      throw new ApiError(409, "profile_limit", `You can save up to ${MAX_PROFILES_PER_USER} profiles.`);
    }
  } else {
    // Conditional update: stays correct even if another write lands in between.
    await db
      .prepare(
        `UPDATE calibration_profiles
            SET name = ?, point_top = ?, point_center = ?, point_bottom = ?,
                calibration_version = ?, updated_at = ?
          WHERE user_id = ? AND id = ? AND deleted_at IS NULL AND updated_at < ?`
      )
      .bind(
        input.name,
        input.points?.top ?? null, input.points?.center ?? null, input.points?.bottom ?? null,
        input.calibrationVersion, input.updatedAt,
        userId, id, input.updatedAt
      )
      .run();
  }

  return toProfile(await getRow(db, userId, id));
}

/**
 * Soft-delete a profile (idempotent). Returns the tombstone.
 * @throws {ApiError} 404 if the user has no such profile.
 */
export async function deleteProfile(db, userId, id, now = new Date()) {
  const stamp = now.toISOString();
  await db
    .prepare(
      // Scrub the content: a tombstone only needs to exist so other devices
      // learn of the delete, so it keeps no name or calibration values.
      `UPDATE calibration_profiles
          SET deleted_at = ?, updated_at = ?, name = '',
              point_top = NULL, point_center = NULL, point_bottom = NULL
        WHERE user_id = ? AND id = ? AND deleted_at IS NULL`
    )
    .bind(stamp, stamp, userId, id)
    .run();

  const row = await getRow(db, userId, id);
  if (!row) throw new ApiError(404, "not_found", "No such profile.");
  return toProfile(row);
}
