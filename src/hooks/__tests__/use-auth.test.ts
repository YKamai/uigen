import { test, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";
import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  (getAnonWorkData as any).mockReturnValue(null);
  (getProjects as any).mockResolvedValue([]);
  (createProject as any).mockResolvedValue({ id: "new-project" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("signIn: on success with anon work, creates a project from anon work and navigates to it", async () => {
  (signInAction as any).mockResolvedValue({ success: true });
  (getAnonWorkData as any).mockReturnValue({
    messages: [{ role: "user", content: "hello" }],
    fileSystemData: { "/": {} },
  });
  (createProject as any).mockResolvedValue({ id: "project-123" });

  const { result } = renderHook(() => useAuth());

  let signInResult;
  await act(async () => {
    signInResult = await result.current.signIn("test@example.com", "password123");
  });

  expect(signInAction).toHaveBeenCalledWith("test@example.com", "password123");
  expect(createProject).toHaveBeenCalledWith(
    expect.objectContaining({
      messages: [{ role: "user", content: "hello" }],
      data: { "/": {} },
    })
  );
  expect(clearAnonWork).toHaveBeenCalled();
  expect(pushMock).toHaveBeenCalledWith("/project-123");
  expect(getProjects).not.toHaveBeenCalled();
  expect(signInResult).toEqual({ success: true });
});

test("signIn: on success with no anon work but existing projects, navigates to most recent project", async () => {
  (signInAction as any).mockResolvedValue({ success: true });
  (getAnonWorkData as any).mockReturnValue(null);
  (getProjects as any).mockResolvedValue([
    { id: "recent-project" },
    { id: "older-project" },
  ]);

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signIn("test@example.com", "password123");
  });

  expect(createProject).not.toHaveBeenCalled();
  expect(pushMock).toHaveBeenCalledWith("/recent-project");
});

test("signIn: on success with no anon work and no projects, creates a new project", async () => {
  (signInAction as any).mockResolvedValue({ success: true });
  (getAnonWorkData as any).mockReturnValue(null);
  (getProjects as any).mockResolvedValue([]);
  (createProject as any).mockResolvedValue({ id: "new-project" });

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signIn("test@example.com", "password123");
  });

  expect(createProject).toHaveBeenCalledWith(
    expect.objectContaining({
      messages: [],
      data: {},
    })
  );
  expect(pushMock).toHaveBeenCalledWith("/new-project");
});

test("signIn: ignores anon work with empty messages and falls back to project lookup", async () => {
  (signInAction as any).mockResolvedValue({ success: true });
  (getAnonWorkData as any).mockReturnValue({ messages: [], fileSystemData: {} });
  (getProjects as any).mockResolvedValue([{ id: "recent-project" }]);

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signIn("test@example.com", "password123");
  });

  expect(createProject).not.toHaveBeenCalled();
  expect(pushMock).toHaveBeenCalledWith("/recent-project");
});

test("signIn: on failure, does not navigate or touch projects/anon work", async () => {
  (signInAction as any).mockResolvedValue({
    success: false,
    error: "Invalid credentials",
  });

  const { result } = renderHook(() => useAuth());

  let signInResult;
  await act(async () => {
    signInResult = await result.current.signIn("test@example.com", "wrong-password");
  });

  expect(signInResult).toEqual({ success: false, error: "Invalid credentials" });
  expect(getAnonWorkData).not.toHaveBeenCalled();
  expect(getProjects).not.toHaveBeenCalled();
  expect(createProject).not.toHaveBeenCalled();
  expect(pushMock).not.toHaveBeenCalled();
});

test("signIn: sets isLoading true while in flight and false after completion", async () => {
  let resolveSignIn: (value: any) => void;
  (signInAction as any).mockReturnValue(
    new Promise((resolve) => {
      resolveSignIn = resolve;
    })
  );

  const { result } = renderHook(() => useAuth());

  expect(result.current.isLoading).toBe(false);

  let signInPromise: Promise<any>;
  act(() => {
    signInPromise = result.current.signIn("test@example.com", "password123");
  });

  await waitFor(() => expect(result.current.isLoading).toBe(true));

  await act(async () => {
    resolveSignIn({ success: true });
    await signInPromise;
  });

  expect(result.current.isLoading).toBe(false);
});

test("signIn: resets isLoading even when the sign-in action throws", async () => {
  (signInAction as any).mockRejectedValue(new Error("network error"));

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await expect(
      result.current.signIn("test@example.com", "password123")
    ).rejects.toThrow("network error");
  });

  expect(result.current.isLoading).toBe(false);
  expect(pushMock).not.toHaveBeenCalled();
});

test("signUp: on success, runs post sign-in flow and navigates", async () => {
  (signUpAction as any).mockResolvedValue({ success: true });
  (getAnonWorkData as any).mockReturnValue(null);
  (getProjects as any).mockResolvedValue([{ id: "existing-project" }]);

  const { result } = renderHook(() => useAuth());

  let signUpResult;
  await act(async () => {
    signUpResult = await result.current.signUp("new@example.com", "password123");
  });

  expect(signUpAction).toHaveBeenCalledWith("new@example.com", "password123");
  expect(pushMock).toHaveBeenCalledWith("/existing-project");
  expect(signUpResult).toEqual({ success: true });
});

test("signUp: on failure, does not run post sign-in flow", async () => {
  (signUpAction as any).mockResolvedValue({
    success: false,
    error: "Email already registered",
  });

  const { result } = renderHook(() => useAuth());

  let signUpResult;
  await act(async () => {
    signUpResult = await result.current.signUp("existing@example.com", "password123");
  });

  expect(signUpResult).toEqual({
    success: false,
    error: "Email already registered",
  });
  expect(getAnonWorkData).not.toHaveBeenCalled();
  expect(pushMock).not.toHaveBeenCalled();
});

test("signUp: sets isLoading true while in flight and false after completion", async () => {
  let resolveSignUp: (value: any) => void;
  (signUpAction as any).mockReturnValue(
    new Promise((resolve) => {
      resolveSignUp = resolve;
    })
  );

  const { result } = renderHook(() => useAuth());

  let signUpPromise: Promise<any>;
  act(() => {
    signUpPromise = result.current.signUp("new@example.com", "password123");
  });

  await waitFor(() => expect(result.current.isLoading).toBe(true));

  await act(async () => {
    resolveSignUp({ success: true });
    await signUpPromise;
  });

  expect(result.current.isLoading).toBe(false);
});

test("signUp: resets isLoading even when the sign-up action throws", async () => {
  (signUpAction as any).mockRejectedValue(new Error("network error"));

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await expect(
      result.current.signUp("new@example.com", "password123")
    ).rejects.toThrow("network error");
  });

  expect(result.current.isLoading).toBe(false);
  expect(pushMock).not.toHaveBeenCalled();
});
