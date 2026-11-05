import { SPOTIFY_CLIENT_ID } from "../../config.js";
import { generateVerifier, challengeFor, randomString } from "./pkce.js";

const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const PENDING_KEY = "sightread-spotify-pending";
export const TOKENS_KEY = "sightread-spotify";
export const MESSAGE_TYPE = "sightread-spotify-auth";

export const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
].join(" ");

export function redirectUri() {
  return `${window.location.origin}/spotify/callback`;
}

/** Opens the Spotify consent popup. Returns the popup, or null if it was blocked. */
export async function startLogin() {
  const verifier = generateVerifier();
  const state = randomString(16);
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state }));
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SCOPES,
    state,
    code_challenge_method: "S256",
    code_challenge: await challengeFor(verifier),
  });
  return window.open(`${AUTHORIZE_URL}?${params}`, "spotify-login", "popup,width=480,height=720");
}

function toTokens(json, previousRefresh) {
  return {
    access: json.access_token,
    refresh: json.refresh_token || previousRefresh,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}

async function postToken(body) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: SPOTIFY_CLIENT_ID, ...body }),
  });
  if (!res.ok) throw new Error("Spotify sign-in failed.");
  return res.json();
}

/** Trades the callback's code for tokens. Rejects if `state` doesn't match. */
export async function exchangeCode(code, state) {
  let pending = null;
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING_KEY));
  } catch {
    // fall through to the check below
  }
  sessionStorage.removeItem(PENDING_KEY);
  if (!pending || !state || pending.state !== state) throw new Error("Spotify sign-in failed.");
  return toTokens(
    await postToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      code_verifier: pending.verifier,
    })
  );
}

export async function refreshTokens(refreshToken) {
  return toTokens(
    await postToken({ grant_type: "refresh_token", refresh_token: refreshToken }),
    refreshToken
  );
}

export function loadTokens() {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKENS_KEY));
    // A remembered login holds no refresh token here; the server renews it.
    return t && t.access && (t.refresh || t.remembered) ? t : null;
  } catch {
    return null;
  }
}

export function saveTokens(tokens) {
  sessionStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

export function clearTokens() {
  sessionStorage.removeItem(TOKENS_KEY);
  sessionStorage.removeItem(PENDING_KEY);
}
