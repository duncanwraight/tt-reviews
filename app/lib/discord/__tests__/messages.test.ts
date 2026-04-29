import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as nodeCrypto from "node:crypto";
import * as messages from "../messages";
import type { DiscordContext } from "../types";

// Sign a Discord-style payload with the test-only Ed25519 keypair (the
// private half matching E2E_TEST_PUBLIC_KEY_HEX). Mirrors
// e2e/utils/discord.ts so verifySignature's dev auto-inject branch can
// be exercised end-to-end inside this unit test.
const E2E_TEST_PRIVATE_KEY_HEX =
  "0e77e13801015d462958195e7ac96cad55b89b296444746eacf91d156470e5ac";
function signWithE2eTestKey(timestamp: string, body: string): string {
  const prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  const pkcs8 = Buffer.concat([
    prefix,
    Buffer.from(E2E_TEST_PRIVATE_KEY_HEX, "hex"),
  ]);
  const privateKey = nodeCrypto.createPrivateKey({
    key: pkcs8,
    format: "der",
    type: "pkcs8",
  });
  const message = Buffer.from(timestamp + body, "utf8");
  return nodeCrypto.sign(null, message, privateKey).toString("hex");
}

/**
 * Unit tests for the messages toolbox — signature verification, bot
 * config validation, button/embed builders, status helpers, and the
 * update-after-moderation flow. All tests run without a live Supabase
 * or network connection; fetch is stubbed per-test.
 */

function makeCtx(envOverrides: Record<string, any> = {}): DiscordContext {
  return {
    env: {
      DISCORD_BOT_TOKEN: "x".repeat(60),
      DISCORD_PUBLIC_KEY: "0".repeat(64),
      DISCORD_CHANNEL_ID: "123456789012345678",
      DISCORD_GUILD_ID: "987654321098765432",
      DISCORD_ALLOWED_ROLES: "moderator",
      SITE_URL: "https://tt-reviews.local",
      ...envOverrides,
    } as any,

    context: {} as any,
    supabaseAdmin: {} as any,
    dbService: {
      getDiscordMessageId: vi.fn(),
    } as any,

    moderationService: {} as any,

    unifiedNotifier: {} as any,
  };
}

describe("messages.hexToUint8Array", () => {
  it("converts even-length hex correctly", () => {
    expect(Array.from(messages.hexToUint8Array("00ff10"))).toEqual([
      0, 255, 16,
    ]);
  });

  it("returns empty array for empty string", () => {
    expect(messages.hexToUint8Array("").length).toBe(0);
  });

  it("handles mixed case hex", () => {
    expect(Array.from(messages.hexToUint8Array("aAbB"))).toEqual([170, 187]);
  });
});

describe("messages.getEmbedTitle", () => {
  it.each([
    ["equipment", "⚙️ Equipment Submission"],
    ["player", "👤 Player Submission"],
    ["player_edit", "🏓 Player Edit"],
    ["video", "🎥 Video Submission"],
  ] as const)("returns title for %s", (type, expected) => {
    expect(messages.getEmbedTitle(type)).toBe(expected);
  });
});

describe("messages.getStatusColor", () => {
  it.each([
    ["approved", 0x2ecc71],
    ["rejected", 0xe74c3c],
    ["awaiting_second_approval", 0xf39c12],
    ["pending", 0x9b59b6],
    ["unknown-anything-else", 0x9b59b6],
  ])("returns color for %s", (status, expected) => {
    expect(messages.getStatusColor(status)).toBe(expected);
  });
});

describe("messages.getStatusText", () => {
  it("includes the moderator name", () => {
    expect(messages.getStatusText("approved", "mod42")).toContain("mod42");
  });

  it.each([
    ["approved", "Approved"],
    ["rejected", "Rejected"],
    ["awaiting_second_approval", "Awaiting Second Approval"],
    ["unknown", "Pending Review"],
  ])("formats status label for %s", (status, label) => {
    expect(messages.getStatusText(status, "mod")).toContain(label);
  });
});

