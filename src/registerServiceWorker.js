/**
 * Register the offline app shell (public/sw.js). Production builds only, so
 * `vite dev` never serves stale files. Failure just means no offline loading.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const worker = (await navigator.serviceWorker.ready).active ?? registration.active;
      // Hand over what this page already loaded so it is available offline too.
      const urls = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((u) => new URL(u).origin === location.origin);
      // The PDF renderer's worker only loads once a PDF is shown; fetch it now.
      const pdfWorker = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;
      worker?.postMessage({ type: "precache", urls: [...urls, pdfWorker] });
    } catch (err) {
      console.error("[SightRead] Offline mode unavailable:", err);
    }
  });
}
