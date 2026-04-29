import { describe, it, expect, vi } from "vitest";
import { APPLY_HANDLERS } from "../moderation-appliers";
import type { DiscordContext } from "../types";
import type { SubmissionType } from "../../submissions/registry";

/**
 * Contract tests for the apply-handler dispatch table. The `Record<…>`
 * type pins one entry per SubmissionType at compile time; these tests
 * pin runtime behavior of each entry — null where no apply is needed,
 * functional handler where it is.
 *
 * As sibling TT-111 tickets (TT-113..117) fill in handlers for their
 * types, flip the corresponding `null` assertion to expect a function
 * — that's the cross-check that the dispatch table actually got wired.
 */

vi.mock("../../admin/equipment-edit-applier.server", () => ({
  applyEquipmentEdit: vi.fn().mockResolvedValue({ success: true }),
}));

const ALL_TYPES: SubmissionType[] = [
  "review",
  "equipment",
  "player",
  "player_edit",
  "equipment_edit",
  "video",
  "player_equipment_setup",
];

describe("APPLY_HANDLERS dispatch table", () => {
  it("has an entry for every SubmissionType", () => {
    for (const type of ALL_TYPES) {
      expect(type in APPLY_HANDLERS).toBe(true);
    }
  });

  it("null for review — single-table pattern, status flip is publication", () => {
    expect(APPLY_HANDLERS.review).toBeNull();
  });

  it("equipment_edit entry is a callable handler that delegates to applyEquipmentEdit", async () => {
    const handler = APPLY_HANDLERS.equipment_edit;
    expect(typeof handler).toBe("function");

    const ctx = {
      supabaseAdmin: { stub: true },
      env: { IMAGE_BUCKET: "bucket-stub" },
    } as unknown as DiscordContext;

    const result = await handler!(ctx, "edit-id");
    expect(result).toEqual({ success: true });

    const { applyEquipmentEdit } =
      await import("../../admin/equipment-edit-applier.server");
    expect(applyEquipmentEdit).toHaveBeenCalledWith(
      ctx.supabaseAdmin,
      "bucket-stub",
      "edit-id"
    );
  });

  // The entries below are null TODAY. As each sibling TT-111 ticket lands
  // (TT-113..117), flip the corresponding test to expect a function and
  // assert it routes to the right applier — the dispatch wire-up is the
  // half of the work that's easy to forget if the test doesn't enforce it.
  it.each<SubmissionType>([
    "equipment",
    "player",
    "player_edit",
    "video",
    "player_equipment_setup",
  ])("entry for %s is currently null (TT-111 sibling will fill)", type => {
    expect(APPLY_HANDLERS[type]).toBeNull();
  });
});
