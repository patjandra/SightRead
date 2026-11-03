import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../index.js";
import { ORIGIN, env, fakeR2, makeUser, sqliteD1 } from "../testUtils.js";
import { MAX_PDFS_PER_USER, MAX_PDF_BYTES, MAX_USER_BYTES } from "../services/pdfs.js";

const ID_1 = "11111111-1111-4111-8111-111111111111";
const ID_2 = "22222222-2222-4222-8222-222222222222";

const pdfBytes = (size = 64) => {
  const bytes = new Uint8Array(size).fill(0x20);
  bytes.set(new TextEncoder().encode("%PDF-1.7"));
  return bytes;
};

let db, bucket, app, alice, bob;

beforeEach(async () => {
  db = sqliteD1();
  bucket = fakeR2();
  app = createApp();
  alice = await makeUser(db, "alice");
  bob = await makeUser(db, "bob");
});

function call(user, path, { method = "GET", body, name = "Etude.pdf", length } = {}) {
  const headers = {
    ...(user && { Cookie: user.cookie }),
    ...(method !== "GET" && { Origin: ORIGIN, "X-Requested-With": "sightread" }),
  };
  if (body !== undefined) {
    headers["X-Filename"] = encodeURIComponent(name);
    headers["Content-Length"] = String(length ?? body.byteLength);
  }
  return app.request(`${ORIGIN}${path}`, { method, headers, body }, env(db, bucket));
}

const put = (user, id, body, opts) => call(user, `/api/pdfs/${id}`, { method: "PUT", body, ...opts });
const list = async (user) => (await call(user, "/api/pdfs")).json();

describe("authentication", () => {
  it("rejects every route when signed out", async () => {
    expect((await call(null, "/api/pdfs")).status).toBe(401);
    expect((await put(null, ID_1, pdfBytes())).status).toBe(401);
    expect((await call(null, `/api/pdfs/${ID_1}/file`)).status).toBe(401);
    expect((await call(null, `/api/pdfs/${ID_1}`, { method: "DELETE" })).status).toBe(401);
    expect((await call(null, "/api/account", { method: "DELETE" })).status).toBe(401);
  });

  it("requires the CSRF headers on writes", async () => {
    const res = await app.request(
      `${ORIGIN}/api/pdfs/${ID_1}`,
      { method: "PUT", headers: { Cookie: alice.cookie, "X-Filename": "a.pdf", "Content-Length": "64" }, body: pdfBytes() },
      env(db, bucket)
    );
    expect(res.status).toBe(403);
    expect(bucket.objects.size).toBe(0);
  });
});

describe("upload and download", () => {
  it("stores a PDF under a server-built key and returns it byte for byte", async () => {
    const bytes = pdfBytes(200);
    const res = await put(alice, ID_1, bytes);
    expect(res.status).toBe(200);
    expect((await res.json()).pdf).toMatchObject({ id: ID_1, name: "Etude.pdf", size: 200 });

    const keys = [...bucket.objects.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0].startsWith(`${alice.id}/`)).toBe(true);

    const file = await call(alice, `/api/pdfs/${ID_1}/file`);
    expect(file.status).toBe(200);
    expect(file.headers.get("Content-Type")).toBe("application/pdf");
    expect(file.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
  });

  it("is idempotent: re-sending an id does not store a second copy", async () => {
    await put(alice, ID_1, pdfBytes());
    const again = await put(alice, ID_1, pdfBytes(), { name: "Other.pdf" });
    expect((await again.json()).pdf.name).toBe("Etude.pdf");
    expect(bucket.objects.size).toBe(1);
    expect((await list(alice)).pdfs).toHaveLength(1);
  });

  it("cleans the file name", async () => {
    const res = await put(alice, ID_1, pdfBytes(), { name: "  Bach\u0000\n.pdf  " });
    expect((await res.json()).pdf.name).toBe("Bach.pdf");
    expect((await put(alice, ID_2, pdfBytes(), { name: "   " })).status).toBe(400);
  });

  it("lists with usage and limits", async () => {
    await put(alice, ID_1, pdfBytes(100));
    const body = await list(alice);
    expect(body).toMatchObject({ usedBytes: 100, limitBytes: MAX_USER_BYTES, maxFileBytes: MAX_PDF_BYTES });
    expect(body.pdfs[0]).toMatchObject({ id: ID_1, size: 100 });
  });

  it("rejects ids that are not UUIDs", async () => {
    expect((await put(alice, "not-a-uuid", pdfBytes())).status).toBe(400);
    expect((await call(alice, "/api/pdfs/nope/file")).status).toBe(400);
  });
});

