import {
  Logger,
  createLogContext,
  type LogContext,
} from "../logger.server";
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

/**
 * Verify Discord webhook signature using Ed25519.
 */
export async function verifySignature(
  ctx: DiscordContext,
  signature: string,
  timestamp: string,
  body: string
): Promise<boolean> {
  const PUBLIC_KEY = ctx.env.DISCORD_PUBLIC_KEY;
  if (!PUBLIC_KEY) {
    throw new Error("Discord verification key not configured");
  }

  if (
    PUBLIC_KEY === "your_discord_application_public_key_here" ||
    PUBLIC_KEY.length < 32
  ) {
    throw new Error("Discord verification key is not properly configured");
  }

  try {
    const encoder = new globalThis.TextEncoder();
    const data = encoder.encode(timestamp + body);
    const sig = hexToUint8Array(signature);
    const crypto = globalThis.crypto;
    const key = await crypto.subtle.importKey(
      "raw",
      hexToUint8Array(PUBLIC_KEY),
      { name: "Ed25519", namedCurve: "Ed25519" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify("Ed25519", key, sig, data);
  } catch (error) {
    console.error("Signature verification error:", error);
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
 * Initial two-button (Approve/Reject) action row for new submissions.
 * Not currently called by the runtime — UnifiedDiscordNotifier owns the
 * new-submission button construction. Retained for the legacy code path.
 */
export function createInitialButtons(
  submissionType: ModeratableSubmissionType,
  submissionId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
  let approveCustomId: string;
  let rejectCustomId: string;
  let approveLabel: string;
  let rejectLabel: string;

  if (submissionType === "player_edit") {
    approveCustomId = `approve_player_edit_${submissionId}`;
    rejectCustomId = `reject_player_edit_${submissionId}`;
    approveLabel = "Approve Player Edit";
    rejectLabel = "Reject Player Edit";
  } else if (submissionType === "equipment") {
    approveCustomId = `approve_${submissionType}_${submissionId}`;
    rejectCustomId = `reject_${submissionType}_${submissionId}`;
    approveLabel = "Approve Equipment";
    rejectLabel = "Reject Equipment";
  } else if (submissionType === "player") {
    approveCustomId = `approve_${submissionType}_${submissionId}`;
    rejectCustomId = `reject_${submissionType}_${submissionId}`;
    approveLabel = "Approve Player";
    rejectLabel = "Reject Player";
  } else if (submissionType === "video") {
    approveCustomId = `approve_${submissionType}_${submissionId}`;
    rejectCustomId = `reject_${submissionType}_${submissionId}`;
    approveLabel = "Approve Video";
    rejectLabel = "Reject Video";
  } else {
    approveCustomId = `approve_${submissionType}_${submissionId}`;
    rejectCustomId = `reject_${submissionType}_${submissionId}`;
    approveLabel = "Approve";
    rejectLabel = "Reject";
  }

  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 3,
          label: approveLabel,
          custom_id: approveCustomId,
        },
        {
          type: 2,
          style: 4,
          label: rejectLabel,
          custom_id: rejectCustomId,
        },
      ],
    },
  ];
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
 * Produce a status-updated copy of an existing embed. Not currently
 * called — updateDiscordMessageAfterModeration builds a minimal embed
 * from scratch rather than copying the original. Retained for the full
 * reconstruction path.
 */
export function createUpdatedEmbed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalEmbed: any,
  status: string,
  moderatorUsername?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const updatedEmbed = { ...originalEmbed };
  if (!updatedEmbed.fields) updatedEmbed.fields = [];
  updatedEmbed.fields = updatedEmbed.fields.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (field: any) => field.name !== "Status"
  );
  let statusValue = "";
  if (status === "approved") {
    statusValue = "✅ **Approved**";
    updatedEmbed.color = 0x2ecc71;
  } else if (status === "rejected") {
    statusValue = "❌ **Rejected**";
    updatedEmbed.color = 0xe74c3c;
  } else if (status === "awaiting_second_approval") {
    statusValue = "⏳ **Awaiting Second Approval** (1/2)";
    updatedEmbed.color = 0xf39c12;
  }
  if (moderatorUsername) {
    statusValue += `\nModerated by: ${moderatorUsername}`;
  }
  updatedEmbed.fields.push({
    name: "Status",
    value: statusValue,
    inline: false,
  });
  return updatedEmbed;
}

/**
 * Count how many approvals a submission currently has.
 */
export async function getApprovalCount(
  ctx: DiscordContext,
  submissionType: ModeratableSubmissionType,
  submissionId: string
): Promise<number> {
  try {
    const approvals = await ctx.moderationService.getSubmissionApprovals(
      submissionType,
      submissionId
    );
    return approvals.filter(approval => approval.action === "approved").length;
  } catch (error) {
    console.error("Error getting approval count:", error);
    return 0;
  }
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
      console.error("Failed to update Discord message:", updateResult.error);
    }
  } catch (error) {
    console.error("Error updating Discord message after moderation:", error);
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
