// The only module that talks to /api/auth/*. Everything else uses useAuth().

export class AuthApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api/auth${path}`, {
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
    throw new AuthApiError(
      data?.error?.message ?? "Request failed.",
      res.status,
      data?.error?.code
    );
  }
  return res.status === 204 ? null : res.json();
}

/** @returns {Promise<{ nonce: string, clientId: string }>} */
export const getNonce = () => request("/nonce");

/** @returns {Promise<{ user: object | null }>} */
export const getMe = () => request("/me");

/** @returns {Promise<{ user: object }>} */
export const signInWithGoogle = (credential) =>
  request("/google", { method: "POST", body: { credential } });

export const signOut = () => request("/logout", { method: "POST" });
