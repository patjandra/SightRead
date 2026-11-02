// Loads Google Identity Services (GIS) once and wraps its global API.

const GIS_SRC = "https://accounts.google.com/gsi/client";
let scriptPromise = null;

export function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = GIS_SRC;
      script.async = true;
      script.onload = () => resolve(window.google);
      script.onerror = () => {
        scriptPromise = null; // allow a retry
        reject(new Error("Could not load Google sign-in."));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}
