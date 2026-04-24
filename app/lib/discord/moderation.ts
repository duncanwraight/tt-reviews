import type { SubmissionType } from "../submissions/registry";
import { Logger, createLogContext } from "../logger.server";
import * as messages from "./messages";
import { MODERATION_HANDLERS, type ResponseKind } from "./moderation-handlers";
import type {
  DiscordContext,
  DiscordMember,
  DiscordUser,
  ModeratableSubmissionType,
} from "./types";

// Ephemeral message shown when a Discord click references a submission
// that does not exist in the target environment — typically a dev-app
// click landing on prod because both share the prod Interactions
// Endpoint URL. Without this, the insert would land as an orphan row in
// moderator_approvals (historical bug, see archive/DISCORD-HARDENING.md).
const MISSING_SUBMISSION_MESSAGE =
  "❌ **Submission not found** — this click may have come from a different environment.";

// ============================================================
// Generic approve/reject engine — shared across all six submission
// types. Per-type variation (strings, r2 source, response kind, tracked
// message) lives in MODERATION_HANDLERS (moderation-handlers.ts).
// ============================================================

function logContextFor(
  includeSubmissionId: boolean,
  submissionId: string,
  userId: string
) {
  return createLogContext(
    "discord-moderation",
    includeSubmissionId ? { submissionId, userId } : { userId }
  );
}

function respond(content: string, kind: ResponseKind): Response {
  return kind === "visible" ? visibleJson(content) : ephemeralJson(content);
}

async function applyApproval(
  ctx: DiscordContext,
  type: SubmissionType,
  submissionId: string,
  user: DiscordUser
): Promise<Response> {
  const cfg = MODERATION_HANDLERS[type];
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
      type,
      submissionId,
      discordModeratorId,
      "discord",
      cfg.approval.note?.(user.username),
      true
    );

    if (result.notFound) {
      return ephemeralJson(MISSING_SUBMISSION_MESSAGE);
    }

    if (result.success) {
      if (cfg.hasTrackedMessage) {
        // ModeratableSubmissionType excludes "review" and
        // "player_equipment_setup" — exactly the types whose handler
        // sets hasTrackedMessage: false. The branch guard makes the
        // narrowed type safe.
        await messages.updateDiscordMessageAfterModeration(
          ctx,
          type as ModeratableSubmissionType,
          submissionId,
          result.newStatus || "pending",
          user.username
        );
      }
      return respond(
        cfg.approval.buildSuccess({
          id: submissionId,
          username: user.username,
          newStatus: result.newStatus || "",
        }),
        cfg.responseKind
      );
    }

    return ephemeralJson(cfg.approval.buildFallback(result.error));
  } catch (error) {
    Logger.error(
      cfg.approval.logMessage,
      logContextFor(
        cfg.approval.includeSubmissionIdInLog,
        submissionId,
        user.id
      ),
      error instanceof Error ? error : undefined
    );
    return ephemeralJson(cfg.approval.buildCatchMessage(error));
  }
}

async function applyRejection(
  ctx: DiscordContext,
  type: SubmissionType,
  submissionId: string,
  user: DiscordUser
): Promise<Response> {
  const cfg = MODERATION_HANDLERS[type];
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

    const r2Bucket =
      cfg.r2Source === "env"
        ? ctx.env.R2_BUCKET
        : ctx.context.cloudflare?.env?.R2_BUCKET;

    const result = await ctx.moderationService.recordRejection(
      type,
      submissionId,
      discordModeratorId,
      "discord",
      {
        category: "other",
        reason: cfg.rejection.reason(user.username),
      },
      r2Bucket,
      true
    );

    if (result.notFound) {
      return ephemeralJson(MISSING_SUBMISSION_MESSAGE);
    }

    if (result.success) {
      if (cfg.hasTrackedMessage) {
        // See approval-path comment: hasTrackedMessage is false for
        // exactly the types Exclude<SubmissionType, ...> removes.
        await messages.updateDiscordMessageAfterModeration(
          ctx,
          type as ModeratableSubmissionType,
          submissionId,
          "rejected",
          user.username
        );
      }
      return respond(
        cfg.rejection.buildSuccess({
          id: submissionId,
          username: user.username,
        }),
        cfg.responseKind
      );
    }

    return ephemeralJson(cfg.rejection.buildFallback(result.error));
  } catch (error) {
    Logger.error(
      cfg.rejection.logMessage,
      logContextFor(
        cfg.rejection.includeSubmissionIdInLog,
        submissionId,
        user.id
      ),
      error instanceof Error ? error : undefined
    );
    return ephemeralJson(cfg.rejection.buildCatchMessage(error));
  }
}

// ============================================================
// Per-type wrappers — preserved so dispatch.ts and the test suite can
// keep importing by name. Each is a one-line call through to the
// generic engine with its submission type baked in.
// ============================================================

export const approveReview = (
  ctx: DiscordContext,
  reviewId: string,
  user: DiscordUser
) => applyApproval(ctx, "review", reviewId, user);

export const rejectReview = (
  ctx: DiscordContext,
  reviewId: string,
  user: DiscordUser
) => applyRejection(ctx, "review", reviewId, user);

export const approvePlayerEdit = (
  ctx: DiscordContext,
  editId: string,
  user: DiscordUser
) => applyApproval(ctx, "player_edit", editId, user);

export const rejectPlayerEdit = (
  ctx: DiscordContext,
  editId: string,
  user: DiscordUser
) => applyRejection(ctx, "player_edit", editId, user);

export const approveEquipmentSubmission = (
  ctx: DiscordContext,
  submissionId: string,
  user: DiscordUser
) => applyApproval(ctx, "equipment", submissionId, user);

export const rejectEquipmentSubmission = (
  ctx: DiscordContext,
  submissionId: string,
  user: DiscordUser
) => applyRejection(ctx, "equipment", submissionId, user);

export const approvePlayerSubmission = (
  ctx: DiscordContext,
  submissionId: string,
  user: DiscordUser
) => applyApproval(ctx, "player", submissionId, user);

export const rejectPlayerSubmission = (
  ctx: DiscordContext,
  submissionId: string,
  user: DiscordUser
) => applyRejection(ctx, "player", submissionId, user);

export const approvePlayerEquipmentSetup = (
  ctx: DiscordContext,
  submissionId: string,
  user: DiscordUser
) => applyApproval(ctx, "player_equipment_setup", submissionId, user);

export const rejectPlayerEquipmentSetup = (
  ctx: DiscordContext,
  submissionId: string,
  user: DiscordUser
) => applyRejection(ctx, "player_equipment_setup", submissionId, user);

export const approveVideoSubmission = (
  ctx: DiscordContext,
  submissionId: string,
  user: DiscordUser
) => applyApproval(ctx, "video", submissionId, user);

export const rejectVideoSubmission = (
  ctx: DiscordContext,
  submissionId: string,
  user: DiscordUser
) => applyRejection(ctx, "video", submissionId, user);

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
