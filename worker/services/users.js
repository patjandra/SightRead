// All user SQL lives here; routes never touch D1 directly.

const PUBLIC_COLUMNS = "id, email, name, picture";

/**
 * Create the user for a Google identity, or update the existing one. A single
 * atomic upsert keyed on `google_sub`, so two simultaneous first sign-ins can't
 * create duplicates. Returning users keep the UUID they were first given.
 */
export async function upsertGoogleUser(db, { sub, email, name, picture }) {
  const now = new Date().toISOString();
  return db
    .prepare(
      `INSERT INTO users (id, google_sub, email, name, picture, created_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(google_sub) DO UPDATE SET
         email = excluded.email,
         name = excluded.name,
         picture = excluded.picture,
         last_login_at = excluded.last_login_at
       RETURNING ${PUBLIC_COLUMNS}`
    )
    .bind(crypto.randomUUID(), sub, email, name, picture, now, now)
    .first();
}

export async function getUserById(db, id) {
  return db
    .prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`)
    .bind(id)
    .first();
}
