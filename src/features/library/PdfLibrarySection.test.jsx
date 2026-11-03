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
});
