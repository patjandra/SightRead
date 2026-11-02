// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("./authClient.js", () => ({
  getMe: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
}));
// Stand in for Google's button: clicking it "returns" a credential.
vi.mock("./GoogleSignInButton.jsx", () => ({
  default: ({ onCredential }) => (
    <button onClick={() => onCredential("fake-credential")}>google</button>
  ),
}));

import * as client from "./authClient.js";
import AuthProvider from "./AuthProvider.jsx";
import { useAuth } from "./useAuth.js";
import { useOnSignOut } from "./useOnSignOut.js";

const USER = { id: "u1", email: "ada@example.com", name: "Ada", picture: null };

function Harness({ action }) {
  const { status, user, requireAuth } = useAuth();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="user">{user?.email ?? "none"}</p>
      <button onClick={() => requireAuth(action)}>save</button>
    </div>
  );
}

function renderApp(action) {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Harness action={action} />
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(cleanup);

describe("AuthProvider / requireAuth", () => {
  it("starts as guest when there is no session", async () => {
    client.getMe.mockResolvedValue({ user: null });
    renderApp(vi.fn());
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("guest"));
  });

  it("falls back to guest, flagged as unknown, if the API is unreachable", async () => {
    client.getMe.mockRejectedValue(new Error("offline"));
    let seen;
    function Probe() {
      seen = useAuth();
      return null;
    }
    render(
      <MemoryRouter>
        <AuthProvider>
          <Harness action={vi.fn()} />
          <Probe />
        </AuthProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("guest"));
    expect(seen.sessionUnknown).toBe(true);
  });

  it("refresh() re-checks the session and clears the unknown flag", async () => {
    client.getMe.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ user: USER });
    let seen;
    function Probe() {
      seen = useAuth();
      return null;
    }
    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(seen.sessionUnknown).toBe(true));
    await seen.refresh();
    await waitFor(() => expect(seen.status).toBe("signed-in"));
    expect(seen.sessionUnknown).toBe(false);
  });

  it("runs the action immediately when signed in", async () => {
    client.getMe.mockResolvedValue({ user: USER });
    const action = vi.fn();
    renderApp(action);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed-in"));

    fireEvent.click(screen.getByText("save"));
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(USER);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("prompts guests, then resumes the action after sign-in", async () => {
    client.getMe.mockResolvedValue({ user: null });
    client.signInWithGoogle.mockResolvedValue({ user: USER });
    const action = vi.fn();
    renderApp(action);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("guest"));

    fireEvent.click(screen.getByText("save"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("google"));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action).toHaveBeenCalledWith(USER); // gets the freshly signed-in user
    expect(client.signInWithGoogle).toHaveBeenCalledWith("fake-credential");
    expect(screen.getByTestId("user")).toHaveTextContent("ada@example.com");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("discards the action when the prompt is dismissed", async () => {
    client.getMe.mockResolvedValue({ user: null });
    const action = vi.fn();
    renderApp(action);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("guest"));

    fireEvent.click(screen.getByText("save"));
    fireEvent.click(screen.getByText("Not now"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("keeps the prompt open and shows an error when sign-in fails", async () => {
    client.getMe.mockResolvedValue({ user: null });
    client.signInWithGoogle.mockRejectedValue(new Error("Google sign-in could not be verified."));
    const action = vi.fn();
    renderApp(action);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("guest"));

    fireEvent.click(screen.getByText("save"));
    fireEvent.click(screen.getByText("google"));
    await screen.findByText("Google sign-in could not be verified.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("openSignIn shows the prompt without navigating and without a pending action", async () => {
    client.getMe.mockResolvedValue({ user: null });
    client.signInWithGoogle.mockResolvedValue({ user: USER });
    function OpenHarness() {
      const { user, openSignIn } = useAuth();
      return (
        <>
          <p data-testid="u">{user?.email ?? "none"}</p>
          <button onClick={openSignIn}>open</button>
        </>
      );
    }
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <OpenHarness />
        </AuthProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(client.getMe).toHaveBeenCalled());

    fireEvent.click(screen.getByText("open"));
    expect(screen.getByRole("dialog")).toHaveTextContent("Sign in to SightRead");

    fireEvent.click(screen.getByText("google"));
    await waitFor(() => expect(screen.getByTestId("u")).toHaveTextContent("ada@example.com"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("signOut returns to guest", async () => {
    client.getMe.mockResolvedValue({ user: USER });
    client.signOut.mockResolvedValue(null);
    function SignOutHarness() {
      const { status, signOut } = useAuth();
      return (
        <>
          <p data-testid="s">{status}</p>
          <button onClick={signOut}>out</button>
        </>
      );
    }
    render(
      <MemoryRouter>
        <AuthProvider>
          <SignOutHarness />
        </AuthProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("signed-in"));
    fireEvent.click(screen.getByText("out"));
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("guest"));
  });

  it("stays signed in and rejects when sign-out fails", async () => {
    client.getMe.mockResolvedValue({ user: USER });
    client.signOut.mockRejectedValue(new Error("network"));
    let result;
    function Harness() {
      const { status, signOut } = useAuth();
      return (
        <>
          <p data-testid="s">{status}</p>
          <button onClick={() => signOut().catch((e) => (result = e))}>out</button>
        </>
      );
    }
    render(
      <MemoryRouter>
        <AuthProvider>
          <Harness />
        </AuthProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("signed-in"));
    fireEvent.click(screen.getByText("out"));
    await waitFor(() => expect(result).toBeInstanceOf(Error));
    expect(screen.getByTestId("s")).toHaveTextContent("signed-in");
  });
});

describe("useOnSignOut", () => {
  function Watcher({ onOut }) {
    const { signOut } = useAuth();
    useOnSignOut(onOut);
    return <button onClick={signOut}>out</button>;
  }
  const mount = (onOut) =>
    render(
      <MemoryRouter>
        <AuthProvider>
          <Watcher onOut={onOut} />
        </AuthProvider>
      </MemoryRouter>
    );

  it("fires when a signed-in user signs out", async () => {
    client.getMe.mockResolvedValue({ user: USER });
    client.signOut.mockResolvedValue(null);
    const onOut = vi.fn();
    mount(onOut);
    await waitFor(() => expect(client.getMe).toHaveBeenCalled());
    await Promise.resolve();
    expect(onOut).not.toHaveBeenCalled(); // not on load

    fireEvent.click(screen.getByText("out"));
    await waitFor(() => expect(onOut).toHaveBeenCalledTimes(1));
  });

  it("does not fire for a guest", async () => {
    client.getMe.mockResolvedValue({ user: null });
    client.signOut.mockResolvedValue(null);
    const onOut = vi.fn();
    mount(onOut);
    await waitFor(() => expect(client.getMe).toHaveBeenCalled());

    fireEvent.click(screen.getByText("out"));
    await new Promise((r) => setTimeout(r, 20));
    expect(onOut).not.toHaveBeenCalled();
  });
});
