// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import UploadLocalProfilesDialog from "./UploadLocalProfilesDialog.jsx";

afterEach(cleanup);

const profiles = [
  { id: "a", name: "Desk", points: { top: 0, center: 0.5, bottom: 1 } },
  { id: "b", name: "Piano", points: null },
];

function setup() {
  const onConfirm = vi.fn();
  const onSkip = vi.fn();
  render(<UploadLocalProfilesDialog profiles={profiles} onConfirm={onConfirm} onSkip={onSkip} />);
  return { onConfirm, onSkip };
}

describe("UploadLocalProfilesDialog", () => {
  it("starts with everything checked and uploads them all", () => {
    const { onConfirm } = setup();
    expect(screen.getAllByRole("checkbox").every((c) => c.checked)).toBe(true);
    fireEvent.click(screen.getByText("Save 2 profiles"));
    expect(onConfirm).toHaveBeenCalledWith(["a", "b"]);
  });

  it("uploads only what stays checked", () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByLabelText(/Piano/));
    fireEvent.click(screen.getByText("Save 1 profile"));
    expect(onConfirm).toHaveBeenCalledWith(["a"]);
  });

  it("disables saving when nothing is checked", () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByLabelText(/Desk/));
    fireEvent.click(screen.getByLabelText(/Piano/));
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("flags uncalibrated profiles", () => {
    setup();
    expect(screen.getByText("uncalibrated")).toBeInTheDocument();
  });

  it("skips on 'Not now' and on Escape", () => {
    const { onSkip } = setup();
    fireEvent.click(screen.getByText("Not now"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onSkip).toHaveBeenCalledTimes(2);
  });
});