describe("messages.createProgressButtons", () => {
  it("uses approve_player_edit_<id> for player_edit type", () => {
    const buttons = messages.createProgressButtons("player_edit", "abc", 1, 2);
    expect(buttons[0].components[0].custom_id).toBe("approve_player_edit_abc");
    expect(buttons[0].components[1].custom_id).toBe("reject_player_edit_abc");
  });

  it("uses approve_<type>_<id> for equipment/player/video", () => {
    const equip = messages.createProgressButtons("equipment", "eq1", 1, 2);
    expect(equip[0].components[0].custom_id).toBe("approve_equipment_eq1");
    const player = messages.createProgressButtons("player", "p1", 1, 2);
    expect(player[0].components[0].custom_id).toBe("approve_player_p1");
    const video = messages.createProgressButtons("video", "v1", 1, 2);
    expect(video[0].components[0].custom_id).toBe("approve_video_v1");
  });

  it("embeds approval count in the approve label", () => {
    const buttons = messages.createProgressButtons("equipment", "eq1", 1, 2);
    expect(buttons[0].components[0].label).toBe("Approve (1/2)");
  });
});

describe("messages.createDisabledButtons", () => {
  it("marks both buttons disabled for approved final state", () => {
    const [row] = messages.createDisabledButtons("approved");
    expect(row.components[0].disabled).toBe(true);
    expect(row.components[1].disabled).toBe(true);
  });

  it("shows green Approved label for approved state", () => {
    const [row] = messages.createDisabledButtons("approved");
    expect(row.components[0].style).toBe(3);
    expect(row.components[0].label).toBe("Approved");
  });

  it("shows red Rejected label for rejected state", () => {
    const [row] = messages.createDisabledButtons("rejected");
    expect(row.components[1].style).toBe(4);
    expect(row.components[1].label).toBe("Rejected");
  });
});

describe("messages.validateBotConfig", () => {
  const logCtx = { requestId: "test" };

  it("reports valid for a well-formed config", () => {
    const result = messages.validateBotConfig(makeCtx(), logCtx);
    expect(result.isValid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.botToken).toBeDefined();
    expect(result.channelId).toBeDefined();
  });

  it("flags missing DISCORD_BOT_TOKEN", () => {
    const result = messages.validateBotConfig(
      makeCtx({ DISCORD_BOT_TOKEN: undefined }),
      logCtx
    );
    expect(result.isValid).toBe(false);
    expect(result.issues.some(i => i.includes("DISCORD_BOT_TOKEN"))).toBe(true);
  });

  it("flags DISCORD_BOT_TOKEN that is too short", () => {
    const result = messages.validateBotConfig(
      makeCtx({ DISCORD_BOT_TOKEN: "short" }),
      logCtx
    );
    expect(result.isValid).toBe(false);
  });

  it("flags placeholder bot token", () => {
    const result = messages.validateBotConfig(
      makeCtx({
        DISCORD_BOT_TOKEN:
          "your_actual_bot_token_here_padded_out_to_be_long_enough_to_pass_length",
      }),
      logCtx
    );
    expect(result.isValid).toBe(false);
    expect(result.issues.some(i => i.includes("placeholder"))).toBe(true);
  });

  it("flags missing DISCORD_CHANNEL_ID", () => {
    const result = messages.validateBotConfig(
      makeCtx({ DISCORD_CHANNEL_ID: undefined }),
      logCtx
    );
    expect(result.isValid).toBe(false);
    expect(result.issues.some(i => i.includes("DISCORD_CHANNEL_ID"))).toBe(
      true
    );
  });

  it("flags missing SITE_URL", () => {
    const result = messages.validateBotConfig(
      makeCtx({ SITE_URL: undefined }),
      logCtx
    );
    expect(result.isValid).toBe(false);
    expect(result.issues.some(i => i.includes("SITE_URL"))).toBe(true);
  });
});

