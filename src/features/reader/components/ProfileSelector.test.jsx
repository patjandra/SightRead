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
    onSelect: vi.fn(), onDelete: vi.fn(), onCreate: vi.fn(),
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
