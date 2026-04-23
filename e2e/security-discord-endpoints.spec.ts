import { test, expect } from "@playwright/test";

// Phase 1 of SECURITY.md: the pre-hardening build had two unauthenticated
// Discord endpoints (`/api/discord/messages`, `/api/discord/notify`) that
// accepted arbitrary POSTs from anyone and acted on them. They were deleted
// because nothing internal called them via HTTP (submissions use
// DiscordService directly) and the only real Discord traffic is signed
// interactions at /api/discord/interactions. This spec guards against a
// regression where either route gets re-added without a signature / secret.
for (const path of ["/api/discord/messages", "/api/discord/notify"]) {
  test(`deleted endpoint ${path} rejects unauthenticated POST`, async ({
    request,
  }) => {
    const response = await request.post(path, {
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ content: "x", type: "new_review", data: {} }),
    });

    expect(response.status(), `${path} must not respond 200`).not.toBe(200);
    expect(
      [401, 403, 404, 405].includes(response.status()),
      `${path} responded ${response.status()}; expected a rejection status`
    ).toBe(true);
  });
}
