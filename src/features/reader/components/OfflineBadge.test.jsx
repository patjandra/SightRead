// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import OfflineBadge from "./OfflineBadge.jsx";

afterEach(cleanup);

describe("OfflineBadge", () => {
  it("renders nothing when online with nothing waiting", () => {
    const { container } = render(<OfflineBadge pendingCount={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows how many changes are waiting", () => {
    render(<OfflineBadge pendingCount={2} />);
    expect(screen.getByRole("status")).toHaveTextContent("2 changes waiting to sync");
  });

  it("says Offline when the connection drops, and clears when it returns", () => {
    render(<OfflineBadge pendingCount={1} />);
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(screen.getByRole("status")).toHaveTextContent("Offline · 1 change waiting to sync");
    act(() => void window.dispatchEvent(new Event("online")));
    expect(screen.getByRole("status")).not.toHaveTextContent("Offline");
  });
});
