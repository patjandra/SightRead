import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

// MediaPipe ships vision_bundle.mjs with a sourceMappingURL pointing to a file
// that doesn't exist in the package. Strip the comment so Vite stops warning.
const suppressMissingMediapipeSourcemap = {
  name: "suppress-mediapipe-sourcemap",
  transform(code, id) {
    if (id.includes("@mediapipe")) {
      return { code: code.replace(/\/\/# sourceMappingURL=\S+/g, ""), map: null };
    }
  },
};

// Copy mediapipe WASM files into public/ so they are served as static assets.
// This avoids CDN fetches that COEP would block and ensures the WASM version
// always matches the installed JS package.
const copyMediapipeWasm = {
  name: "copy-mediapipe-wasm",
  buildStart() {
    const src = path.resolve("node_modules/@mediapipe/tasks-vision/wasm");
    const dest = path.resolve("public/mediapipe-wasm");
    fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(src)) {
      fs.copyFileSync(path.join(src, file), path.join(dest, file));
    }
  },
};

export default defineConfig({
  plugins: [react(), suppressMissingMediapipeSourcemap, copyMediapipeWasm],
  resolve: {
    alias: {
      // Force both the main bundle and the worker URL to use the same pdfjs-dist copy.
      "pdfjs-dist": path.resolve("node_modules/pdfjs-dist"),
    },
  },
  optimizeDeps: {
    exclude: ["@mediapipe/tasks-vision"],
  },
  // No COEP/COOP headers — they would block cross-origin CDN fetches
  // (e.g. the face_landmarker.task model from googleapis) without reciprocal
  // Cross-Origin-Resource-Policy headers on the CDN side.
});