describe("messages.verifySignature", () => {
  it("throws when public key is missing", async () => {
    const ctx = makeCtx({ DISCORD_PUBLIC_KEY: undefined });
    await expect(
      messages.verifySignature(ctx, "sig", "ts", "body")
    ).rejects.toThrow(/not configured/);
  });

  it("throws when public key is the placeholder value", async () => {
    const ctx = makeCtx({
      DISCORD_PUBLIC_KEY: "your_discord_application_public_key_here",
    });
    await expect(
      messages.verifySignature(ctx, "sig", "ts", "body")
    ).rejects.toThrow(/not properly configured/);
  });

  it("throws when public key is too short", async () => {
    const ctx = makeCtx({ DISCORD_PUBLIC_KEY: "short" });
    await expect(
      messages.verifySignature(ctx, "sig", "ts", "body")
    ).rejects.toThrow(/not properly configured/);
  });

  it("returns false (not throws) when signature is malformed", async () => {
    // 64 hex chars for public key, invalid sig bytes cause verify to error
    const ctx = makeCtx();
    const result = await messages.verifySignature(ctx, "zz", "ts", "body");
    expect(result).toBe(false);
  });

  it("accepts CSV with multiple valid keys without throwing on validation", async () => {
    // Two well-formed keys; neither will verify a malformed sig, but the
    // multi-key parser must accept the shape without throwing.
    const ctx = makeCtx({
      DISCORD_PUBLIC_KEY: `${"0".repeat(64)},${"1".repeat(64)}`,
    });
    const result = await messages.verifySignature(ctx, "zz", "ts", "body");
    expect(result).toBe(false);
  });

  it("throws if any CSV entry is malformed", async () => {
    const ctx = makeCtx({
      DISCORD_PUBLIC_KEY: `${"0".repeat(64)},not-hex`,
    });
    await expect(
      messages.verifySignature(ctx, "sig", "ts", "body")
    ).rejects.toThrow(/not properly configured/);
  });

  describe("e2e test public key prod-safety guard", () => {
    const E2E_TEST_KEY =
      "bf98a44479fb79df5a22a93bec408ecae0535f182152932022236205b9ea4480";
    const KEYS = `${"0".repeat(64)},${E2E_TEST_KEY}`;

    // Fail-closed: anything that isn't literal "development" must throw.
    // Mirrors the isDevelopment() invariant in app/lib/env.server.ts.
    it.each([
      ["production", "production"],
      ["preview", "preview"],
      ["staging", "staging"],
      ["empty string", ""],
      ["unset", undefined],
      ["typo (prod)", "prod"],
      ["typo (Development)", "Development"],
    ])("throws when ENVIRONMENT is %s", async (_label, env) => {
      const ctx = makeCtx({
        ENVIRONMENT: env,
        DISCORD_PUBLIC_KEY: KEYS,
      });
      await expect(
        messages.verifySignature(ctx, "sig", "ts", "body")
      ).rejects.toThrow(/e2e test public key/);
    });

    it("does not throw when ENVIRONMENT is development", async () => {
      const ctx = makeCtx({
        ENVIRONMENT: "development",
        DISCORD_PUBLIC_KEY: KEYS,
      });
      const result = await messages.verifySignature(ctx, "zz", "ts", "body");
      expect(result).toBe(false);
    });
  });

  describe("e2e test public key auto-injection in development", () => {
    // Lets local dev servers verify Playwright Discord click specs even
    // when .dev.vars only contains the real Discord app key — no per-dev
    // env tweak required.
    const TS = "1700000000";
    const BODY = '{"type":1}';

    it("verifies a test-key-signed payload when ENVIRONMENT=development and only the real key is listed", async () => {
      const sig = signWithE2eTestKey(TS, BODY);
      const ctx = makeCtx({
        ENVIRONMENT: "development",
        DISCORD_PUBLIC_KEY: "0".repeat(64),
      });
      const result = await messages.verifySignature(ctx, sig, TS, BODY);
      expect(result).toBe(true);
    });

    it.each([
      ["production", "production"],
      ["preview", "preview"],
      ["unset", undefined],
    ])(
      "does NOT verify a test-key-signed payload when ENVIRONMENT is %s",
      async (_label, env) => {
        const sig = signWithE2eTestKey(TS, BODY);
        const ctx = makeCtx({
          ENVIRONMENT: env,
          DISCORD_PUBLIC_KEY: "0".repeat(64),
        });
        const result = await messages.verifySignature(ctx, sig, TS, BODY);
        expect(result).toBe(false);
      }
    );
  });
});

