import React, { useState, useCallback } from "react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

/**
 * Renders all pages of a PDF stacked vertically.
 *
 * Props:
 *   pdfUrl          - object URL string or null
 *   zoom            - scale factor (e.g. 1.0 = 100%)
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
        className="flex flex-col items-center py-4 gap-4"
      >
        {numPages &&
          Array.from({ length: numPages }, (_, i) => (
            <Page
              key={i + 1}
              pageNumber={i + 1}
              scale={zoom}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              className="shadow-lg"
            />
          ))}
      </Document>
    </div>
  );
}
