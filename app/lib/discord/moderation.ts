import { Logger, createLogContext } from "../logger.server";
import * as messages from "./messages";
import type { DiscordContext, DiscordMember, DiscordUser } from "./types";

// Ephemeral message shown when a Discord click references a submission
// that does not exist in the target environment — typically a dev-app
// click landing on prod because both share the prod Interactions
// Endpoint URL. Without this, the insert would land as an orphan row in
// moderator_approvals (historical bug, see archive/DISCORD-HARDENING.md).
const MISSING_SUBMISSION_MESSAGE =
  "❌ **Submission not found** — this click may have come from a different environment.";

/**
 * Discord approve/reject handlers — one pair per moderated submission
 * type. Each handler:
 *   1. Gets/creates the Discord moderator record from the user id
 *   2. Records the approval/rejection via moderationService
 *   3. Refreshes the source Discord message (for types that have a
 *      tracked message_id — reviews and player_equipment_setup don't)
 *   4. Returns a type-4 ephemeral interaction response
 *
 * Permission checks live in checkUserPermissions at the bottom.
 *
 * The approve/reject pairs are intentionally similar but kept as
 * separate functions for now — per-type handling (e.g. which category
 * codes are valid, which table the admin_ui flag affects) diverges in
 * subtle ways and collapsing them risks regressions. DRY-ing is a
 * future refactor.
 */

// ============================================================
// Review (equipment reviews)
// ============================================================

