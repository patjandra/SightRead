// The only module that talks to /api/calibrations.

export class ProfileApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api/calibrations${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      // Required by the Worker's CSRF check on state-changing requests.
      "X-Requested-With": "sightread",
      ...(body && { "Content-Type": "application/json" }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ProfileApiError(
      data?.error?.message ?? "Request failed.",
      res.status,
      data?.error?.code
    );
  }
  return res.json();
}

// What the server stores for a profile: the local-only fields (ownerId,
// syncState) never leave the device.
const toWire = (r) => ({
  name: r.name,
  points: r.points ?? null,
  calibrationVersion: r.calibrationVersion ?? null,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

/** @returns {Promise<object[]>} all the account's profiles, including tombstones */
export const fetchProfiles = async () => (await request("")).profiles;

/** @returns {Promise<object>} the winning server record (may be newer than ours) */
export const pushProfile = async (record) =>
  (await request(`/${record.id}`, { method: "PUT", body: toWire(record) })).profile;

/** @returns {Promise<object>} the tombstone */
export const deleteRemoteProfile = async (id) =>
  (await request(`/${id}`, { method: "DELETE" })).profile;
