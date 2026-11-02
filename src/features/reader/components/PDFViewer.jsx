import React, { useState, useRef, useCallback } from "react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Fixed resolution the page canvases are rasterized at — chosen once and never
// changed, so zooming never triggers a re-render. Rendering at 2× (multiplied
// again by the device pixel ratio internally) keeps pages sharp when the user
// zooms in toward the app's max zoom; user zoom is then applied purely in CSS.
const BASE_RENDER_SCALE = 2;

/**
 * Renders all pages of a PDF stacked vertically.
 *
 * Zoom, the Google-Docs way — no reload on zoom:
 *   Each <Page> is rasterized ONCE at BASE_RENDER_SCALE (the expensive step).
 *   User zoom is applied with the CSS `zoom` property on the page stack, which
 *   scales the already-painted canvas AND reflows layout (so the scrollable
 *   height stays correct). Because the bitmap is rendered at higher resolution
 *   than it's usually displayed, CSS-scaling it stays crisp without ever
 *   re-running PDF rasterization.
 *
 * Props:
 *   pdfUrl          - object URL string or null
 *   zoom            - user scale factor (e.g. 1.0 = 100%)
 *   scrollContainerRef - ref forwarded to the scrollable container
 *   onPdfUpload     - (file) => void, called when a PDF is chosen or dropped
 */
export default function PDFViewer({ pdfUrl, zoom, scrollContainerRef, onPdfUpload }) {
  const [numPages, setNumPages] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const onDocumentLoadSuccess = useCallback(({ numPages }) => {
    setNumPages(numPages);
    setLoadError(null);
  }, []);

  const onDocumentLoadError = useCallback((err) => {
    setLoadError("Failed to load PDF: " + err.message);
  }, []);

  const acceptFile = useCallback(
    (file) => {
      if (!file) return;
      const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");
      if (isPdf) onPdfUpload?.(file);
    },
    [onPdfUpload]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragActive(false);
      acceptFile(e.dataTransfer.files?.[0]);
    },
    [acceptFile]
  );

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  if (!pdfUrl) {
    return (
      <div
        className={`flex-1 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
          dragActive
            ? "bg-indigo-50 text-indigo-500"
            : "bg-slate-100 text-slate-400 hover:bg-slate-50"
        }`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            acceptFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M12 18v-6" />
          <path d="m9 15 3-3 3 3" />
        </svg>
        <p className="text-sm font-medium text-slate-500 pointer-events-none">
          {dragActive ? "Drop your PDF to open it" : "No sheet music loaded"}
        </p>
        <p className="text-xs text-slate-400 pointer-events-none">
          Click anywhere or drag a PDF here to get started.
        </p>
      </div>
    );
  }

  // Display factor: the pages are painted at BASE_RENDER_SCALE, so to show them
  // at the user's requested `zoom` we CSS-scale by the ratio.
  const displayZoom = zoom / BASE_RENDER_SCALE;

  return (
    <div
      ref={scrollContainerRef}
      className="sr-scroll flex-1 overflow-y-auto bg-slate-200"
      style={{ scrollBehavior: "auto" }}
    >
      {loadError && (
        <div className="p-4 text-red-600 text-sm font-medium">{loadError}</div>
      )}
      <Document
        file={pdfUrl}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={onDocumentLoadError}
        loading={
          <div className="p-8 text-center text-gray-500 text-sm">Loading PDF…</div>
        }
        className="flex flex-col items-center py-4"
      >
        {/* `zoom` (not transform) so layout reflows and scroll height tracks the
            visible size. Instant, since it never re-rasterizes the canvas. */}
        <div className="flex flex-col items-center gap-4" style={{ zoom: displayZoom }}>
          {numPages &&
            Array.from({ length: numPages }, (_, i) => (
              <Page
                key={i + 1}
                pageNumber={i + 1}
                scale={BASE_RENDER_SCALE}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className="shadow-lg"
              />
            ))}
        </div>
      </Document>
    </div>
  );
}
