import React from "react";
import ReactDOM from "react-dom/client";
import { pdfjs } from "react-pdf";
import App from "./App.jsx";
import "./index.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
