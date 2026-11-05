import React, { useEffect } from "react";
import { MESSAGE_TYPE } from "./spotifyAuth.js";

// Landing page of the Spotify login popup. Hands the code back to the window
// that opened it (same origin only) and closes.
export default function SpotifyCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const message = {
      type: MESSAGE_TYPE,
      code: params.get("code"),
      state: params.get("state"),
      error: params.get("error"),
    };
    if (window.opener) {
      window.opener.postMessage(message, window.location.origin);
      window.close();
    }
  }, []);

  return <p className="p-6 text-sm text-slate-300">Connecting to Spotify… you can close this window.</p>;
}
