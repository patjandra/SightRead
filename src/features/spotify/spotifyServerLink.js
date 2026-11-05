// The only module that talks to /api/spotify/*: the "Remember me" login that
// lives (encrypted) on the SightRead account.

export class LinkError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api/spotify${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      // Required by the Worker's CSRF check on state-changing requests.
      "X-Requested-With": "sightread",
      ...(body && { "Content-Type": "application/json" }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new LinkError("Spotify request failed.", res.status);
  return res.status === 204 ? null : res.json();
}

/** Remember this Spotify login on the account. */
export const saveLink = (refreshToken) => request("/link", { method: "PUT", body: { refreshToken } });

/** @returns {Promise<{ accessToken: string, expiresIn: number }>} rejects with status 404 if nothing is remembered */
export const fetchToken = () => request("/token");

/** Forget the remembered Spotify login. */
export const deleteLink = () => request("/link", { method: "DELETE" });
