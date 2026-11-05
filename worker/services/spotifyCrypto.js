// Encrypts Spotify refresh tokens at rest. AES-256-GCM with a random IV per
// write; the user id is bound as additional authenticated data, so a ciphertext
// copied to another user's row fails to decrypt.

const KEY_BYTES = 32;

function b64uEncode(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64uDecode(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function importKey(secret) {
  let raw;
  try {
    raw = typeof secret === "string" ? b64uDecode(secret.trim()) : null;
  } catch {
    raw = null;
  }
  if (!raw || raw.length !== KEY_BYTES) {
    throw new Error(`SPOTIFY_TOKEN_KEY must be ${KEY_BYTES} random bytes, base64 encoded`);
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** @returns {Promise<string>} `iv.ciphertext`, both base64url */
export async function encryptToken(secret, userId, plaintext) {
  const key = await importKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${b64uEncode(iv)}.${b64uEncode(new Uint8Array(data))}`;
}

/** @returns {Promise<string|null>} the token, or null if it can't be decrypted for this user */
export async function decryptToken(secret, userId, stored) {
  const key = await importKey(secret);
  try {
    const [iv, data] = stored.split(".");
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64uDecode(iv), additionalData: new TextEncoder().encode(userId) },
      key,
      b64uDecode(data)
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
