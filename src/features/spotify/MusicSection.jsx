import React, { useEffect, useState } from "react";
import SectionToggle from "../reader/components/SectionToggle.jsx";
import { useSectionOpen } from "../reader/hooks/useSectionOpen.js";
import { SPOTIFY_CLIENT_ID } from "../../config.js";
import { useSpotifyAuth } from "./useSpotifyAuth.js";
import { useSpotifyPlayer } from "./useSpotifyPlayer.js";
import { searchTracks, playTrack } from "./spotifyApi.js";

const SEARCH_DEBOUNCE_MS = 350;

export function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Sidebar section: sign in to Spotify, search, play, and scrub the progress bar. */
export default function MusicSection() {
  const [open, toggle] = useSectionOpen("music");
  const auth = useSpotifyAuth();
  const signedIn = auth.status === "signed-in";
  const player = useSpotifyPlayer({ accessToken: auth.accessToken, enabled: signedIn });

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [message, setMessage] = useState(null);
  // While the thumb is held, the bar follows the pointer and playback is left alone.
  const [scrubMs, setScrubMs] = useState(null);

  useEffect(() => {
    if (!signedIn) {
      setResults([]);
      setSearched(false);
      return;
    }
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearched(false);
      return;
    }
    let stale = false;
    const id = setTimeout(async () => {
      setSearching(true);
      setMessage(null);
      try {
        const found = await searchTracks(q, auth.accessToken);
        if (!stale) {
          setResults(found);
          setSearched(true);
        }
      } catch (err) {
        if (!stale) setMessage(err.message);
      } finally {
        if (!stale) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(id);
    };
  }, [query, signedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  async function play(track) {
    setMessage(null);
    player.activate();
    try {
      await playTrack(player.deviceId, track.uri, auth.accessToken);
    } catch (err) {
      setMessage(err.message);
    }
  }

  function commitScrub() {
    if (scrubMs === null) return;
    player.seek(scrubMs);
    setScrubMs(null);
  }

  const shownMs = scrubMs ?? player.positionMs;
  const error = message || auth.error || player.error;

  return (
    <section className="space-y-1.5" data-no-scroll-pause>
      <div className="flex items-center gap-2">
        <SectionToggle open={open} onToggle={toggle} className="shrink-0">Music</SectionToggle>
        {/* Collapsed with a song loaded: keep play/pause and a slim progress bar in reach. */}
        {!open && signedIn && player.track && (
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <button
              className="shrink-0 w-5 h-5 rounded-full bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
              onClick={player.toggle}
              aria-label={player.paused ? "Play" : "Pause"}
              title={`${player.track.name} — ${player.track.artists}`}
            >
              <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden="true">
                {player.paused ? <path d="M8 5v14l11-7z" /> : <path d="M7 5h4v14H7zM13 5h4v14h-4z" />}
              </svg>
            </button>
            <input
              type="range"
              min={0}
              max={player.durationMs || 1}
              step={1000}
              value={Math.min(shownMs, player.durationMs || 1)}
              onChange={(e) => setScrubMs(Number(e.target.value))}
              onPointerUp={commitScrub}
              onKeyUp={commitScrub}
              onBlur={commitScrub}
              aria-label="Song progress (mini)"
              className="block h-1 flex-1 min-w-0 accent-green-500"
            />
          </div>
        )}
      </div>
      {open && (
        <div className="space-y-2">
          {!SPOTIFY_CLIENT_ID ? (
            <p className="text-[11px] text-slate-400">Spotify isn't configured for this build.</p>
          ) : !signedIn ? (
            <>
            <button
              className="w-full flex items-center justify-center gap-2 rounded-full bg-[#1DB954] hover:bg-[#1ed760] active:scale-[0.98] disabled:opacity-60 disabled:hover:bg-[#1DB954] px-4 py-2 text-xs font-bold text-black shadow-md shadow-black/30 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              onClick={auth.login}
              disabled={auth.status === "connecting"}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
              {auth.status === "connecting" ? "Connecting…" : "Connect Spotify"}
            </button>
              {auth.canRemember && (
                <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={auth.remember}
                    onChange={(e) => auth.setRemember(e.target.checked)}
                    className="accent-green-500"
                  />
                  Remember me
                </label>
              )}
            </>
          ) : (
            <>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for a song"
                aria-label="Search Spotify"
                className="w-full rounded-lg bg-slate-700 border border-slate-600 px-2 py-1.5 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-slate-400"
              />

              {player.premiumRequired && (
                <p className="text-[11px] text-amber-300">Spotify Premium is required to play music here.</p>
              )}
              {searching && <p className="text-[11px] text-slate-400">Searching…</p>}
              {searched && !searching && results.length === 0 && (
                <p className="text-[11px] text-slate-400">No songs found.</p>
              )}

              {results.length > 0 && (
                <ul className="space-y-1 max-h-48 overflow-y-auto">
                  {results.map((t) => (
                    <li key={t.uri} className="flex items-center gap-2">
                      {t.art ? (
                        <img src={t.art} alt="" className="w-8 h-8 rounded shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-slate-700 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-slate-100">{t.name}</p>
                        <p className="truncate text-[10px] text-slate-400">{t.artists}</p>
                      </div>
                      <button
                        className="shrink-0 w-7 h-7 rounded-full bg-green-600 hover:bg-green-500 disabled:opacity-40 flex items-center justify-center"
                        onClick={() => play(t)}
                        disabled={!player.deviceId || player.premiumRequired}
                        aria-label={`Play ${t.name}`}
                      >
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {player.track && (
                <div className="rounded-lg bg-slate-800 border border-slate-700 p-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-slate-100">{player.track.name}</p>
                      <p className="truncate text-[10px] text-slate-400">{player.track.artists}</p>
                    </div>
                    <button
                      className="shrink-0 w-7 h-7 rounded-full bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                      onClick={player.toggle}
                      aria-label={player.paused ? "Play" : "Pause"}
                    >
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
                        {player.paused ? <path d="M8 5v14l11-7z" /> : <path d="M7 5h4v14H7zM13 5h4v14h-4z" />}
                      </svg>
                    </button>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={player.durationMs || 1}
                    step={1000}
                    value={Math.min(shownMs, player.durationMs || 1)}
                    onChange={(e) => setScrubMs(Number(e.target.value))}
                    onPointerUp={commitScrub}
                    onKeyUp={commitScrub}
                    onBlur={commitScrub}
                    aria-label="Song progress"
                    className="block w-full accent-green-500"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-slate-300 tabular-nums">
                    <span>{formatTime(shownMs)}</span>
                    <span>{formatTime(player.durationMs)}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                {auth.canRemember ? (
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={auth.remembered}
                      onChange={(e) => auth.setRemembered(e.target.checked)}
                      className="accent-green-500"
                    />
                    Remember me
                  </label>
                ) : (
                  <span />
                )}
                <button className="text-[10px] text-slate-400 hover:text-slate-200 underline" onClick={auth.logout}>
                  Disconnect Spotify
                </button>
              </div>
            </>
          )}
          {error && <p className="text-[11px] text-amber-300">{error}</p>}
        </div>
      )}
    </section>
  );
}
