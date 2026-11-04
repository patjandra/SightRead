import React from "react";
import ReactDOM from "react-dom/client";
import { pdfjs } from "react-pdf";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import AuthProvider from "./features/auth/AuthProvider.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./index.css";
import { registerServiceWorker } from "./registerServiceWorker.js";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

registerServiceWorker();
