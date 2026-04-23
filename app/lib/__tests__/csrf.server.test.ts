import { describe, it, expect } from "vitest";
import {
  generateCSRFToken,
  getSessionId,
  getSessionSecret,
  validateCSRFFromRequest,
  validateCSRFToken,
  requiresCSRFProtection,
} from "../csrf.server";

const SECRET = "a-secret-that-is-definitely-long-enough";
const SESSION_ID = "session-abc";
const USER_ID = "user-123";

function makeRequest(options: {
  method?: string;
  url?: string;
  body?: FormData;
  cookie?: string;
  csrfHeader?: string;
}): Request {
  const headers = new Headers();
  if (options.cookie) headers.set("Cookie", options.cookie);
  if (options.csrfHeader) headers.set("X-CSRF-Token", options.csrfHeader);
  return new Request(options.url ?? "https://tt-reviews.local/admin/foo", {
    method: options.method ?? "POST",
    headers,
    body: options.body,
  });
}

describe("getSessionSecret", () => {
  it("returns the secret when set", () => {
    expect(getSessionSecret({ SESSION_SECRET: SECRET })).toBe(SECRET);
  });

  it("throws when SESSION_SECRET is missing", () => {
    expect(() => getSessionSecret({})).toThrow(/SESSION_SECRET/);
  });

  it("throws when SESSION_SECRET is empty", () => {
    expect(() => getSessionSecret({ SESSION_SECRET: "" })).toThrow(
      /SESSION_SECRET/
    );
  });

  it("throws when SESSION_SECRET is too short", () => {
    expect(() => getSessionSecret({ SESSION_SECRET: "too-short" })).toThrow(
      /too short/
    );
  });
});

