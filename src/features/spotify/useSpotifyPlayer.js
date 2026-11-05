import { useCallback, useEffect, useRef, useState } from "react";

const SDK_URL = "https://sdk.scdn.co/spotify-player.js";
const TICK_MS = 250;

let sdkPromise = null;
/** Loads the Web Playback SDK script once and resolves with window.Spotify. */
export function loadSpotifySdk() {
  if (window.Spotify) return Promise.resolve(window.Spotify);
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      window.onSpotifyWebPlaybackSDKReady = () => resolve(window.Spotify);
      const script = document.createElement("script");
      script.src = SDK_URL;
      script.async = true;
      script.onerror = () => {
        sdkPromise = null;
        reject(new Error("Couldn't load the Spotify player."));
      };
      document.body.appendChild(script);
    });
  }
  return sdkPromise;
}

/**
 * The in-browser Spotify player. Our page becomes a Spotify device; `deviceId`
 * is what the Web API needs to start a track on it. `positionMs` is advanced
 * locally between SDK events so the progress bar moves smoothly.
 */
export function useSpotifyPlayer({ accessToken, enabled }) {
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;
  const playerRef = useRef(null);
  const anchor = useRef({ positionMs: 0, at: 0, paused: true });

  const [deviceId, setDeviceId] = useState(null);
  const [track, setTrack] = useState(null);
  const [paused, setPaused] = useState(true);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState(null);
  const [premiumRequired, setPremiumRequired] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let player = null;

    loadSpotifySdk()
      .then((Spotify) => {
        if (cancelled) return;
        player = new Spotify.Player({
          name: "SightRead",
          getOAuthToken: (cb) => cb(tokenRef.current),
          volume: 0.8,
        });
        playerRef.current = player;

        player.addListener("ready", ({ device_id }) => setDeviceId(device_id));
        player.addListener("not_ready", () => setDeviceId(null));
        player.addListener("account_error", () => setPremiumRequired(true));
        player.addListener("authentication_error", () => setError("Spotify session expired. Connect again."));
        player.addListener("initialization_error", () => setError("This browser can't play Spotify."));
        player.addListener("player_state_changed", (state) => {
          if (!state) return;
          const current = state.track_window?.current_track;
          setTrack(
            current
              ? { uri: current.uri, name: current.name, artists: current.artists.map((a) => a.name).join(", ") }
              : null
          );
          setPaused(state.paused);
          setDurationMs(state.duration);
          setPositionMs(state.position);
          anchor.current = { positionMs: state.position, at: performance.now(), paused: state.paused };
        });
        player.connect();
      })
      .catch((err) => !cancelled && setError(err.message));

    return () => {
      cancelled = true;
      if (player) player.disconnect();
      playerRef.current = null;
      setDeviceId(null);
      setTrack(null);
      setPaused(true);
      setPositionMs(0);
      setDurationMs(0);
    };
  }, [enabled]);

  // Advance the position between SDK events while playing.
  useEffect(() => {
    if (paused || !track) return;
    const id = setInterval(() => {
      const a = anchor.current;
      setPositionMs(Math.min(a.positionMs + (performance.now() - a.at), durationMs || Infinity));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [paused, track, durationMs]);

  const toggle = useCallback(() => playerRef.current?.togglePlay(), []);

  const seek = useCallback((ms) => {
    anchor.current = { ...anchor.current, positionMs: ms, at: performance.now() };
    setPositionMs(ms);
    return playerRef.current?.seek(ms);
  }, []);

  // Safari/mobile need the audio element unlocked from a click.
  const activate = useCallback(() => playerRef.current?.activateElement?.(), []);

  return { deviceId, track, paused, positionMs, durationMs, error, premiumRequired, toggle, seek, activate };
}
