import { describe, it, expect } from "vitest";
import { hardenCookieOptions } from "../supabase.server";

/**
 * SECURITY.md Phase 9 (TT-18). `@supabase/ssr` defaults to safe cookie
 * flags (`httpOnly`, `sameSite: "lax"`, `secure`), but `getServerClient`
 * hardens the serialization path defensively: if the SDK ever ships a
 * regression or we ever pipe a different cookie source through
 * `setAll`, the flags still end up safe before `Set-Cookie` is written.
 */

describe("hardenCookieOptions", () => {
  it("fills in httpOnly + sameSite=lax + secure + path when options are empty (prod)", () => {
    const result = hardenCookieOptions({}, false);
    expect(result.httpOnly).toBe(true);
    expect(result.sameSite).toBe("lax");
    expect(result.secure).toBe(true);
    expect(result.path).toBe("/");
  });

  it("fills in safe defaults when options is undefined", () => {
    const result = hardenCookieOptions(undefined, false);
    expect(result.httpOnly).toBe(true);
    expect(result.sameSite).toBe("lax");
    expect(result.secure).toBe(true);
    expect(result.path).toBe("/");
  });

  it("forces secure=false in development (browsers reject Secure on HTTP)", () => {
    const result = hardenCookieOptions({ secure: true }, true);
    expect(result.secure).toBe(false);
    // Other flags still hardened:
    expect(result.httpOnly).toBe(true);
    expect(result.sameSite).toBe("lax");
  });

  it("preserves an explicit stricter sameSite", () => {
    const result = hardenCookieOptions({ sameSite: "strict" }, false);
    expect(result.sameSite).toBe("strict");
    // The harden pass still fills in httpOnly/secure since they were absent.
    expect(result.httpOnly).toBe(true);
    expect(result.secure).toBe(true);
  });

  it("preserves an explicit non-root path", () => {
    const result = hardenCookieOptions({ path: "/admin" }, false);
    expect(result.path).toBe("/admin");
  });

  it("preserves explicit httpOnly=false if the caller really meant it", () => {
    // Unlikely in practice, but we honour the caller's explicit choice
    // rather than silently flipping it. The ??= fallback only kicks in
    // when the option is missing (undefined), not when it's an explicit
    // false.
    const result = hardenCookieOptions({ httpOnly: false }, false);
    expect(result.httpOnly).toBe(false);
  });
});