describe("generateCSRFToken + validateCSRFToken roundtrip", () => {
  it("validates a freshly-issued token", () => {
    const token = generateCSRFToken(SESSION_ID, USER_ID, SECRET);
    expect(validateCSRFToken(token, SESSION_ID, SECRET, USER_ID)).toEqual({
      valid: true,
    });
  });

  it("rejects a token signed with a different secret", () => {
    const token = generateCSRFToken(SESSION_ID, USER_ID, SECRET);
    const result = validateCSRFToken(
      token,
      SESSION_ID,
      "a-different-secret-of-sufficient-length",
      USER_ID
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid signature");
  });

  it("rejects a token bound to a different session", () => {
    const token = generateCSRFToken(SESSION_ID, USER_ID, SECRET);
    const result = validateCSRFToken(
      token,
      "different-session",
      SECRET,
      USER_ID
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Session mismatch");
  });

  it("rejects a token bound to a different user", () => {
    const token = generateCSRFToken(SESSION_ID, USER_ID, SECRET);
    const result = validateCSRFToken(
      token,
      SESSION_ID,
      SECRET,
      "different-user"
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe("User mismatch");
  });

  it("rejects a token whose signature byte was flipped", () => {
    const token = generateCSRFToken(SESSION_ID, USER_ID, SECRET);
    const decoded = JSON.parse(Buffer.from(token, "base64url").toString());
    const sig = decoded.signature as string;
    // Flip the last character of the signature.
    decoded.signature = sig.slice(0, -1) + (sig.slice(-1) === "0" ? "1" : "0");
    const tampered = Buffer.from(JSON.stringify(decoded)).toString("base64url");

    const result = validateCSRFToken(tampered, SESSION_ID, SECRET, USER_ID);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid signature");
  });

  it("rejects a token whose userId field was swapped (signature covers it)", () => {
    const token = generateCSRFToken(SESSION_ID, USER_ID, SECRET);
    const decoded = JSON.parse(Buffer.from(token, "base64url").toString());
    decoded.userId = "attacker-user-id";
    const tampered = Buffer.from(JSON.stringify(decoded)).toString("base64url");

    // Validating against the *tampered* userId catches the tamper via
    // signature verification — the canonical payload used for the HMAC
    // includes userId.
    const result = validateCSRFToken(
      tampered,
      SESSION_ID,
      SECRET,
      "attacker-user-id"
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid signature");
  });

  it("rejects a token that has expired", () => {
    // Issue a token, then manually backdate its timestamp past the 24h
    // lifetime. Since the signature covers timestamp, the tampered
    // token fails on signature check — which is fine because the
    // envelope-level expiry check would also fail. Produce a correctly
    // signed but expired token by crafting the payload directly.
    const { createHmac } = require("crypto") as typeof import("crypto");
    const oldTs = Date.now() - 25 * 60 * 60 * 1000;
    const payload = {
      token: "00".repeat(32),
      sessionId: SESSION_ID,
      userId: USER_ID,
      timestamp: oldTs,
    };
    const signature = createHmac("sha256", SECRET)
      .update(
        `${payload.token}:${payload.sessionId}:${payload.userId}:${payload.timestamp}`
      )
      .digest("hex");
    const envelope = Buffer.from(
      JSON.stringify({ ...payload, signature })
    ).toString("base64url");

    const result = validateCSRFToken(envelope, SESSION_ID, SECRET, USER_ID);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Token expired");
  });

  it("rejects an empty token", () => {
    expect(validateCSRFToken("", SESSION_ID, SECRET, USER_ID).valid).toBe(
      false
    );
  });

  it("rejects garbled base64", () => {
    const result = validateCSRFToken(
      "not-a-real-token",
      SESSION_ID,
      SECRET,
      USER_ID
    );
    expect(result.valid).toBe(false);
  });
});

describe("getSessionId", () => {
  it("returns null when no auth cookies are present", () => {
    const request = makeRequest({ cookie: "theme=dark; lang=en" });
    expect(getSessionId(request)).toBeNull();
  });

  it("returns null when no Cookie header exists", () => {
    const request = new Request("https://tt-reviews.local/", { method: "GET" });
    expect(getSessionId(request)).toBeNull();
  });

  it("returns a stable hash from a single-chunk Supabase auth cookie", () => {
    const cookie = "sb-local-auth-token=payload-abc";
    const id1 = getSessionId(makeRequest({ cookie }));
    const id2 = getSessionId(makeRequest({ cookie }));
    expect(id1).not.toBeNull();
    expect(id1).toBe(id2);
    expect(id1).toHaveLength(32);
  });

  it("concatenates split Supabase auth cookies in sorted order", () => {
    // Same underlying token value, delivered as two chunks in either
    // delivery order — the hash must match.
    const a = getSessionId(
      makeRequest({
        cookie: "sb-local-auth-token.0=AAA; sb-local-auth-token.1=BBB",
      })
    );
    const b = getSessionId(
      makeRequest({
        cookie: "sb-local-auth-token.1=BBB; sb-local-auth-token.0=AAA",
      })
    );
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });

  it("different auth-cookie values produce different session ids", () => {
    const a = getSessionId(
      makeRequest({ cookie: "sb-local-auth-token=user-one-token" })
    );
    const b = getSessionId(
      makeRequest({ cookie: "sb-local-auth-token=user-two-token" })
    );
    expect(a).not.toBe(b);
  });

  it("does not fall back to IP/UA when no session cookie is present", () => {
    // Regression check: pre-2026-04 this returned sha256(IP + UA) which
    // collided across users behind the same NAT.
    const request = new Request("https://tt-reviews.local/admin/foo", {
      method: "POST",
      headers: {
        "CF-Connecting-IP": "203.0.113.10",
        "User-Agent": "Mozilla/5.0 test-agent",
      },
    });
    expect(getSessionId(request)).toBeNull();
  });
});

describe("validateCSRFFromRequest", () => {
  it("rejects when there is no session cookie", async () => {
    const form = new FormData();
    const token = generateCSRFToken(SESSION_ID, USER_ID, SECRET);
    form.set("_csrf", token);
    const request = makeRequest({ body: form });

    const result = await validateCSRFFromRequest(request, SECRET, USER_ID);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("No session found");
  });

  it("rejects when _csrf field is absent", async () => {
    const form = new FormData();
    const request = makeRequest({
      body: form,
      cookie: "sb-local-auth-token=payload",
    });

    const result = await validateCSRFFromRequest(request, SECRET, USER_ID);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("CSRF token missing");
  });

  it("accepts a matching token for the same session", async () => {
    const cookie = "sb-local-auth-token=payload";
    const sessionId = getSessionId(makeRequest({ cookie }))!;
    const token = generateCSRFToken(sessionId, USER_ID, SECRET);

    const form = new FormData();
    form.set("_csrf", token);
    const request = makeRequest({ body: form, cookie });

    const result = await validateCSRFFromRequest(request, SECRET, USER_ID);
    expect(result.valid).toBe(true);
  });

  it("rejects a token issued against a different session", async () => {
    const tokenForOther = generateCSRFToken(
      "some-other-session",
      USER_ID,
      SECRET
    );
    const form = new FormData();
    form.set("_csrf", tokenForOther);
    const request = makeRequest({
      body: form,
      cookie: "sb-local-auth-token=payload",
    });

    const result = await validateCSRFFromRequest(request, SECRET, USER_ID);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Session mismatch");
  });
});

describe("requiresCSRFProtection", () => {
  it("returns false for GET", () => {
    expect(
      requiresCSRFProtection(
        new Request("https://tt-reviews.local/admin/foo", { method: "GET" })
      )
    ).toBe(false);
  });

  it("returns true for POST to a non-exempt path", () => {
    expect(
      requiresCSRFProtection(
        new Request("https://tt-reviews.local/admin/foo", { method: "POST" })
      )
    ).toBe(true);
  });

  it("returns false for POST to /api/discord/ (Ed25519-signed)", () => {
    expect(
      requiresCSRFProtection(
        new Request("https://tt-reviews.local/api/discord/interactions", {
          method: "POST",
        })
      )
    ).toBe(false);
  });

  it("returns false for POST to /api/webhooks/ (shared-secret path)", () => {
    expect(
      requiresCSRFProtection(
        new Request("https://tt-reviews.local/api/webhooks/anything", {
          method: "POST",
        })
      )
    ).toBe(false);
  });
});
