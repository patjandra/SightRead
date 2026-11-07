import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "jsonc-parser";
import { SPOTIFY_CLIENT_ID } from "../src/config.js";

const config = parse(readFileSync(fileURLToPath(new URL("../wrangler.jsonc", import.meta.url)), "utf8"));

// `env` blocks don't inherit bindings or vars, so each one must be complete.
const envs = {
  local: config,
  staging: config.env?.staging,
  production: config.env?.production,
};

describe("wrangler.jsonc", () => {
  it("defines local, staging and production", () => {
    for (const [name, env] of Object.entries(envs)) expect(env, name).toBeTruthy();
  });

  for (const [name, env] of Object.entries(envs)) {
    describe(name, () => {
      it("binds D1 as DB with the migrations directory", () => {
        const db = env.d1_databases?.find((d) => d.binding === "DB");
        expect(db).toBeTruthy();
        expect(db.migrations_dir).toBe("migrations");
        expect(db.database_id).toBeTruthy();
      });

      it("binds the PDF bucket as PDFS", () => {
        expect(env.r2_buckets?.find((b) => b.binding === "PDFS")?.bucket_name).toBeTruthy();
      });

      it("sets the public client IDs", () => {
        expect(env.vars?.GOOGLE_CLIENT_ID).toMatch(/\.apps\.googleusercontent\.com$/);
        expect(env.vars?.SPOTIFY_CLIENT_ID).toMatch(/^[0-9a-f]{32}$/);
      });

      it("keeps the Spotify client ID identical to the one the client uses", () => {
        expect(env.vars.SPOTIFY_CLIENT_ID).toBe(SPOTIFY_CLIENT_ID);
      });

      it("serves static assets with the SPA fallback and runs the Worker only for /api/*", () => {
        expect(env.assets?.directory).toBe("./dist");
        expect(env.assets?.not_found_handling).toBe("single-page-application");
        expect(env.assets?.run_worker_first).toEqual(["/api/*"]);
      });
    });
  }

  it("keeps environments apart: no shared database, bucket or Worker name", () => {
    const get = (env) => ({
      db: env.d1_databases.find((d) => d.binding === "DB").database_id,
      bucket: env.r2_buckets.find((b) => b.binding === "PDFS").bucket_name,
    });
    const all = Object.values(envs).map(get);
    expect(new Set(all.map((e) => e.db)).size).toBe(3);
    expect(new Set(all.map((e) => e.bucket)).size).toBe(3);
    expect(envs.staging.name).not.toBe(envs.production.name);
  });

  it("serves production on the custom domain and staging on workers.dev only", () => {
    expect(envs.production.routes).toEqual([{ pattern: "sightread.ing", custom_domain: true }]);
    expect(envs.staging.routes).toBeUndefined();
  });

  it("uses distinct Google client IDs per environment", () => {
    const ids = Object.values(envs).map((e) => e.vars.GOOGLE_CLIENT_ID);
    expect(new Set(ids).size).toBe(3);
  });
});
