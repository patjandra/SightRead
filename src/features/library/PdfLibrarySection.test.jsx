// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import PdfLibrarySection from "./PdfLibrarySection.jsx";

afterEach(cleanup);

const base = {
  signedIn: true,
  pdfs: [{ id: "a", name: "Etude.pdf", size: 3 * 1024 * 1024 }],
  usedBytes: 3 * 1024 * 1024,
  limitBytes: 500 * 1024 * 1024,
  error: null,
  busy: false,
  canSave: false,
  activeId: null,
  onSave: vi.fn(),
  onOpen: vi.fn(),
  onDelete: vi.fn(),
};

describe("PdfLibrarySection", () => {
  it("lists saved PDFs with usage and wires open/delete", () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    render(<PdfLibrarySection {...base} onOpen={onOpen} onDelete={onDelete} />);
    expect(screen.getByText("Etude.pdf")).toBeInTheDocument();
    expect(screen.getByText("3.0 MB of 500.0 MB used")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Open Etude.pdf"));
    expect(onOpen).toHaveBeenCalledWith(base.pdfs[0]);
    fireEvent.click(screen.getByLabelText("Delete Etude.pdf"));
    expect(onDelete).toHaveBeenCalledWith(base.pdfs[0]);
  });

  it("shows an empty state", () => {
    render(<PdfLibrarySection {...base} pdfs={[]} usedBytes={0} />);
    expect(screen.getByText("No saved PDFs yet.")).toBeInTheDocument();
  });

  it("offers to save the open PDF, prompting guests to sign in", () => {
    const onSave = vi.fn();
    const { rerender } = render(<PdfLibrarySection {...base} canSave onSave={onSave} />);
    fireEvent.click(screen.getByText("Save to account"));
    expect(onSave).toHaveBeenCalledTimes(1);

    rerender(<PdfLibrarySection {...base} signedIn={false} pdfs={[]} limitBytes={0} canSave onSave={onSave} />);
    expect(screen.getByText("Sign in to save to account")).toBeInTheDocument();
    expect(screen.queryByText("Your library")).not.toBeInTheDocument();
  });

  it("hides the save button when there is nothing to save and shows errors", () => {
    render(<PdfLibrarySection {...base} error="Not enough storage left in your account." />);
    expect(screen.queryByText("Save to account")).not.toBeInTheDocument();
    expect(screen.getByText("Not enough storage left in your account.")).toBeInTheDocument();
  });

  describe("with many PDFs", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `id${i}`, name: `Piece ${i}.pdf`, size: 1024 }));
    const manyProps = { ...base, pdfs: many };

    it("has no search box and no scroll cap for a short list", () => {
      render(<PdfLibrarySection {...base} />);
      expect(screen.queryByLabelText("Search your PDFs")).not.toBeInTheDocument();
      expect(screen.getByRole("list")).not.toHaveClass("overflow-y-auto");
    });

    it("scrolls inside a fixed height and offers search", () => {
      render(<PdfLibrarySection {...manyProps} />);
      expect(screen.getByRole("list")).toHaveClass("overflow-y-auto");
      expect(screen.getByLabelText("Search your PDFs")).toBeInTheDocument();
    });

    it("filters by name, ignoring case, and says when nothing matches", () => {
      render(<PdfLibrarySection {...manyProps} />);
      const box = screen.getByLabelText("Search your PDFs");
      fireEvent.change(box, { target: { value: "  PIECE 3 " } });
      expect(screen.getAllByRole("listitem")).toHaveLength(1);
      expect(screen.getByText("Piece 3.pdf")).toBeInTheDocument();
      fireEvent.change(box, { target: { value: "zzz" } });
      expect(screen.queryAllByRole("listitem")).toHaveLength(0);
      expect(screen.getByText('No PDFs match "zzz".')).toBeInTheDocument();
    });
  });
});
