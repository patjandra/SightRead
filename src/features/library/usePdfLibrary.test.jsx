// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("./pdfApi.js", () => ({
  listPdfs: vi.fn(),
  uploadPdf: vi.fn(),
  downloadPdf: vi.fn(),
  deletePdf: vi.fn(),
}));

import * as api from "./pdfApi.js";
import { usePdfLibrary } from "./usePdfLibrary.js";

const USER = { id: "u1" };
const LIST = { pdfs: [{ id: "a", name: "A.pdf", size: 10 }], usedBytes: 10, limitBytes: 100 };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("usePdfLibrary", () => {
  it("makes no requests for a guest", () => {
    const { result } = renderHook(() => usePdfLibrary({ user: null }));
    expect(result.current.pdfs).toEqual([]);
    expect(api.listPdfs).not.toHaveBeenCalled();
  });

  it("loads the list for a signed-in user and clears it on sign-out", async () => {
    api.listPdfs.mockResolvedValue(LIST);
    const { result, rerender } = renderHook(({ user }) => usePdfLibrary({ user }), {
      initialProps: { user: USER },
    });
    await waitFor(() => expect(result.current.pdfs).toHaveLength(1));
    expect(result.current).toMatchObject({ usedBytes: 10, limitBytes: 100 });

    rerender({ user: null });
    await waitFor(() => expect(result.current.pdfs).toEqual([]));
    expect(result.current.limitBytes).toBe(0);
  });

  it("save uploads under a fresh id and refreshes the list", async () => {
    api.listPdfs.mockResolvedValue({ pdfs: [], usedBytes: 0, limitBytes: 100 });
    api.uploadPdf.mockResolvedValue({ id: "new" });
    const { result } = renderHook(() => usePdfLibrary({ user: USER }));
    await waitFor(() => expect(api.listPdfs).toHaveBeenCalledTimes(1));

    api.listPdfs.mockResolvedValue(LIST);
    const file = new File(["%PDF-"], "A.pdf");
    let saved;
    await act(async () => {
      saved = await result.current.save(file);
    });
    expect(saved).toEqual({ id: "new" });
    expect(api.uploadPdf).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]{36}$/), file);
    expect(result.current.pdfs).toHaveLength(1);
    expect(result.current.busy).toBe(false);
  });

  it("reports an upload error and rejects", async () => {
    api.listPdfs.mockResolvedValue(LIST);
    api.uploadPdf.mockRejectedValue(Object.assign(new Error("Not enough storage."), { status: 413 }));
    const { result } = renderHook(() => usePdfLibrary({ user: USER }));
    await waitFor(() => expect(result.current.pdfs).toHaveLength(1));
    await act(async () => {
      await expect(result.current.save(new File(["%PDF-"], "A.pdf"))).rejects.toThrow();
    });
    expect(result.current.error).toBe("Not enough storage.");
    expect(result.current.busy).toBe(false);
  });

  it("asks the caller to re-check the session on a 401", async () => {
    api.listPdfs.mockResolvedValue(LIST);
    const onUnauthorized = vi.fn();
    api.downloadPdf.mockRejectedValue(Object.assign(new Error("Sign in required."), { status: 401 }));
    const { result } = renderHook(() => usePdfLibrary({ user: USER, onUnauthorized }));
    await waitFor(() => expect(result.current.pdfs).toHaveLength(1));
    await act(async () => {
      await expect(result.current.open("a")).rejects.toThrow();
    });
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it("remove deletes and refreshes", async () => {
    api.listPdfs.mockResolvedValue(LIST);
    api.deletePdf.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePdfLibrary({ user: USER }));
    await waitFor(() => expect(result.current.pdfs).toHaveLength(1));
    api.listPdfs.mockResolvedValue({ pdfs: [], usedBytes: 0, limitBytes: 100 });
    await act(async () => {
      await result.current.remove("a");
    });
    expect(api.deletePdf).toHaveBeenCalledWith("a");
    expect(result.current.pdfs).toEqual([]);
  });
});
