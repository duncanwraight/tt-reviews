import { test, expect } from "@playwright/test";

/**
 * Verifies the Logger.error → DiscordAlerter pipeline end-to-end through
 * the running dev server. Triggers an error via /e2e-trigger-error and
 * polls /e2e-last-alert for the alerter's recorded attempt.
 *
 * In local dev with a real DISCORD_BOT_TOKEN, the alerter additionally
 * POSTs to the channel set in DISCORD_ALERTS_CHANNEL_ID — verify visually
 * if you want to eyeball formatting. CI uses DISCORD_BOT_TOKEN=stub so
 * no real Discord traffic occurs; the in-memory attempt readout is what
 * keeps the spec passing in both environments. TT-83 tracks giving CI
 * real Discord creds so we can switch this spec to poll Discord directly.
 */
test("Logger.error fans out to the Discord alerter with the right payload", async ({
  request,
}) => {
  const marker = `e2e-alerts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const trigger = await request.post("/e2e-trigger-error", {
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify({ marker }),
  });
  expect(trigger.status()).toBe(200);
  const triggerBody = (await trigger.json()) as { ok: boolean; marker: string };
  expect(triggerBody).toEqual({ ok: true, marker });

  // Alerter notify is fire-and-forget via ctx.waitUntil, so poll the
  // in-memory readout until the matching marker shows up.
  await expect
    .poll(
      async () => {
        const res = await request.get("/e2e-last-alert");
        if (res.status() !== 200) return null;
        const body = (await res.json()) as {
          lastAttempt: {
            payload: { message: string; source?: string; route?: string };
            channelId: string;
            embed: {
              title: string;
              fields: Array<{ name: string; value: string }>;
            };
          } | null;
        };
        const last = body.lastAttempt;
        if (!last || !last.payload.message.includes(marker)) return null;
        return last;
      },
      { timeout: 10_000, intervals: [200, 500, 1000] }
    )
    .toMatchObject({
      payload: {
        message: expect.stringContaining(marker),
        source: "e2e-trigger-error",
        route: "/e2e-trigger-error",
      },
      channelId: "1382054634247553024",
      embed: {
        title: expect.stringContaining(marker),
        fields: expect.arrayContaining([
          expect.objectContaining({
            name: "Environment",
            value: "development",
          }),
        ]),
      },
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
