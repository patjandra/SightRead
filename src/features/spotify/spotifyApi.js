const API = "https://api.spotify.com/v1";

export class SpotifyError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function toTrack(t) {
  return {
    uri: t.uri,
    name: t.name,
    artists: t.artists.map((a) => a.name).join(", "),
    art: t.album?.images?.at(-1)?.url ?? null,
    durationMs: t.duration_ms,
  };
}

/** Search tracks. Returns [{ uri, name, artists, art, durationMs }]. */
export async function searchTracks(query, token, limit = 8) {
  const q = query.trim();
  if (!q) return [];
  const res = await fetch(`${API}/search?${new URLSearchParams({ q, type: "track", limit })}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new SpotifyError("Spotify session expired. Connect again.", 401);
  if (!res.ok) throw new SpotifyError("Spotify search failed.", res.status);
  const json = await res.json();
  return (json.tracks?.items ?? []).map(toTrack);
}

/** Start a track on the given device (our in-browser player). */
export async function playTrack(deviceId, uri, token) {
  const res = await fetch(`${API}/me/player/play?${new URLSearchParams({ device_id: deviceId })}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ uris: [uri] }),
  });
  if (res.status === 403) throw new SpotifyError("Spotify Premium is required to play music here.", 403);
  if (res.status === 401) throw new SpotifyError("Spotify session expired. Connect again.", 401);
  if (!res.ok && res.status !== 204) throw new SpotifyError("Couldn't start playback.", res.status);
}
