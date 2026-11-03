// The only module that talks to /api/pdfs/*. Everything else uses usePdfLibrary().

export const MAX_PDF_BYTES = 25 * 1024 * 1024;

export class PdfApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = "GET", body, headers } = {}) {
  const res = await fetch(`/api/pdfs${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      // Required by the Worker's CSRF check on state-changing requests.
      "X-Requested-With": "sightread",
      ...headers,
    },
    body,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new PdfApiError(data?.error?.message ?? "Request failed.", res.status, data?.error?.code);
  }
  return res;
}

/** @returns {Promise<{ pdfs: object[], usedBytes: number, limitBytes: number }>} */
export const listPdfs = async () => (await request("")).json();

/** Fast client-side checks so obvious mistakes fail before any upload. The server re-checks. */
export async function checkPdfFile(file) {
  if (file.size > MAX_PDF_BYTES) {
    throw new PdfApiError(`PDFs can be at most ${MAX_PDF_BYTES / 1024 / 1024} MB.`, 413, "too_large");
  }
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (new TextDecoder().decode(head) !== "%PDF-") {
    throw new PdfApiError("That file is not a PDF.", 415, "not_a_pdf");
  }
}

/** Hex SHA-256 of a file, matching the fingerprint the server stores. */
export async function fileSha256(file) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Upload under a client-chosen UUID (idempotent). `duplicate` is true when the
 * account already held a file with the same contents; `pdf` is then that one.
 * @returns {Promise<{ pdf: object, duplicate: boolean }>}
 */
export async function uploadPdf(id, file) {
  await checkPdfFile(file);
  const res = await request(`/${id}`, {
    method: "PUT",
    body: file,
    headers: { "X-Filename": encodeURIComponent(file.name) },
  });
  const { pdf, duplicate } = await res.json();
  return { pdf, duplicate: !!duplicate };
}

/** @returns {Promise<Blob>} */
export const downloadPdf = async (id) => (await request(`/${id}/file`)).blob();

export const deletePdf = async (id) => {
  await request(`/${id}`, { method: "DELETE" });
};
