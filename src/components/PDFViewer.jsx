import React, { useState, useCallback } from "react";
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
 */
export default function PDFViewer({ pdfUrl, zoom, scrollContainerRef }) {
  const [numPages, setNumPages] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const onDocumentLoadSuccess = useCallback(({ numPages }) => {
    setNumPages(numPages);
    setLoadError(null);
  }, []);

  const onDocumentLoadError = useCallback((err) => {
    setLoadError("Failed to load PDF: " + err.message);
  }, []);

  if (!pdfUrl) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
        Upload a PDF to get started.
      </div>
    );
  }

  // Display factor: the pages are painted at BASE_RENDER_SCALE, so to show them
  // at the user's requested `zoom` we CSS-scale by the ratio.
  const displayZoom = zoom / BASE_RENDER_SCALE;

  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto bg-gray-200"
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
