// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ProfileSelector from "./ProfileSelector.jsx";

afterEach(cleanup);

const POINTS = { top: 0.1, center: 0.5, bottom: 0.9 };
const profile = (id, syncState, over = {}) => ({
  id, name: id, points: POINTS, ownerId: syncState === "local" ? null : "u1", syncState, ...over,
});

function setup(profiles, props = {}) {
  const handlers = {
    onSelect: vi.fn(), onDelete: vi.fn(), onCreate: vi.fn(), onRename: vi.fn(),
    onSaveToAccount: vi.fn(), onRetrySync: vi.fn(),
  };
  render(<ProfileSelector profiles={profiles} selectedId={null} {...handlers} {...props} />);
  fireEvent.click(screen.getByText("Select profile…")); // open the dropdown
  return handlers;
}

describe("sync control", () => {
  it("lets a guest-local profile be saved to the account without selecting it", () => {
    const h = setup([profile("desk", "local")]);
    fireEvent.click(screen.getByLabelText("Save desk to account"));
    expect(h.onSaveToAccount).toHaveBeenCalledWith("desk");
    expect(h.onSelect).not.toHaveBeenCalled();
  });

  it("shows a synced profile as saved, with no save button", () => {
    setup([profile("desk", "synced")]);
    expect(screen.getByTitle("Saved to your account")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Save desk to account/)).not.toBeInTheDocument();
  });

  it("shows a pending profile as syncing", () => {
    setup([profile("desk", "pending")], { syncStatus: "syncing" });
    expect(screen.getByTitle("Syncing…")).toBeInTheDocument();
  });

  it("offers a retry when a pending profile failed to sync", () => {
    const h = setup([profile("desk", "pending")], { syncStatus: "error" });
    fireEvent.click(screen.getByLabelText("Not synced yet. Retry."));
    expect(h.onRetrySync).toHaveBeenCalledTimes(1);
    expect(h.onSelect).not.toHaveBeenCalled();
  });

  it("mentions the account when deleting a synced profile", () => {
    setup([profile("a", "synced"), profile("b", "local")]);
    expect(screen.getByTitle("Delete profile (also removes it from your account)")).toBeInTheDocument();
    expect(screen.getByTitle("Delete profile")).toBeInTheDocument();
  });
});

describe("rename", () => {
  const edit = () => {
    fireEvent.click(screen.getByLabelText("Rename desk"));
    return screen.getByLabelText("New name for desk");
  };

  it("turns the name into a focused, prefilled input without selecting the profile", () => {
    const h = setup([profile("desk", "local")]);
    const input = edit();
    expect(input).toHaveValue("desk");
    expect(input).toHaveFocus();
    expect(h.onSelect).not.toHaveBeenCalled();
    fireEvent.click(input);
    expect(h.onSelect).not.toHaveBeenCalled();
  });

  it("saves the trimmed name on Enter", () => {
    const h = setup([profile("desk", "local")]);
    const input = edit();
    fireEvent.change(input, { target: { value: "  Piano  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(h.onRename).toHaveBeenCalledTimes(1);
    expect(h.onRename).toHaveBeenCalledWith("desk", "Piano");
    expect(screen.queryByLabelText("New name for desk")).not.toBeInTheDocument();
  });

  it("saves on blur", () => {
    const h = setup([profile("desk", "local")]);
    const input = edit();
    fireEvent.change(input, { target: { value: "Piano" } });
    fireEvent.blur(input);
    expect(h.onRename).toHaveBeenCalledWith("desk", "Piano");
  });

  it("cancels on Escape, even though the input then blurs", () => {
    const h = setup([profile("desk", "local")]);
    const input = edit();
    fireEvent.change(input, { target: { value: "Piano" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);
    expect(h.onRename).not.toHaveBeenCalled();
    expect(screen.getByText("desk")).toBeInTheDocument();
  });

  it("ignores empty and unchanged names", () => {
    const h = setup([profile("desk", "local")]);
    fireEvent.change(edit(), { target: { value: "   " } });
    fireEvent.keyDown(screen.getByLabelText("New name for desk"), { key: "Enter" });
    edit();
    fireEvent.keyDown(screen.getByLabelText("New name for desk"), { key: "Enter" });
    expect(h.onRename).not.toHaveBeenCalled();
    expect(screen.getByText("desk")).toBeInTheDocument();
  });

  it("caps the input at the server's name limit", () => {
    setup([profile("desk", "local")]);
    expect(edit()).toHaveAttribute("maxLength", "100");
  });
});
