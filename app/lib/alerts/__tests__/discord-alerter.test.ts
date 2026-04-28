import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  DiscordAlerter,
  installAlerter,
  getInstalledAlerter,
  _resetAlerterForTests,
  type AlerterEnv,
} from "../discord-alerter.server";

const REAL_BOT_TOKEN = "x".repeat(60); // > 50 chars, no placeholder needles

function makeEnv(overrides: Partial<AlerterEnv> = {}): AlerterEnv {
  return {
    DISCORD_ALERTS_CHANNEL_ID: "1382054634247553024",
    DISCORD_BOT_TOKEN: REAL_BOT_TOKEN,
    ENVIRONMENT: "production",
    ...overrides,
  };
}

describe("DiscordAlerter.notify", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts to the configured channel when bot token is real", async () => {
    const alerter = new DiscordAlerter(makeEnv());
    const fired = await alerter.notify({ message: "boom", source: "worker" });

    expect(fired).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://discord.com/api/v10/channels/1382054634247553024/messages"
    );
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as {
      embeds: Array<{ title: string; fields: Array<{ name: string }> }>;
    };
    expect(body.embeds[0].title).toContain("boom");
    expect(body.embeds[0].fields.some(f => f.name === "Environment")).toBe(
      true
    );
  });

  it("skips when DISCORD_ALERTS_CHANNEL_ID is unset", async () => {
    const alerter = new DiscordAlerter(
      makeEnv({ DISCORD_ALERTS_CHANNEL_ID: undefined })
    );
    const fired = await alerter.notify({ message: "boom" });

    expect(fired).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(alerter.getLastAttempt()).toBeNull();
  });

  it("skips when DISCORD_ALERTS_CHANNEL_ID is a placeholder", async () => {
    const alerter = new DiscordAlerter(
      makeEnv({ DISCORD_ALERTS_CHANNEL_ID: "your_alerts_channel" })
    );
    const fired = await alerter.notify({ message: "boom" });

    expect(fired).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("captures the attempt but doesn't POST when bot token is a stub (CI mode)", async () => {
    const alerter = new DiscordAlerter(makeEnv({ DISCORD_BOT_TOKEN: "stub" }));
    const fired = await alerter.notify({ message: "boom" });

    expect(fired).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    const attempt = alerter.getLastAttempt();
    expect(attempt).not.toBeNull();
    expect(attempt!.channelId).toBe("1382054634247553024");
    expect(attempt!.posted).toBe(false);
    expect(attempt!.payload.message).toBe("boom");
  });

  it("dedupes repeats of the same message within 5 minutes", async () => {
    const alerter = new DiscordAlerter(makeEnv());
    const t = 1_000_000;
    await alerter.notify({ message: "boom" }, t);
    await alerter.notify({ message: "boom" }, t + 1000); // 1s later
    await alerter.notify({ message: "boom" }, t + 4 * 60_000); // 4min later

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("re-fires after the dedup window expires", async () => {
    const alerter = new DiscordAlerter(makeEnv());
    const t = 1_000_000;
    await alerter.notify({ message: "boom" }, t);
    await alerter.notify({ message: "boom" }, t + 5 * 60_000 + 1);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("dedupes per-message, not globally", async () => {
    const alerter = new DiscordAlerter(makeEnv());
    const t = 1_000_000;
    await alerter.notify({ message: "boom-a" }, t);
    await alerter.notify({ message: "boom-b" }, t + 1000);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("swallows fetch failures so the logger never sees an error", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("network down"));
    const alerter = new DiscordAlerter(makeEnv());

    await expect(alerter.notify({ message: "boom" })).resolves.toBe(true);
    expect(alerter.getLastAttempt()?.posted).toBe(false);
  });

  it("records httpStatus on non-2xx responses without throwing", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("nope", { status: 401 }));
    const alerter = new DiscordAlerter(makeEnv());

    await alerter.notify({ message: "boom" });
    expect(alerter.getLastAttempt()?.httpStatus).toBe(401);
    expect(alerter.getLastAttempt()?.posted).toBe(false);
  });

  it("includes error name + message in the embed when supplied", async () => {
    const alerter = new DiscordAlerter(makeEnv());
    await alerter.notify({
      message: "boom",
      error: { name: "TypeError", message: "x is undefined" },
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string) as {
      embeds: Array<{ fields: Array<{ name: string; value: string }> }>;
    };
    const errField = body.embeds[0].fields.find(f => f.name === "TypeError");
    expect(errField?.value).toBe("x is undefined");
  });
});

describe("installAlerter / getInstalledAlerter", () => {
  beforeEach(() => {
    _resetAlerterForTests();
  });

  it("returns null before install", () => {
    expect(getInstalledAlerter()).toBeNull();
  });

  it("creates an alerter on first install and reuses it on subsequent installs", () => {
    const ctx = { waitUntil: vi.fn() };
    const a1 = installAlerter(makeEnv(), ctx);
    const a2 = installAlerter(makeEnv({ ENVIRONMENT: "preview" }), ctx);

    expect(a1).toBe(a2);
    expect(getInstalledAlerter()).toBe(a1);
  });

  it("preserves dedup state across installs (same isolate, multiple requests)", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
    const ctx = { waitUntil: vi.fn() };

    const a1 = installAlerter(makeEnv(), ctx);
    await a1.notify({ message: "boom" }, 1_000_000);

    const a2 = installAlerter(makeEnv(), ctx);
    await a2.notify({ message: "boom" }, 1_000_000 + 30_000);

    expect(fetchSpy).toHaveBeenCalledTimes(1); // dedup survived install
  });
});
