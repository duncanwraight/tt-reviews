import type { SubmissionType } from "../types";
import type { DiscordContext } from "./types";

/**
 * Outbound Discord notifications for new submissions. Every type-specific
 * helper is a thin delegate to the UnifiedDiscordNotifier so per-type
 * formatting stays owned by the registry (see app/lib/submissions/registry.ts).
 */

export async function notifyNewReview(
  ctx: DiscordContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reviewData: any,
  requestId: string = "unknown"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  return ctx.unifiedNotifier.notifySubmission("review", reviewData, requestId);
}

export async function notifyNewPlayerEdit(
  ctx: DiscordContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editData: any,
  requestId: string = "unknown"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  return ctx.unifiedNotifier.notifySubmission(
    "player_edit",
    editData,
    requestId
  );
}

export async function notifyNewEquipmentSubmission(
  ctx: DiscordContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  submissionData: any,
  requestId: string = "unknown"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  return ctx.unifiedNotifier.notifySubmission(
    "equipment",
    submissionData,
    requestId
  );
}

export async function notifyNewPlayerSubmission(
  ctx: DiscordContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  submissionData: any,
  requestId: string = "unknown"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  return ctx.unifiedNotifier.notifySubmission(
    "player",
    submissionData,
    requestId
  );
}

export async function notifyNewVideoSubmission(
  ctx: DiscordContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  submissionData: any,
  requestId: string = "unknown"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  return ctx.unifiedNotifier.notifySubmission(
    "video",
    submissionData,
    requestId
  );
}

export async function notifyNewPlayerEquipmentSetup(
  ctx: DiscordContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  equipmentData: any,
  requestId: string = "unknown"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  return ctx.unifiedNotifier.notifySubmission(
    "player_equipment_setup",
    equipmentData,
    requestId
  );
}

/**
 * Generic notification for any submission type — used by submission flows
 * that know their type at runtime.
 */
export async function notifySubmission(
  ctx: DiscordContext,
  submissionType: SubmissionType,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  submissionData: any,
  requestId: string = "unknown"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  return ctx.unifiedNotifier.notifySubmission(
    submissionType,
    submissionData,
    requestId
  );
}

/**
 * Notify that an existing review has been approved. Currently a stub —
 * the moderation path updates the Discord message in place rather than
 * posting a new notification. Retained so callers don't need changes if
 * the behaviour is implemented later.
 */
export async function notifyReviewApproved(
  _ctx: DiscordContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _reviewData: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  return { success: true };
}

/**
 * Notify that an existing review has been rejected. Currently a stub —
 * see notifyReviewApproved above.
 */
export async function notifyReviewRejected(
  _ctx: DiscordContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _reviewData: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  return { success: true };
}
