import { describe, it, expect, vi } from "vitest";
import { checkAndPromoteAdmin } from "../auto-promote.server";

/**
 * SECURITY.md Phase 9 (TT-18). `checkAndPromoteAdmin` is called on
 * every authenticated request via `getUserWithRole`. If a user signs up
 * with an email that happens to appear in `AUTO_ADMIN_EMAILS` and
 * Supabase has confirmation enabled, their row has
 * `email_confirmed_at === null` until they click the link. Without the
 * `emailConfirmed` guard, the signed-in-but-unverified session would
 * still pass the earlier `auth.getUser()` call and get promoted on
 * first request. This suite pins the guard.
 */

function makeAdminClientStub() {
  const maybeSingle = vi.fn().mockResolvedValue({ data: null });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockResolvedValue({ error: null });

  const singleChain = { single: vi.fn().mockResolvedValue({ data: null }) };
  const eqChainForSelect = {
    eq: vi.fn().mockReturnValue(singleChain),
  };
  const selectChain = {
    eq: vi.fn().mockReturnValue(singleChain),
    single: maybeSingle,
  };

  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue(selectChain),
    insert,
    update: vi
      .fn()
      .mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  });

  return { from, insert, update, eqChainForSelect };
}

describe("checkAndPromoteAdmin — email verification guard", () => {
  it("refuses when emailConfirmed is false, without touching user_roles", async () => {
    const stub = makeAdminClientStub();
    const result = await checkAndPromoteAdmin(
      { from: stub.from } as any,
      "admin@example.com",
      "user-id-1",
      "admin@example.com",
      false
    );

    expect(result).toBe(false);
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("refuses when the email is not in the allowlist, even if confirmed", async () => {
    const stub = makeAdminClientStub();
    const result = await checkAndPromoteAdmin(
      { from: stub.from } as any,
      "not-admin@example.com",
      "user-id-2",
      "admin@example.com",
      true
    );

    expect(result).toBe(false);
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("refuses when adminEmails is empty", async () => {
    const stub = makeAdminClientStub();
    const result = await checkAndPromoteAdmin(
      { from: stub.from } as any,
      "admin@example.com",
      "user-id-3",
      "",
      true
    );

    expect(result).toBe(false);
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("case-insensitive match on the allowlist", async () => {
    const stub = makeAdminClientStub();
    const result = await checkAndPromoteAdmin(
      { from: stub.from } as any,
      "ADMIN@Example.com",
      "user-id-4",
      "admin@example.com",
      true
    );

    // When confirmed and email matches, the from() path is hit to
    // check / insert the role. We don't need to assert the full insert
    // flow here — the earlier tests prove the guard refuses; this one
    // proves the guard does not block the happy path on a case mismatch.
    expect(stub.from).toHaveBeenCalled();
    expect(typeof result).toBe("boolean");
  });
});
