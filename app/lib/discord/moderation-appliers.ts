import type { SubmissionType } from "../submissions/registry";
import type { DiscordContext } from "./types";

/**
 * Result shape returned by every per-type apply helper. Mirrors the
 * `ApplyResult` defined in app/lib/admin/equipment-edit-applier.server.ts;
 * future appliers (TT-111 umbrella) follow the same shape so the dispatch
 * table can call them through a single signature.
 */
export interface ApplyHandlerResult {
  success: boolean;
  error?: string;
}

/**
 * Per-type post-approval apply step. Invoked by the Discord moderation
 * engine when `recordApproval` flips a submission to `newStatus="approved"`.
 *
 * - The handler is responsible for fetching whatever it needs from the
 *   submission row and writing to the canonical table (e.g. `equipment`,
 *   `players`, `player_footage`).
 * - It must NOT call recordApproval / recordRejection — that has already
 *   happened by the time the dispatcher invokes it.
 * - It MUST be idempotent: a second click whose recordApproval insert
 *   races with the trigger could in theory re-invoke; the canonical
 *   write should detect "already applied" rather than throw.
 */
export type ApplyHandler = (
  ctx: DiscordContext,
  submissionId: string
) => Promise<ApplyHandlerResult>;

/**
 * Dispatch table: maps every SubmissionType to its post-approval apply
 * step, or `null` when no apply is needed.
 *
 * - `null` for `review`: single-table pattern — the submission row IS
 *   the canonical row, so flipping `status='approved'` is publication.
 *   No data movement happens at apply time; the entry is `null` by
 *   design and stays that way.
 *
 * - `null` for `video`, `player_equipment_setup`: staging→canonical
 *   pattern with a known gap (TT-111 umbrella). These will each be
 *   filled in as their sibling tickets land. Until then, two Discord
 *   approvals flip the status but the canonical row is not written.
 *   Admin UI paths are the only way these reach the canonical table
 *   today.
 *
 * Adding a new SubmissionType forces a decision here — TypeScript
 * `Record<SubmissionType, …>` requires an entry for every union member.
 */
export const APPLY_HANDLERS: Record<SubmissionType, ApplyHandler | null> = {
  equipment_edit: async (ctx, submissionId) => {
    const { applyEquipmentEdit } =
      await import("../admin/equipment-edit-applier.server");
    return applyEquipmentEdit(
      ctx.supabaseAdmin,
      ctx.env.IMAGE_BUCKET,
      submissionId
    );
  },
  player_edit: async (ctx, submissionId) => {
    const { applyPlayerEdit } =
      await import("../admin/player-edit-applier.server");
    return applyPlayerEdit(ctx.supabaseAdmin, submissionId);
  },
  equipment: async (ctx, submissionId) => {
    const { applyEquipmentSubmission } =
      await import("../admin/equipment-submission-applier.server");
    return applyEquipmentSubmission(ctx.supabaseAdmin, submissionId);
  },
  player: async (ctx, submissionId) => {
    const { applyPlayerSubmission } =
      await import("../admin/player-submission-applier.server");
    return applyPlayerSubmission(ctx.supabaseAdmin, submissionId);
  },
  review: null,
  video: null,
  player_equipment_setup: null,
};