export async function approveReview(
  ctx: DiscordContext,
  reviewId: string,
  user: DiscordUser
): Promise<Response> {
  try {
    const discordModeratorId =
      await ctx.moderationService.getOrCreateDiscordModerator(
        user.id,
        user.username
      );

    if (!discordModeratorId) {
      return ephemeralJson(
        `❌ **Error**: Failed to create Discord moderator record`
      );
    }

    const result = await ctx.moderationService.recordApproval(
      "review",
      reviewId,
      discordModeratorId,
      "discord",
      `Approved by ${user.username} via Discord`,
      true
    );

    if (result.notFound) {
      return ephemeralJson(MISSING_SUBMISSION_MESSAGE);
    }

    if (result.success) {
      const statusText =
        result.newStatus === "approved"
          ? "fully approved and published"
          : "received first approval";

      return ephemeralJson(
        `✅ **Review ${statusText}**\nReview ${reviewId} approved by ${user.username}`
      );
    }

    return ephemeralJson(
      `❌ **Approval failed**: ${result.error || "Unknown error"}`
    );
  } catch (error) {
    Logger.error(
      "Review approval error",
      createLogContext("discord-moderation", {
        submissionId: reviewId,
        userId: user.id,
      }),
      error instanceof Error ? error : undefined
    );
    return ephemeralJson(
      `❌ **Error**: Failed to approve review - ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function rejectReview(
  ctx: DiscordContext,
  reviewId: string,
  user: DiscordUser
): Promise<Response> {
  try {
    const discordModeratorId =
      await ctx.moderationService.getOrCreateDiscordModerator(
        user.id,
        user.username
      );

    if (!discordModeratorId) {
      return ephemeralJson(
        `❌ **Error**: Failed to create Discord moderator record`
      );
    }

    const result = await ctx.moderationService.recordRejection(
      "review",
      reviewId,
      discordModeratorId,
      "discord",
      {
        category: "other",
        reason: `Rejected by ${user.username} via Discord`,
      },
      ctx.env.R2_BUCKET,
      true
    );

    if (result.notFound) {
      return ephemeralJson(MISSING_SUBMISSION_MESSAGE);
    }

    if (result.success) {
      return ephemeralJson(
        `❌ **Review rejected**\nReview ${reviewId} rejected by ${user.username}`
      );
    }

    return ephemeralJson(
      `❌ **Rejection failed**: ${result.error || "Unknown error"}`
    );
  } catch (error) {
    Logger.error(
      "Review rejection error",
      createLogContext("discord-moderation", {
        submissionId: reviewId,
        userId: user.id,
      }),
      error instanceof Error ? error : undefined
    );
    return ephemeralJson(
      `❌ **Error**: Failed to reject review - ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================================
// Player edit
// ============================================================

export async function approvePlayerEdit(
  ctx: DiscordContext,
  editId: string,
  user: DiscordUser
): Promise<Response> {
  try {
    const discordModeratorId =
      await ctx.moderationService.getOrCreateDiscordModerator(
        user.id,
        user.username
      );

    if (!discordModeratorId) {
      return ephemeralJson(
        `❌ **Error**: Failed to create Discord moderator record`
      );
    }

    const result = await ctx.moderationService.recordApproval(
      "player_edit",
      editId,
      discordModeratorId,
      "discord",
      undefined,
      true
    );

    if (result.notFound) {
      return ephemeralJson(MISSING_SUBMISSION_MESSAGE);
    }

    if (result.success) {
      await messages.updateDiscordMessageAfterModeration(
        ctx,
        "player_edit",
        editId,
        result.newStatus || "pending",
        user.username
      );

      let message = "Your approval has been recorded.";
      if (result.newStatus === "approved") {
        message =
          "Player edit has been fully approved and changes will be applied.";
      } else if (result.newStatus === "awaiting_second_approval") {
        message =
          "Player edit needs one more approval before changes are applied.";
      }

      return visibleJson(
        `✅ **Player Edit Approved by ${user.username}**\nPlayer edit ${editId}: ${message}`
      );
    }

    return ephemeralJson(
      `❌ **Error**: ${result.error || "Failed to process approval"}`
    );
  } catch (error) {
    Logger.error(
      "Error handling approve player edit",
      createLogContext("discord-moderation", { userId: user.id }),
      error instanceof Error ? error : undefined
    );
    return ephemeralJson(
      `❌ **Error**: Failed to process player edit approval`
    );
  }
}

export async function rejectPlayerEdit(
  ctx: DiscordContext,
  editId: string,
  user: DiscordUser
): Promise<Response> {
  try {
    const discordModeratorId =
      await ctx.moderationService.getOrCreateDiscordModerator(
        user.id,
        user.username
      );

    if (!discordModeratorId) {
      return ephemeralJson(
        `❌ **Error**: Failed to create Discord moderator record`
      );
    }

    const result = await ctx.moderationService.recordRejection(
      "player_edit",
      editId,
      discordModeratorId,
      "discord",
      {
        category: "other",
        reason: `Rejected via Discord by ${user.username}`,
      },
      ctx.context.cloudflare?.env?.R2_BUCKET,
      true
    );

    if (result.notFound) {
      return ephemeralJson(MISSING_SUBMISSION_MESSAGE);
    }

    if (result.success) {
      await messages.updateDiscordMessageAfterModeration(
        ctx,
        "player_edit",
        editId,
        "rejected",
        user.username
      );

      return visibleJson(
        `❌ **Player Edit Rejected by ${user.username}**\nPlayer edit ${editId} has been rejected and changes will not be applied.`
      );
    }

    return ephemeralJson(
      `❌ **Error**: ${result.error || "Failed to reject player edit"}`
    );
  } catch (error) {
    Logger.error(
      "Error handling reject player edit",
      createLogContext("discord-moderation", { userId: user.id }),
      error instanceof Error ? error : undefined
    );
    return ephemeralJson(
      `❌ **Error**: Failed to process player edit rejection`
    );
  }
}

// ============================================================
// Equipment submission
// ============================================================

export async function approveEquipmentSubmission(
  ctx: DiscordContext,
  submissionId: string,
  user: DiscordUser
): Promise<Response> {
  try {
    const discordModeratorId =
      await ctx.moderationService.getOrCreateDiscordModerator(
        user.id,
        user.username
      );

    if (!discordModeratorId) {
      return ephemeralJson(
        `❌ **Error**: Failed to create Discord moderator record`
      );
    }

    const result = await ctx.moderationService.recordApproval(
      "equipment",
      submissionId,
      discordModeratorId,
      "discord",
      undefined,
      true
    );

    if (result.notFound) {
      return ephemeralJson(MISSING_SUBMISSION_MESSAGE);
    }

    if (result.success) {
      await messages.updateDiscordMessageAfterModeration(
        ctx,
        "equipment",
        submissionId,
        result.newStatus || "pending",
        user.username
      );

      let message = "Your approval has been recorded.";
      if (result.newStatus === "approved") {
        message =
          "Equipment submission has been fully approved and will be published.";
      } else if (result.newStatus === "awaiting_second_approval") {
        message =
          "Equipment submission needs one more approval before being published.";
      }

      return visibleJson(
        `✅ **Equipment Approved by ${user.username}**\nEquipment submission ${submissionId}: ${message}`
      );
    }

    return ephemeralJson(
      `❌ **Error**: ${result.error || "Failed to process approval"}`
    );
  } catch (error) {
    Logger.error(
      "Error handling approve equipment submission",
      createLogContext("discord-moderation", { userId: user.id }),
      error instanceof Error ? error : undefined
    );
    return ephemeralJson(
      `❌ **Error**: Failed to process equipment submission approval`
    );
  }
}

export async function rejectEquipmentSubmission(
  ctx: DiscordContext,
  submissionId: string,
  user: DiscordUser
): Promise<Response> {
  try {
    const discordModeratorId =
      await ctx.moderationService.getOrCreateDiscordModerator(
        user.id,
        user.username
      );

    if (!discordModeratorId) {
      return ephemeralJson(
        `❌ **Error**: Failed to create Discord moderator record`
      );
    }

    const result = await ctx.moderationService.recordRejection(
      "equipment",
      submissionId,
      discordModeratorId,
      "discord",
      {
        category: "other",
        reason: `Rejected via Discord by ${user.username}`,
      },
      ctx.context.cloudflare?.env?.R2_BUCKET,
      true
    );

    if (result.notFound) {
      return ephemeralJson(MISSING_SUBMISSION_MESSAGE);
    }

    if (result.success) {
      await messages.updateDiscordMessageAfterModeration(
        ctx,
        "equipment",
        submissionId,
        "rejected",
        user.username
      );

      return visibleJson(
        `❌ **Equipment Rejected by ${user.username}**\nEquipment submission ${submissionId} has been rejected and will not be published.`
      );
    }

    return ephemeralJson(
      `❌ **Error**: ${result.error || "Failed to reject equipment submission"}`
    );
  } catch (error) {
    Logger.error(
      "Error handling reject equipment submission",
      createLogContext("discord-moderation", { userId: user.id }),
      error instanceof Error ? error : undefined
    );
    return ephemeralJson(
      `❌ **Error**: Failed to process equipment submission rejection`
    );
  }
}

// ============================================================
// Player submission
// ============================================================

export async function approvePlayerSubmission(
  ctx: DiscordContext,
  submissionId: string,
  user: DiscordUser
): Promise<Response> {
  try {
    const discordModeratorId =
      await ctx.moderationService.getOrCreateDiscordModerator(
        user.id,
        user.username
      );

    if (!discordModeratorId) {
      return ephemeralJson(
        `❌ **Error**: Failed to create Discord moderator record`
      );
    }

    const result = await ctx.moderationService.recordApproval(
      "player",
      submissionId,
      discordModeratorId,
      "discord",
      undefined,
      true
    );

    if (result.notFound) {
      return ephemeralJson(MISSING_SUBMISSION_MESSAGE);
    }

    if (result.success) {
      await messages.updateDiscordMessageAfterModeration(
        ctx,
        "player",
        submissionId,
        result.newStatus || "pending",
        user.username
      );

      let message = "Your approval has been recorded.";
      if (result.newStatus === "approved") {
        message =
          "Player submission has been fully approved and will be published.";
      } else if (result.newStatus === "awaiting_second_approval") {
        message =
          "Player submission needs one more approval before being published.";
      }

      return visibleJson(
        `✅ **Player Approved by ${user.username}**\nPlayer submission ${submissionId}: ${message}`
      );
    }

    return ephemeralJson(
      `❌ **Error**: ${result.error || "Failed to process approval"}`
    );
  } catch (error) {
    Logger.error(
      "Error handling approve player submission",
      createLogContext("discord-moderation", { userId: user.id }),
      error instanceof Error ? error : undefined
    );
    return ephemeralJson(
      `❌ **Error**: Failed to process player submission approval`
    );
  }
}

export async function rejectPlayerSubmission(
  ctx: DiscordContext,
  submissionId: string,
  user: DiscordUser
): Promise<Response> {
  try {
    const discordModeratorId =
      await ctx.moderationService.getOrCreateDiscordModerator(
        user.id,
        user.username
      );

    if (!discordModeratorId) {
      return ephemeralJson(
        `❌ **Error**: Failed to create Discord moderator record`
      );
    }

    const result = await ctx.moderationService.recordRejection(
      "player",
      submissionId,
      discordModeratorId,
      "discord",
      {
        category: "other",
        reason: `Rejected via Discord by ${user.username}`,
      },
      ctx.context.cloudflare?.env?.R2_BUCKET,
      true
    );

    if (result.notFound) {
      return ephemeralJson(MISSING_SUBMISSION_MESSAGE);
    }

    if (result.success) {
      await messages.updateDiscordMessageAfterModeration(
        ctx,
        "player",
        submissionId,
        "rejected",
        user.username
      );

      return visibleJson(
        `❌ **Player Rejected by ${user.username}**\nPlayer submission ${submissionId} has been rejected and will not be published.`
      );
    }

    return ephemeralJson(
      `❌ **Error**: ${result.error || "Failed to reject player submission"}`
    );
  } catch (error) {
    Logger.error(
      "Error handling reject player submission",
      createLogContext("discord-moderation", { userId: user.id }),
      error instanceof Error ? error : undefined
    );
    return ephemeralJson(
      `❌ **Error**: Failed to process player submission rejection`
    );
  }
}

// ============================================================
// Player equipment setup
// ============================================================

export async function approvePlayerEquipmentSetup(
  ctx: DiscordContext,
  submissionId: string,
  user: DiscordUser
): Promise<Response> {
  try {
    const discordModeratorId =
      await ctx.moderationService.getOrCreateDiscordModerator(
        user.id,
        user.username
      );

    if (!discordModeratorId) {
      return ephemeralJson(
        `❌ **Error**: Failed to create Discord moderator record`
      );
    }

    const result = await ctx.moderationService.recordApproval(
      "player_equipment_setup",
      submissionId,
      discordModeratorId,
      "discord",
      undefined,
      true
    );

    if (result.notFound) {
      return ephemeralJson(MISSING_SUBMISSION_MESSAGE);
    }

    if (result.success) {
      let message = "Your approval has been recorded.";
      if (result.newStatus === "approved") {
        message =
          "Player equipment setup has been fully approved and will be published.";
      } else if (result.newStatus === "awaiting_second_approval") {
        message =
          "Player equipment setup needs one more approval before being published.";
      }

      return visibleJson(
        `✅ **Player Equipment Setup Approved by ${user.username}**\nSubmission ${submissionId}: ${message}`
      );
    }

    return ephemeralJson(
      `❌ **Error**: ${result.error || "Failed to process approval"}`
    );
  } catch (error) {
    Logger.error(
      "Error handling approve player equipment setup",
      createLogContext("discord-moderation", { userId: user.id }),
      error instanceof Error ? error : undefined
    );
    return ephemeralJson(
      `❌ **Error**: Failed to process player equipment setup approval`
    );
  }
}

export async function rejectPlayerEquipmentSetup(
  ctx: DiscordContext,
  submissionId: string,
  user: DiscordUser
): Promise<Response> {
  try {
    const discordModeratorId =
      await ctx.moderationService.getOrCreateDiscordModerator(
        user.id,
        user.username
      );

    if (!discordModeratorId) {
      return ephemeralJson(
        `❌ **Error**: Failed to create Discord moderator record`
      );
    }

    const result = await ctx.moderationService.recordRejection(
      "player_equipment_setup",
      submissionId,
      discordModeratorId,
      "discord",
      {
        category: "other",
        reason: `Rejected via Discord by ${user.username}`,
      },
      ctx.context.cloudflare?.env?.R2_BUCKET,
      true
    );

    if (result.notFound) {
      return ephemeralJson(MISSING_SUBMISSION_MESSAGE);
    }

    if (result.success) {
      return visibleJson(
        `❌ **Player Equipment Setup Rejected by ${user.username}**\nSubmission ${submissionId} has been rejected and will not be published.`
      );
    }

    return ephemeralJson(
      `❌ **Error**: ${result.error || "Failed to reject player equipment setup"}`
    );
  } catch (error) {
    Logger.error(
      "Error handling reject player equipment setup",
      createLogContext("discord-moderation", { userId: user.id }),
      error instanceof Error ? error : undefined
    );
    return ephemeralJson(
      `❌ **Error**: Failed to process player equipment setup rejection`
    );
  }
}

// ============================================================
// Video submission
// ============================================================

export async function approveVideoSubmission(
  ctx: DiscordContext,
  submissionId: string,
  user: DiscordUser
): Promise<Response> {
  try {
    const discordModeratorId =
      await ctx.moderationService.getOrCreateDiscordModerator(
        user.id,
        user.username
      );

    if (!discordModeratorId) {
      return ephemeralJson(
        `❌ **Error**: Failed to create Discord moderator record`
      );
    }

    const result = await ctx.moderationService.recordApproval(
      "video",
      submissionId,
      discordModeratorId,
      "discord",
      undefined,
      true
    );

    if (result.notFound) {
      return ephemeralJson(MISSING_SUBMISSION_MESSAGE);
    }

    if (result.success) {
      let message = "Your approval has been recorded.";
      if (result.newStatus === "approved") {
        message =
          "Video submission has been fully approved and will be published.";
      } else if (result.newStatus === "awaiting_second_approval") {
        message =
          "Video submission needs one more approval before being published.";
      }

      return visibleJson(
        `✅ **Video Approved by ${user.username}**\nSubmission ${submissionId}: ${message}`
      );
    }

    return ephemeralJson(
      `❌ **Error**: ${result.error || "Failed to process approval"}`
    );
  } catch (error) {
    Logger.error(
      "Error handling approve video submission",
      createLogContext("discord-moderation", { userId: user.id }),
      error instanceof Error ? error : undefined
    );
    return ephemeralJson(
      `❌ **Error**: Failed to process video submission approval`
    );
  }
}

export async function rejectVideoSubmission(
  ctx: DiscordContext,
  submissionId: string,
  user: DiscordUser
): Promise<Response> {
  try {
    const discordModeratorId =
      await ctx.moderationService.getOrCreateDiscordModerator(
        user.id,
        user.username
      );

    if (!discordModeratorId) {
      return ephemeralJson(
        `❌ **Error**: Failed to create Discord moderator record`
      );
    }

    const result = await ctx.moderationService.recordRejection(
      "video",
      submissionId,
      discordModeratorId,
      "discord",
      {
        category: "other",
        reason: `Rejected via Discord by ${user.username}`,
      },
      ctx.context.cloudflare?.env?.R2_BUCKET,
      true
    );

    if (result.notFound) {
      return ephemeralJson(MISSING_SUBMISSION_MESSAGE);
    }

    if (result.success) {
      return visibleJson(
        `❌ **Video Rejected by ${user.username}**\nSubmission ${submissionId} has been rejected and will not be published.`
      );
    }

    return ephemeralJson(
      `❌ **Error**: ${result.error || "Failed to reject video submission"}`
    );
  } catch (error) {
    Logger.error(
      "Error handling reject video submission",
      createLogContext("discord-moderation", { userId: user.id }),
      error instanceof Error ? error : undefined
    );
    return ephemeralJson(
      `❌ **Error**: Failed to process video submission rejection`
    );
  }
}

// ============================================================
// Permissions
// ============================================================

// Well-known role string used by e2e Playwright specs (see
// e2e/utils/discord.ts buildButtonInteraction). Auto-allowed when
// ENVIRONMENT=development so Discord click specs run locally without
// each developer having to add it to DISCORD_ALLOWED_ROLES by hand.
export const E2E_TEST_ROLE_ID = "role_e2e_moderator";

/**
 * Allow any user when no DISCORD_ALLOWED_ROLES is configured; otherwise
 * require the user to have at least one of the listed role IDs. In dev,
 * the well-known E2E_TEST_ROLE_ID is also accepted.
 */
export async function checkUserPermissions(
  ctx: DiscordContext,
  member: DiscordMember,
  _guildId: string
): Promise<boolean> {
  if (!member || !member.roles) return false;

  const allowedRoles = ctx.env.DISCORD_ALLOWED_ROLES?.split(",") || [];
  if (allowedRoles.length === 0) {
    // If no roles configured, allow all users
    return true;
  }

  if (
    ctx.env.ENVIRONMENT === "development" &&
    !allowedRoles.includes(E2E_TEST_ROLE_ID)
  ) {
    allowedRoles.push(E2E_TEST_ROLE_ID);
  }

  return member.roles.some((roleId: string) => allowedRoles.includes(roleId));
}

// ============================================================
// Response helpers (local to this module)
// ============================================================

function ephemeralJson(content: string): Response {
  return new Response(
    JSON.stringify({
      type: 4,
      data: { content, flags: 64 },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

function visibleJson(content: string): Response {
  return new Response(
    JSON.stringify({
      type: 4,
      data: { content },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
