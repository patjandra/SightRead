import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sqliteD1 } from "./testUtils.js";

const DIR = fileURLToPath(new URL("../migrations/", import.meta.url));
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

const columns = (db, table) =>
  db.raw.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

describe("migrations", () => {
  it("are named NNNN_name.sql", () => {
    for (const f of files) expect(f).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/);
  });

  it("are numbered contiguously from 0001 with no duplicates", () => {
    const numbers = files.map((f) => Number(f.slice(0, 4)));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });

  it("are not empty", () => {
    for (const f of files) expect(readFileSync(DIR + f, "utf8").trim().length).toBeGreaterThan(0);
  });

  it("apply in order to a fresh database and build the schema the Worker uses", () => {
    const db = sqliteD1();
    expect(columns(db, "users")).toEqual(
      expect.arrayContaining(["id", "google_sub", "email", "name", "picture", "created_at", "last_login_at"])
    );
    expect(columns(db, "calibration_profiles")).toEqual(
      expect.arrayContaining(["user_id", "id", "name", "point_top", "point_center", "point_bottom", "calibration_version", "updated_at", "deleted_at"])
    );
    expect(columns(db, "pdfs")).toEqual(
      expect.arrayContaining(["user_id", "id", "name", "size", "r2_key", "created_at", "sha256"])
    );
    expect(columns(db, "spotify_links")).toEqual(
      expect.arrayContaining(["user_id", "refresh_token_enc", "created_at", "updated_at"])
    );
  });

  it("keep foreign keys enforced, so a row can't point at a missing user", () => {
    const db = sqliteD1();
    expect(() =>
      db.raw
        .prepare("INSERT INTO spotify_links (user_id, refresh_token_enc, created_at, updated_at) VALUES ('nobody', 'x', 't', 't')")
        .run()
    ).toThrow(/FOREIGN KEY/i);
  });
});
