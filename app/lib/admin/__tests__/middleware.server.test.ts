import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AppLoadContext } from "react-router";

/**
 * Pins the admin loader/action gates introduced in TT-9. Non-admin
 * sessions must redirect; admin sessions must pass through the CSRF +
 * rate-limit gate (`enforceAdminActionGate`); loader callers must also
 * get a CSRF token minted for the forms they'll render.
 */

vi.mock("~/lib/supabase.server", () => ({
  getServerClient: vi.fn(),
}));
vi.mock("~/lib/auth.server", () => ({
  getUserWithRole: vi.fn(),
}));
vi.mock("~/lib/database.server", () => ({
  createSupabaseAdminClient: vi.fn(),
}));
vi.mock("~/lib/security.server", () => ({
  enforceAdminActionGate: vi.fn(),
  issueCSRFToken: vi.fn(),
}));

const { getServerClient } = await import("~/lib/supabase.server");
const { getUserWithRole } = await import("~/lib/auth.server");
const { createSupabaseAdminClient } = await import("~/lib/database.server");
const { enforceAdminActionGate, issueCSRFToken } =
  await import("~/lib/security.server");
const { ensureAdminAction, ensureAdminLoader } =
  await import("../middleware.server");

const fakeRequest = () => new Request("http://tt-reviews.local/admin/x");
const fakeContext = {
  cloudflare: { env: {} },
} as unknown as AppLoadContext;

function primeSupabase(headersTag = "x-test") {
  const headers = new Headers();
  headers.set("x-test-marker", headersTag);
  const sbServerClient = { client: {}, headers };
  vi.mocked(getServerClient).mockReturnValue(
    sbServerClient as ReturnType<typeof getServerClient>
  );
  return sbServerClient;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ensureAdminLoader", () => {
  it("redirects to / when the caller is not signed in", async () => {
    primeSupabase();
    vi.mocked(getUserWithRole).mockResolvedValue(null);

    const result = await ensureAdminLoader(fakeRequest(), fakeContext);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get("Location")).toBe("/");
    expect(issueCSRFToken).not.toHaveBeenCalled();
  });

  it("redirects to / when the caller is signed in but not admin", async () => {
    primeSupabase();
    vi.mocked(getUserWithRole).mockResolvedValue({
      id: "u1",
      role: "user",
    } as unknown as Awaited<ReturnType<typeof getUserWithRole>>);

    const result = await ensureAdminLoader(fakeRequest(), fakeContext);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect(issueCSRFToken).not.toHaveBeenCalled();
  });

  it("mints a CSRF token and returns the admin context for admin callers", async () => {
    primeSupabase();
    vi.mocked(getUserWithRole).mockResolvedValue({
      id: "admin-1",
      role: "admin",
    } as unknown as Awaited<ReturnType<typeof getUserWithRole>>);
    vi.mocked(issueCSRFToken).mockResolvedValue("token-xyz");
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      {} as ReturnType<typeof createSupabaseAdminClient>
    );

    const result = await ensureAdminLoader(fakeRequest(), fakeContext);
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) return;
    expect(result.user.id).toBe("admin-1");
    expect(result.csrfToken).toBe("token-xyz");
    expect(issueCSRFToken).toHaveBeenCalledWith(
      expect.any(Request),
      fakeContext,
      "admin-1"
    );
  });
});

describe("ensureAdminAction", () => {
  it("redirects non-admin callers without invoking the rate-limit gate", async () => {
    primeSupabase();
    vi.mocked(getUserWithRole).mockResolvedValue({
      id: "u2",
      role: "user",
    } as unknown as Awaited<ReturnType<typeof getUserWithRole>>);

    const result = await ensureAdminAction(fakeRequest(), fakeContext);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect(enforceAdminActionGate).not.toHaveBeenCalled();
  });

  it("returns the gate's Response (e.g. 403 CSRF) when the gate fails", async () => {
    primeSupabase();
    vi.mocked(getUserWithRole).mockResolvedValue({
      id: "admin-2",
      role: "admin",
    } as unknown as Awaited<ReturnType<typeof getUserWithRole>>);
    const gateResponse = new Response("forbidden", { status: 403 });
    vi.mocked(enforceAdminActionGate).mockResolvedValue(gateResponse);

    const result = await ensureAdminAction(fakeRequest(), fakeContext);
    expect(result).toBe(gateResponse);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("returns the admin action context when gate passes", async () => {
    primeSupabase();
    vi.mocked(getUserWithRole).mockResolvedValue({
      id: "admin-3",
      role: "admin",
    } as unknown as Awaited<ReturnType<typeof getUserWithRole>>);
    vi.mocked(enforceAdminActionGate).mockResolvedValue(null);
    const adminClient = { sentinel: true };
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      adminClient as unknown as ReturnType<typeof createSupabaseAdminClient>
    );

    const result = await ensureAdminAction(fakeRequest(), fakeContext);
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) return;
    expect(result.user.id).toBe("admin-3");
    expect(result.supabaseAdmin).toBe(adminClient);
    expect(enforceAdminActionGate).toHaveBeenCalledWith(
      expect.any(Request),
      fakeContext,
      "admin-3"
    );
  });
});