describe("validation", () => {
  it("rejects files that do not start with %PDF-", async () => {
    const res = await put(alice, ID_1, new TextEncoder().encode("<html>not a pdf at all</html>"), { name: "x.pdf" });
    expect(res.status).toBe(415);
    expect(bucket.objects.size).toBe(0);
  });

  it("rejects a declared length over the file limit", async () => {
    const res = await put(alice, ID_1, pdfBytes(), { length: MAX_PDF_BYTES + 1 });
    expect(res.status).toBe(413);
    expect(bucket.objects.size).toBe(0);
  });

  it("rejects a body larger than it declared", async () => {
    const res = await put(alice, ID_1, pdfBytes(MAX_PDF_BYTES + 10), { length: 100 });
    expect(res.status).toBe(413);
    expect(bucket.objects.size).toBe(0);
  });

  it("requires a Content-Length", async () => {
    const res = await app.request(
      `${ORIGIN}/api/pdfs/${ID_1}`,
      {
        method: "PUT",
        headers: { Cookie: alice.cookie, Origin: ORIGIN, "X-Requested-With": "sightread", "X-Filename": "a.pdf" },
        body: new ReadableStream({ start(c) { c.enqueue(pdfBytes()); c.close(); } }),
        duplex: "half",
      },
      env(db, bucket)
    );
    expect(res.status).toBe(411);
  });

  it("enforces the per-user storage quota", async () => {
    db.raw
      .prepare("INSERT INTO pdfs (user_id, id, name, size, r2_key, created_at) VALUES (?, ?, 'big', ?, 'k', 't')")
      .run(alice.id, ID_2, MAX_USER_BYTES - 50);
    const res = await put(alice, ID_1, pdfBytes(100));
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("quota_exceeded");
    expect(bucket.objects.size).toBe(0);
    // Another user's usage is separate.
    expect((await put(bob, ID_1, pdfBytes(100))).status).toBe(200);
  });

  it("enforces the file-count limit", async () => {
    const insert = db.raw.prepare(
      "INSERT INTO pdfs (user_id, id, name, size, r2_key, created_at) VALUES (?, ?, 'f', 1, 'k', 't')"
    );
    for (let i = 0; i < MAX_PDFS_PER_USER; i++) insert.run(alice.id, `id-${i}`);
    const res = await put(alice, ID_1, pdfBytes());
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("pdf_limit");
  });

  it("removes the stored object if the row cannot be written", async () => {
    // Make the insert fail by dropping the table's user (foreign key).
    db.raw.exec("PRAGMA foreign_keys = ON");
    db.raw.prepare("DELETE FROM users WHERE id = ?").run(alice.id);
    const res = await put(alice, ID_1, pdfBytes());
    expect(res.status).toBe(500);
    expect(bucket.objects.size).toBe(0);
  });
});

describe("isolation between users", () => {
  beforeEach(async () => {
    await put(alice, ID_1, pdfBytes());
  });

  it("does not list, read or delete another user's PDF", async () => {
    expect((await list(bob)).pdfs).toEqual([]);
    expect((await call(bob, `/api/pdfs/${ID_1}/file`)).status).toBe(404);
    expect((await call(bob, `/api/pdfs/${ID_1}`, { method: "DELETE" })).status).toBe(204);
    expect((await list(alice)).pdfs).toHaveLength(1);
    expect(bucket.objects.size).toBe(1);
  });

  it("lets two users use the same client id independently", async () => {
    expect((await put(bob, ID_1, pdfBytes(10), { name: "Bob.pdf" })).status).toBe(200);
    expect((await list(alice)).pdfs[0].name).toBe("Etude.pdf");
    expect((await list(bob)).pdfs[0].name).toBe("Bob.pdf");
    expect(bucket.objects.size).toBe(2);
  });
});

describe("delete", () => {
  it("removes the object and the row, and is idempotent", async () => {
    await put(alice, ID_1, pdfBytes());
    expect((await call(alice, `/api/pdfs/${ID_1}`, { method: "DELETE" })).status).toBe(204);
    expect(bucket.objects.size).toBe(0);
    expect((await list(alice)).pdfs).toEqual([]);
    expect((await call(alice, `/api/pdfs/${ID_1}`, { method: "DELETE" })).status).toBe(204);
    expect((await call(alice, `/api/pdfs/${ID_1}/file`)).status).toBe(404);
  });
});

describe("account deletion", () => {
  it("removes the user's PDFs, profiles and user row, but nobody else's", async () => {
    await put(alice, ID_1, pdfBytes());
    await put(alice, ID_2, pdfBytes());
    await put(bob, ID_1, pdfBytes());
    const profile = db.raw.prepare(
      "INSERT INTO calibration_profiles (user_id, id, name, created_at, updated_at) VALUES (?, ?, 'p', 't', 't')"
    );
    profile.run(alice.id, ID_1);
    profile.run(bob.id, ID_1);

    const res = await call(alice, "/api/account", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(res.headers.get("Set-Cookie")).toMatch(/sr_session=;/);

    expect([...bucket.objects.keys()].every((k) => k.startsWith(`${bob.id}/`))).toBe(true);
    expect(bucket.objects.size).toBe(1);
    const count = (sql, id) => db.raw.prepare(sql).get(id).n;
    expect(count("SELECT COUNT(*) n FROM pdfs WHERE user_id = ?", alice.id)).toBe(0);
    expect(count("SELECT COUNT(*) n FROM calibration_profiles WHERE user_id = ?", alice.id)).toBe(0);
    expect(count("SELECT COUNT(*) n FROM users WHERE id = ?", alice.id)).toBe(0);
    expect(count("SELECT COUNT(*) n FROM pdfs WHERE user_id = ?", bob.id)).toBe(1);
    expect(count("SELECT COUNT(*) n FROM users WHERE id = ?", bob.id)).toBe(1);
  });

  it("requires the CSRF headers", async () => {
    const res = await app.request(
      `${ORIGIN}/api/account`,
      { method: "DELETE", headers: { Cookie: alice.cookie } },
      env(db, bucket)
    );
    expect(res.status).toBe(403);
  });
});