describe("messages.updateDiscordMessage", () => {
  let originalFetch: any;

  let fetchMock: any;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("PATCHes Discord API with bot token", async () => {
    fetchMock.mockResolvedValue(
      new Response("{}", { status: 200, statusText: "OK" })
    );
    const ctx = makeCtx();
    const result = await messages.updateDiscordMessage(ctx, "c1", "m1", {
      embeds: [],
    });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://discord.com/api/v10/channels/c1/messages/m1",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bot /),
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("returns {success: false, error} when bot not configured", async () => {
    const ctx = makeCtx({ DISCORD_BOT_TOKEN: undefined });
    const result = await messages.updateDiscordMessage(ctx, "c1", "m1", {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not configured/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces Discord API error text on non-2xx", async () => {
    fetchMock.mockResolvedValue(new Response("rate limited", { status: 429 }));
    const ctx = makeCtx();
    const result = await messages.updateDiscordMessage(ctx, "c1", "m1", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("rate limited");
  });

  it("swallows network errors and reports them", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));
    const ctx = makeCtx();
    const result = await messages.updateDiscordMessage(ctx, "c1", "m1", {});
    expect(result.success).toBe(false);
    expect(result.error).toBe("boom");
  });
});

describe("messages.updateDiscordMessageAfterModeration", () => {
  let originalFetch: any;

  let fetchMock: any;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("no-ops silently when no Discord message id is tracked", async () => {
    const ctx = makeCtx();
    (
      ctx.dbService.getDiscordMessageId as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);
    await messages.updateDiscordMessageAfterModeration(
      ctx,
      "equipment",
      "s1",
      "approved",
      "mod"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no-ops when bot config is invalid", async () => {
    const ctx = makeCtx({ DISCORD_BOT_TOKEN: undefined });
    (
      ctx.dbService.getDiscordMessageId as ReturnType<typeof vi.fn>
    ).mockResolvedValue("msg-id-1");
    await messages.updateDiscordMessageAfterModeration(
      ctx,
      "equipment",
      "s1",
      "approved",
      "mod"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("patches with disabled buttons when status is approved", async () => {
    const ctx = makeCtx();
    (
      ctx.dbService.getDiscordMessageId as ReturnType<typeof vi.fn>
    ).mockResolvedValue("msg-id-1");
    await messages.updateDiscordMessageAfterModeration(
      ctx,
      "equipment",
      "s1",
      "approved",
      "mod"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    // Disabled buttons have custom_id "disabled_approve" / "disabled_reject"
    expect(body.components[0].components[0].custom_id).toBe("disabled_approve");
    expect(body.components[0].components[0].disabled).toBe(true);
  });

  it("patches with progress buttons (1/2) when awaiting second approval", async () => {
    const ctx = makeCtx();
    (
      ctx.dbService.getDiscordMessageId as ReturnType<typeof vi.fn>
    ).mockResolvedValue("msg-id-1");
    await messages.updateDiscordMessageAfterModeration(
      ctx,
      "equipment",
      "eq1",
      "awaiting_second_approval",
      "mod1"
    );
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.components[0].components[0].label).toBe("Approve (1/2)");
    expect(body.components[0].components[0].custom_id).toBe(
      "approve_equipment_eq1"
    );
  });
});
