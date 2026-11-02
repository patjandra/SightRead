import { Hono } from "hono";
import { ApiError } from "../errors.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  deleteProfile,
  isUuid,
  listProfiles,
  parseProfileInput,
  upsertProfile,
} from "../services/calibrations.js";

const calibrations = new Hono();

calibrations.use("*", requireAuth);

function profileId(c) {
  const id = c.req.param("id");
  if (!isUuid(id)) throw new ApiError(400, "invalid_id", "Profile id must be a UUID.");
  return id.toLowerCase();
}

calibrations.get("/", async (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({ profiles: await listProfiles(c.env.DB, c.get("userId")) });
});

calibrations.put("/:id", async (c) => {
  const id = profileId(c);
  const body = await c.req.json().catch(() => null);
  const input = parseProfileInput(body);
  const profile = await upsertProfile(c.env.DB, c.get("userId"), id, input);
  return c.json({ profile });
});

calibrations.delete("/:id", async (c) => {
  const id = profileId(c);
  const profile = await deleteProfile(c.env.DB, c.get("userId"), id);
  return c.json({ profile });
});

export default calibrations;
