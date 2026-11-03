import { Hono } from "hono";
import { ApiError } from "../errors.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { isUuid } from "../services/calibrations.js";
import {
  MAX_PDF_BYTES,
  MAX_USER_BYTES,
  cleanName,
  deletePdf,
  listPdfs,
  openPdf,
  readCapped,
  savePdf,
  usage,
} from "../services/pdfs.js";

const pdfs = new Hono();

pdfs.use("*", requireAuth);

function pdfId(c) {
  const id = c.req.param("id");
  if (!isUuid(id)) throw new ApiError(400, "invalid_id", "PDF id must be a UUID.");
  return id.toLowerCase();
}

pdfs.get("/", async (c) => {
  c.header("Cache-Control", "no-store");
  const userId = c.get("userId");
  const { usedBytes } = await usage(c.env.DB, userId);
  return c.json({
    pdfs: await listPdfs(c.env.DB, userId),
    usedBytes,
    limitBytes: MAX_USER_BYTES,
    maxFileBytes: MAX_PDF_BYTES,
  });
});

pdfs.put("/:id", async (c) => {
  const id = pdfId(c);
  const name = cleanName(c.req.header("X-Filename"));
  const bytes = await readCapped(c.req.raw, MAX_PDF_BYTES);
  const pdf = await savePdf(c.env, c.get("userId"), id, name, bytes);
  return c.json({ pdf });
});

pdfs.get("/:id/file", async (c) => {
  const { object } = await openPdf(c.env, c.get("userId"), pdfId(c));
  return new Response(object.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="document.pdf"',
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});

pdfs.delete("/:id", async (c) => {
  await deletePdf(c.env, c.get("userId"), pdfId(c));
  return c.body(null, 204);
});

export default pdfs;
