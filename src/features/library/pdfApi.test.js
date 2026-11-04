import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MAX_PDF_BYTES, PdfApiError, checkPdfFile, deletePdf, downloadPdf, fileSha256, listPdfs, uploadPdf } from "./pdfApi.js";

const pdfFile = (name = "Etude.pdf") => new File(["%PDF-1.7 body"], name, { type: "application/pdf" });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("checkPdfFile", () => {
  it("accepts a file that starts with %PDF-", async () => {
    await expect(checkPdfFile(pdfFile())).resolves.toBeUndefined();
  });

  it("rejects other content, even with a .pdf name", async () => {
    const fake = new File(["<html></html>"], "x.pdf", { type: "application/pdf" });
    await expect(checkPdfFile(fake)).rejects.toMatchObject({ code: "not_a_pdf" });
  });

  it("rejects files over the size limit", async () => {
    const big = { size: MAX_PDF_BYTES + 1, slice: () => new Blob(["%PDF-"]) };
    await expect(checkPdfFile(big)).rejects.toMatchObject({ code: "too_large" });
  });
});

describe("fileSha256", () => {
  it("matches the known SHA-256 of the contents", async () => {
    // sha256("abc")
    expect(await fileSha256(new File(["abc"], "x.pdf"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});

describe("uploadPdf", () => {
  it("reports when the server found a duplicate", async () => {
    fetchMock.mockResolvedValue(json({ pdf: { id: "old" }, duplicate: true }));
    expect(await uploadPdf("id-2", pdfFile())).toEqual({ pdf: { id: "old" }, duplicate: true });
  });

  it("PUTs the raw file with the CSRF header and an encoded file name", async () => {
    fetchMock.mockResolvedValue(json({ pdf: { id: "a", name: "Étude #1.pdf" }, duplicate: false }));
    const file = pdfFile("Étude #1.pdf");
    const { pdf, duplicate } = await uploadPdf("id-1", file);
    expect(pdf.id).toBe("a");
    expect(duplicate).toBe(false);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/pdfs/id-1");
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(file);
    expect(init.headers["X-Requested-With"]).toBe("sightread");
    expect(decodeURIComponent(init.headers["X-Filename"])).toBe("Étude #1.pdf");
  });

  it("does not hit the network for an invalid file", async () => {
    await expect(uploadPdf("id-1", new File(["nope"], "x.pdf"))).rejects.toBeInstanceOf(PdfApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the server's error message and status", async () => {
    fetchMock.mockResolvedValue(json({ error: { code: "quota_exceeded", message: "Full." } }, 413));
    await expect(uploadPdf("id-1", pdfFile())).rejects.toMatchObject({
      status: 413,
      code: "quota_exceeded",
      message: "Full.",
    });
  });
});

describe("other calls", () => {
  it("lists, downloads and deletes", async () => {
    fetchMock.mockResolvedValueOnce(json({ pdfs: [], usedBytes: 0, limitBytes: 5 }));
    expect(await listPdfs()).toMatchObject({ limitBytes: 5 });

    fetchMock.mockResolvedValueOnce(new Response("%PDF-bytes"));
    expect(await (await downloadPdf("x")).text()).toBe("%PDF-bytes");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/pdfs/x/file");

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await deletePdf("x");
    expect(fetchMock.mock.calls[2][1].method).toBe("DELETE");
  });
});
