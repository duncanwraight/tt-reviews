import { test, expect } from "@playwright/test";

/**
 * Verifies the Logger.error → DiscordAlerter pipeline end-to-end. Triggers
 * an error via /e2e-trigger-error and polls the Discord channel directly
 * for the resulting embed via the bot REST API.
 *
 * Requires `DISCORD_BOT_TOKEN` and `DISCORD_ALERTS_CHANNEL_ID` to be real
 * dev-app values. Locally these come from `.dev.vars` (loaded by
 * e2e/global-setup.ts); in CI they're injected by the workflow from
 * `CI_DISCORD_*` GitHub secrets.
 */
test("Logger.error fans out to Discord with the right payload", async ({
  request,
}) => {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_ALERTS_CHANNEL_ID;
  if (!botToken || !channelId) {
    throw new Error(
      "DISCORD_BOT_TOKEN and DISCORD_ALERTS_CHANNEL_ID must be set in .dev.vars (or CI secrets) for this spec"
    );
  }

  const marker = `e2e-alerts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const trigger = await request.post("/e2e-trigger-error", {
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify({ marker }),
  });
  expect(trigger.status()).toBe(200);

  // Alerter notify is fire-and-forget via ctx.waitUntil; poll Discord's
  // channel for the embed with our unique marker.
  await expect
    .poll(
      async () => {
        const res = await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages?limit=50`,
          {
            headers: {
              Authorization: `Bot ${botToken}`,
              "User-Agent": "tt-reviews-e2e/1.0",
            },
          }
        );
        if (!res.ok) return null;
        const messages = (await res.json()) as Array<{
          embeds?: Array<{
            title?: string;
            fields?: Array<{ name: string; value: string }>;
          }>;
        }>;
        for (const msg of messages) {
          for (const embed of msg.embeds ?? []) {
            if (embed.title?.includes(marker)) return embed;
          }
        }
        return null;
      },
      { timeout: 15_000, intervals: [500, 1000, 2000] }
    )
    .toMatchObject({
      title: expect.stringContaining(marker),
      fields: expect.arrayContaining([
        expect.objectContaining({
          name: "Environment",
          value: "development",
        }),
        expect.objectContaining({
          name: "Source",
          value: "e2e-trigger-error",
        }),
        expect.objectContaining({
          name: "Route",
          value: "/e2e-trigger-error",
        }),
      ]),
    });
});

test("e2e-trigger-error rejects GET (loader returns 200 hint, action requires POST)", async ({
  request,
}) => {
  const res = await request.get("/e2e-trigger-error");
  expect(res.status()).toBe(200);
  const text = await res.text();
  expect(text).toContain("POST");
});
