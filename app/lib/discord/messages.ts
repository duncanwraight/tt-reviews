import { Logger, createLogContext, type LogContext } from "../logger.server";
import type { DiscordContext, ModeratableSubmissionType } from "./types";

/**
 * Validate Discord bot configuration and environment.
 */
export function validateBotConfig(
  ctx: DiscordContext,
  logContext: LogContext
): {
  isValid: boolean;
  botToken?: string;
  channelId?: string;
  issues: string[];
} {
  const { env } = ctx;
  const issues: string[] = [];
  let botToken: string | undefined;
  let channelId: string | undefined;

  if (!env.DISCORD_BOT_TOKEN) {
    issues.push("DISCORD_BOT_TOKEN environment variable not set");
  } else {
    botToken = env.DISCORD_BOT_TOKEN;
    if (
      botToken.includes("your_actual_bot_token_here") ||
      botToken.includes("placeholder") ||
      botToken.length < 50
    ) {
      issues.push("DISCORD_BOT_TOKEN appears to be a placeholder value");
    }
  }

  if (!env.DISCORD_CHANNEL_ID) {
    issues.push("DISCORD_CHANNEL_ID environment variable not set");
  } else {
    channelId = env.DISCORD_CHANNEL_ID;
    if (
      channelId.includes("your_channel_id") ||
      channelId.includes("placeholder") ||
      channelId.length < 15
    ) {
      issues.push("DISCORD_CHANNEL_ID appears to be a placeholder value");
    }
  }

  if (!env.SITE_URL) {
    issues.push(
      "SITE_URL environment variable not set (needed for Discord embed links)"
    );
  }

  const isValid = issues.length === 0;

  if (!isValid) {
    Logger.warn("Discord bot configuration issues detected", logContext, {
      issues,
      hasBotToken: !!botToken,
      hasChannelId: !!channelId,
      hasSiteUrl: !!env.SITE_URL,
    });
  }

  return { isValid, botToken, channelId, issues };
}

// Well-known public key matching the test private key checked into
// e2e/utils/discord.ts. Auto-accepted when ENVIRONMENT=development so
// e2e click-simulation specs verify against any local dev server without
// each developer having to add it to DISCORD_PUBLIC_KEY by hand.
// Must NEVER appear in production env — verifySignature throws if it does.
const E2E_TEST_PUBLIC_KEY_HEX =
  "bf98a44479fb79df5a22a93bec408ecae0535f182152932022236205b9ea4480";

/**
 * Verify a Discord interaction signature using Ed25519.
 *
 * DISCORD_PUBLIC_KEY accepts a comma-separated list. Prod has one key
 * (the real Discord app key). In dev, the well-known E2E test public
 * key is auto-included so Playwright click specs verify against any
 * local dev server. Returns true if any candidate key verifies.
 */
export async function verifySignature(
  ctx: DiscordContext,
  signature: string,
  timestamp: string,
  body: string
): Promise<boolean> {
  const raw = ctx.env.DISCORD_PUBLIC_KEY;
  if (!raw) {
    throw new Error("Discord verification key not configured");
  }

  const keys = raw
    .split(",")
    .map(k => k.trim())
    .filter(Boolean);
  if (keys.length === 0) {
    throw new Error("Discord verification key not configured");
  }

  for (const k of keys) {
    if (
      k === "your_discord_application_public_key_here" ||
      !/^[0-9a-f]{64}$/i.test(k)
    ) {
      throw new Error("Discord verification key is not properly configured");
    }
  }

  const isDev = ctx.env.ENVIRONMENT === "development";

  // Fail closed: only ENVIRONMENT="development" allows the test key.
  // Anything else (unset, "", "preview", "staging", typo) is treated as
  // prod-safety, matching isDevelopment() in app/lib/env.server.ts.
  if (!isDev && keys.some(k => k.toLowerCase() === E2E_TEST_PUBLIC_KEY_HEX)) {
    throw new Error(
      "Refusing to verify: e2e test public key is set in DISCORD_PUBLIC_KEY outside development"
    );
  }

  // In dev, auto-accept the well-known e2e test key even when the dev
  // server's .dev.vars only contains the real Discord app key. Lets
  // Playwright Discord specs run locally with no env tweak required.
  if (isDev && !keys.some(k => k.toLowerCase() === E2E_TEST_PUBLIC_KEY_HEX)) {
    keys.push(E2E_TEST_PUBLIC_KEY_HEX);
  }

  try {
    const encoder = new globalThis.TextEncoder();
    const data = encoder.encode(timestamp + body);
    const sig = hexToUint8Array(signature);
    const crypto = globalThis.crypto;

    for (const k of keys) {
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        hexToUint8Array(k),
        { name: "Ed25519", namedCurve: "Ed25519" },
        false,
        ["verify"]
      );
      if (await crypto.subtle.verify("Ed25519", cryptoKey, sig, data)) {
        return true;
      }
    }
    return false;
  } catch (error) {
    Logger.error(
      "Signature verification error",
      createLogContext("discord-messages"),
      error instanceof Error ? error : undefined
    );
    return false;
  }
}

/**
 * PATCH an existing Discord message — used to update buttons/embed after
 * a moderator action.
 */
