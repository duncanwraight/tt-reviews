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
vi.mock("../../admin/player-edit-applier.server", () => ({
  applyPlayerEdit: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("../../admin/equipment-submission-applier.server", () => ({
  applyEquipmentSubmission: vi.fn().mockResolvedValue({ success: true }),
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

  it("player_edit entry is a callable handler that delegates to applyPlayerEdit", async () => {
    const handler = APPLY_HANDLERS.player_edit;
    expect(typeof handler).toBe("function");

    const ctx = {
      supabaseAdmin: { stub: true },
      env: {},
    } as unknown as DiscordContext;

    const result = await handler!(ctx, "pe-id");
    expect(result).toEqual({ success: true });

    const { applyPlayerEdit } =
      await import("../../admin/player-edit-applier.server");
    expect(applyPlayerEdit).toHaveBeenCalledWith(ctx.supabaseAdmin, "pe-id");
  });

  it("equipment entry is a callable handler that delegates to applyEquipmentSubmission", async () => {
    const handler = APPLY_HANDLERS.equipment;
    expect(typeof handler).toBe("function");

    const ctx = {
      supabaseAdmin: { stub: true },
      env: {},
    } as unknown as DiscordContext;

    const result = await handler!(ctx, "es-id");
    expect(result).toEqual({ success: true });

    const { applyEquipmentSubmission } =
      await import("../../admin/equipment-submission-applier.server");
    expect(applyEquipmentSubmission).toHaveBeenCalledWith(
      ctx.supabaseAdmin,
      "es-id"
    );
  });

  // The entries below are null TODAY. As each sibling TT-111 ticket lands
  // (TT-115..117), flip the corresponding test to expect a function and
  // assert it routes to the right applier — the dispatch wire-up is the
  // half of the work that's easy to forget if the test doesn't enforce it.
  it.each<SubmissionType>(["player", "video", "player_equipment_setup"])(
    "entry for %s is currently null (TT-111 sibling will fill)",
    type => {
      expect(APPLY_HANDLERS[type]).toBeNull();
    }
  );
});
