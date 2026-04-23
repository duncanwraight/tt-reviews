import { test, expect } from "@playwright/test";

// SECURITY.md Phase 6 (TT-15). The `/api/images/*` reader used to fetch
// any R2 key the client asked for, so unlisted prefixes could reach
// objects outside the equipment/player namespaces. These probes pin the
// new 400-on-bad-key behaviour without needing auth or fixture state —
// they only care about the reader's pre-R2 validation.
//
// Note: raw `../..` in the URL path is collapsed by fetch/Playwright
// before the request goes on the wire, so you cannot hit the handler
// with a literal `..` segment. The `isValidImageKey` unit tests cover
// the in-code traversal check; here we pin the two classes of abuse
// that DO survive URL normalisation — unlisted prefix, and a URL-encoded
// `..` that the HTTP parser leaves intact.

test("/api/images rejects keys outside the allowlist", async ({ request }) => {
  const res = await request.get("/api/images/secrets/anything.jpg");
  expect(res.status()).toBe(400);
});

test("/api/images rejects URL-encoded path traversal inside a valid prefix", async ({
  request,
}) => {
  const res = await request.get("/api/images/equipment/%2E%2E/etc/passwd");
  expect(res.status()).toBe(400);
});

test("/api/images returns 404 for a well-formed but absent key", async ({
  request,
}) => {
  const res = await request.get(
    `/api/images/equipment/does-not-exist-${Date.now()}/nope.jpg`
  );
  expect(res.status()).toBe(404);
});