export async function updateDiscordMessage(
  ctx: DiscordContext,
  channelId: string,
  messageId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any
): Promise<{ success: boolean; error?: string }> {
  try {
    const config = validateBotConfig(ctx, createLogContext("update-message"));
    if (!config.isValid) {
      return { success: false, error: "Discord bot not configured" };
    }

    const response = await globalThis.fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bot ${config.botToken}`,
          "User-Agent": "tt-reviews-bot/1.0",
        },
        body: JSON.stringify(payload),
      }
    );

    if (response.ok) {
      return { success: true };
    }

    const errorText = await response.text();
    return { success: false, error: `Discord API error: ${errorText}` };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Button row showing progress toward the two-approval threshold.
 */
export function createProgressButtons(
  submissionType: ModeratableSubmissionType,
  submissionId: string,
  currentApprovals: number,
  requiredApprovals: number = 2
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
  let approveCustomId: string;
  let rejectCustomId: string;
  if (submissionType === "player_edit") {
    approveCustomId = `approve_player_edit_${submissionId}`;
    rejectCustomId = `reject_player_edit_${submissionId}`;
  } else {
    approveCustomId = `approve_${submissionType}_${submissionId}`;
    rejectCustomId = `reject_${submissionType}_${submissionId}`;
  }
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 3,
          label: `Approve (${currentApprovals}/${requiredApprovals})`,
          custom_id: approveCustomId,
        },
        {
          type: 2,
          style: 4,
          label: "Reject",
          custom_id: rejectCustomId,
        },
      ],
    },
  ];
}

/**
 * Final-state buttons (both disabled) once a submission is approved or rejected.
 */
export function createDisabledButtons(
  finalStatus: "approved" | "rejected"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: finalStatus === "approved" ? 3 : 2,
          label: finalStatus === "approved" ? "Approved" : "Approve",
          custom_id: "disabled_approve",
          disabled: true,
        },
        {
          type: 2,
          style: finalStatus === "rejected" ? 4 : 2,
          label: finalStatus === "rejected" ? "Rejected" : "Reject",
          custom_id: "disabled_reject",
          disabled: true,
        },
      ],
    },
  ];
}

/**
 * Refresh the Discord message (buttons + embed) after a moderation action.
 * Silently no-ops for submissions that predate Discord-message tracking.
 */
export async function updateDiscordMessageAfterModeration(
  ctx: DiscordContext,
  submissionType: ModeratableSubmissionType,
  submissionId: string,
  newStatus: string,
  moderatorUsername: string
): Promise<void> {
  try {
    const messageId = await ctx.dbService.getDiscordMessageId(
      submissionType,
      submissionId
    );
    if (!messageId) {
      return;
    }

    const config = validateBotConfig(
      ctx,
      createLogContext("update-after-moderation")
    );
    if (!config.isValid || !config.channelId) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let components: any[];
    if (newStatus === "approved" || newStatus === "rejected") {
      components = createDisabledButtons(newStatus as "approved" | "rejected");
    } else if (newStatus === "awaiting_second_approval") {
      components = createProgressButtons(submissionType, submissionId, 1, 2);
    } else {
      components = createProgressButtons(submissionType, submissionId, 0, 2);
    }

    const updatedEmbed = {
      title: getEmbedTitle(submissionType),
      description: "Submission status updated",
      color: getStatusColor(newStatus),
      fields: [
        {
          name: "Status",
          value: getStatusText(newStatus, moderatorUsername),
          inline: false,
        },
      ],
      timestamp: new Date().toISOString(),
    };

    const updateResult = await updateDiscordMessage(
      ctx,
      config.channelId,
      messageId,
      {
        embeds: [updatedEmbed],
        components,
      }
    );
    if (!updateResult.success) {
      Logger.error(
        "Failed to update Discord message",
        createLogContext("discord-messages", { submissionType, submissionId }),
        undefined,
        { error: updateResult.error }
      );
    }
  } catch (error) {
    Logger.error(
      "Error updating Discord message after moderation",
      createLogContext("discord-messages", { submissionType, submissionId }),
      error instanceof Error ? error : undefined
    );
  }
}

export function getEmbedTitle(
  submissionType: ModeratableSubmissionType
): string {
  switch (submissionType) {
    case "equipment":
      return "⚙️ Equipment Submission";
    case "player":
      return "👤 Player Submission";
    case "player_edit":
      return "🏓 Player Edit";
    case "video":
      return "🎥 Video Submission";
    default:
      return "📝 Submission";
  }
}

export function getStatusColor(status: string): number {
  switch (status) {
    case "approved":
      return 0x2ecc71;
    case "rejected":
      return 0xe74c3c;
    case "awaiting_second_approval":
      return 0xf39c12;
    default:
      return 0x9b59b6;
  }
}

export function getStatusText(
  status: string,
  moderatorUsername: string
): string {
  let statusText = "";
  switch (status) {
    case "approved":
      statusText = "✅ **Approved**";
      break;
    case "rejected":
      statusText = "❌ **Rejected**";
      break;
    case "awaiting_second_approval":
      statusText = "⏳ **Awaiting Second Approval** (1/2)";
      break;
    default:
      statusText = "⏳ **Pending Review**";
  }
  return `${statusText}\nModerated by: ${moderatorUsername}`;
}

/**
 * Convert hex string to Uint8Array — used by the Ed25519 signature path.
 */
export function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}
