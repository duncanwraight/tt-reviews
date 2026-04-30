import { describe, it, expect, vi, beforeEach } from "vitest";
import * as moderation from "../moderation";
import type { DiscordContext, DiscordUser } from "../types";

/**
 * Discord apply-hook coverage for the two *_edit submission types.
 * Each suite verifies that when the second Discord approval flips
 * status to "approved", the dispatch table runs the matching applier
 * — and that the wrong applier is never called for the wrong type.
 *
 * Sibling new-record types live in
 * moderation-apply-hooks-submissions.test.ts.
 */

function makeCtx(
  env: Record<string, string | undefined> = {},
  modService: Record<string, ReturnType<typeof vi.fn>> = {}
): DiscordContext {
  return {
    env: {
      DISCORD_ALLOWED_ROLES: "moderator",
      R2_BUCKET: undefined,
      ...env,
    } as any,
    context: {
      cloudflare: { env: { R2_BUCKET: undefined } },
    } as any,

    dbService: {} as any,
    supabaseAdmin: {} as any,
    moderationService: {
      getOrCreateDiscordModerator: vi.fn().mockResolvedValue("mod-row-id"),
      recordApproval: vi
        .fn()
        .mockResolvedValue({ success: true, newStatus: "approved" }),
      recordRejection: vi.fn().mockResolvedValue({ success: true }),
      ...modService,
    } as any,

    unifiedNotifier: {} as any,
  };
}

const user: DiscordUser = { id: "discord-uid", username: "modname" };

const asJson = async (r: Response): Promise<any> => JSON.parse(await r.text());

vi.mock("../../admin/equipment-edit-applier.server", () => ({
  applyEquipmentEdit: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("../../admin/player-edit-applier.server", () => ({
  applyPlayerEdit: vi.fn().mockResolvedValue({ success: true }),
}));

// TT-106: Discord-driven approval applies the equipment_edit when
// the second approval flips status to "approved". Without this hook
// the trigger would mark the row approved but the equipment table
// would never receive the diff.
describe("approveEquipmentEdit — Discord apply hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls applyEquipmentEdit when status flips to approved", async () => {
    const { applyEquipmentEdit } =
      await import("../../admin/equipment-edit-applier.server");
    const ctx = makeCtx({}, {
      recordApproval: vi
        .fn()
        .mockResolvedValue({ success: true, newStatus: "approved" }),
    } as any);
    await moderation.approveEquipmentEdit(ctx, "edit-1", user);
    expect(applyEquipmentEdit).toHaveBeenCalledTimes(1);
    expect(applyEquipmentEdit).toHaveBeenCalledWith(
      ctx.supabaseAdmin,
      ctx.env.IMAGE_BUCKET,
      "edit-1"
    );
  });

  it("skips applier on awaiting_second_approval (one Discord click of two)", async () => {
    const { applyEquipmentEdit } =
      await import("../../admin/equipment-edit-applier.server");
    const ctx = makeCtx({}, {
      recordApproval: vi.fn().mockResolvedValue({
        success: true,
        newStatus: "awaiting_second_approval",
      }),
    } as any);
    await moderation.approveEquipmentEdit(ctx, "edit-2", user);
    expect(applyEquipmentEdit).not.toHaveBeenCalled();
  });

  it("returns warning ephemeral when the applier fails", async () => {
    const { applyEquipmentEdit } =
      await import("../../admin/equipment-edit-applier.server");
    (applyEquipmentEdit as any).mockResolvedValueOnce({
      success: false,
      error: "Staged image not found",
    });
    const ctx = makeCtx({}, {
      recordApproval: vi
        .fn()
        .mockResolvedValue({ success: true, newStatus: "approved" }),
    } as any);
    const body = await asJson(
      await moderation.approveEquipmentEdit(ctx, "edit-3", user)
    );
    expect(body.data.flags).toBe(64);
    expect(body.data.content).toContain("apply failed");
    expect(body.data.content).toContain("Staged image not found");
  });

  it("does NOT call applyEquipmentEdit on player_edit approval", async () => {
    const { applyEquipmentEdit } =
      await import("../../admin/equipment-edit-applier.server");
    const ctx = makeCtx({}, {
      recordApproval: vi
        .fn()
        .mockResolvedValue({ success: true, newStatus: "approved" }),
    } as any);
    await moderation.approvePlayerEdit(ctx, "pe-1", user);
    expect(applyEquipmentEdit).not.toHaveBeenCalled();
  });
});

// TT-113: parity hook for player_edit. Same shape as the
// equipment_edit suite above — when the second Discord approval flips
// status to "approved", the dispatch table must run applyPlayerEdit
// so the players row receives the diff.
describe("approvePlayerEdit — Discord apply hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls applyPlayerEdit when status flips to approved", async () => {
    const { applyPlayerEdit } =
      await import("../../admin/player-edit-applier.server");
    const ctx = makeCtx({}, {
      recordApproval: vi
        .fn()
        .mockResolvedValue({ success: true, newStatus: "approved" }),
    } as any);
    await moderation.approvePlayerEdit(ctx, "pe-1", user);
    expect(applyPlayerEdit).toHaveBeenCalledTimes(1);
    expect(applyPlayerEdit).toHaveBeenCalledWith(ctx.supabaseAdmin, "pe-1");
  });

  it("skips applier on awaiting_second_approval (one Discord click of two)", async () => {
    const { applyPlayerEdit } =
      await import("../../admin/player-edit-applier.server");
    const ctx = makeCtx({}, {
      recordApproval: vi.fn().mockResolvedValue({
        success: true,
        newStatus: "awaiting_second_approval",
      }),
    } as any);
    await moderation.approvePlayerEdit(ctx, "pe-2", user);
    expect(applyPlayerEdit).not.toHaveBeenCalled();
  });

  it("returns warning ephemeral when the applier fails", async () => {
    const { applyPlayerEdit } =
      await import("../../admin/player-edit-applier.server");
    (applyPlayerEdit as any).mockResolvedValueOnce({
      success: false,
      error: "RLS denied",
    });
    const ctx = makeCtx({}, {
      recordApproval: vi
        .fn()
        .mockResolvedValue({ success: true, newStatus: "approved" }),
    } as any);
    const body = await asJson(
      await moderation.approvePlayerEdit(ctx, "pe-3", user)
    );
    expect(body.data.flags).toBe(64);
    expect(body.data.content).toContain("apply failed");
    expect(body.data.content).toContain("RLS denied");
  });

  it("does NOT call applyPlayerEdit on equipment_edit approval", async () => {
    const { applyPlayerEdit } =
      await import("../../admin/player-edit-applier.server");
    const ctx = makeCtx({}, {
      recordApproval: vi
        .fn()
        .mockResolvedValue({ success: true, newStatus: "approved" }),
    } as any);
    await moderation.approveEquipmentEdit(ctx, "ee-1", user);
    expect(applyPlayerEdit).not.toHaveBeenCalled();
  });
});
