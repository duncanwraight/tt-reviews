import { describe, it, expect, vi, beforeEach } from "vitest";
import * as moderation from "../moderation";
import type { DiscordContext, DiscordUser } from "../types";

/**
 * Discord apply-hook coverage for the four new-record submission types:
 * equipment, player, video, player_equipment_setup. Each suite verifies
 * that when the second Discord approval flips status to "approved", the
 * dispatch table runs the matching applier — and that the wrong applier
 * is never called for the wrong type.
 *
 * Sibling *_edit types live in moderation-apply-hooks-edits.test.ts.
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

vi.mock("../../admin/equipment-submission-applier.server", () => ({
  applyEquipmentSubmission: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("../../admin/player-submission-applier.server", () => ({
  applyPlayerSubmission: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("../../admin/video-submission-applier.server", () => ({
  applyVideoSubmission: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("../../admin/player-equipment-setup-applier.server", () => ({
  applyPlayerEquipmentSetup: vi.fn().mockResolvedValue({ success: true }),
}));

// TT-114: parity hook for equipment (new submission). Same shape as
// the equipment_edit + player_edit suites — the second Discord
// approval flips status to "approved" and the dispatch table runs
// applyEquipmentSubmission so the canonical equipment row gets created.
describe("approveEquipmentSubmission — Discord apply hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls applyEquipmentSubmission when status flips to approved", async () => {
    const { applyEquipmentSubmission } =
      await import("../../admin/equipment-submission-applier.server");
    const ctx = makeCtx({}, {
      recordApproval: vi
        .fn()
        .mockResolvedValue({ success: true, newStatus: "approved" }),
    } as any);
    await moderation.approveEquipmentSubmission(ctx, "es-1", user);
    expect(applyEquipmentSubmission).toHaveBeenCalledTimes(1);
    expect(applyEquipmentSubmission).toHaveBeenCalledWith(
      ctx.supabaseAdmin,
      "es-1"
    );
  });

  it("skips applier on awaiting_second_approval (one Discord click of two)", async () => {
    const { applyEquipmentSubmission } =
      await import("../../admin/equipment-submission-applier.server");
    const ctx = makeCtx({}, {
      recordApproval: vi.fn().mockResolvedValue({
        success: true,
        newStatus: "awaiting_second_approval",
      }),
    } as any);
    await moderation.approveEquipmentSubmission(ctx, "es-2", user);
    expect(applyEquipmentSubmission).not.toHaveBeenCalled();
  });

  it("returns warning ephemeral when the applier fails", async () => {
    const { applyEquipmentSubmission } =
      await import("../../admin/equipment-submission-applier.server");
    (applyEquipmentSubmission as any).mockResolvedValueOnce({
      success: false,
      error: "duplicate slug",
    });
    const ctx = makeCtx({}, {
      recordApproval: vi
        .fn()
        .mockResolvedValue({ success: true, newStatus: "approved" }),
    } as any);
    const body = await asJson(
      await moderation.approveEquipmentSubmission(ctx, "es-3", user)
    );
    expect(body.data.flags).toBe(64);
    expect(body.data.content).toContain("apply failed");
    expect(body.data.content).toContain("duplicate slug");
  });

  it("does NOT call applyEquipmentSubmission on player approval", async () => {
    const { applyEquipmentSubmission } =
      await import("../../admin/equipment-submission-applier.server");
    const ctx = makeCtx({}, {
      recordApproval: vi
        .fn()
        .mockResolvedValue({ success: true, newStatus: "approved" }),
    } as any);
    await moderation.approvePlayerSubmission(ctx, "ps-1", user);
    expect(applyEquipmentSubmission).not.toHaveBeenCalled();
  });
});

// TT-115: parity hook for player (new submission). Same shape as the
// sibling apply-hook suites — second Discord approval flips status to
// "approved" and the dispatch table runs applyPlayerSubmission so the
// canonical players row gets created.
describe("approvePlayerSubmission — Discord apply hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls applyPlayerSubmission when status flips to approved", async () => {
    const { applyPlayerSubmission } =
      await import("../../admin/player-submission-applier.server");
    const ctx = makeCtx({}, {
      recordApproval: vi
        .fn()
        .mockResolvedValue({ success: true, newStatus: "approved" }),
    } as any);
    await moderation.approvePlayerSubmission(ctx, "ps-1", user);
    expect(applyPlayerSubmission).toHaveBeenCalledTimes(1);
    expect(applyPlayerSubmission).toHaveBeenCalledWith(
      ctx.supabaseAdmin,
      "ps-1"
    );
  });

  it("skips applier on awaiting_second_approval (one Discord click of two)", async () => {
    const { applyPlayerSubmission } =
      await import("../../admin/player-submission-applier.server");
    const ctx = makeCtx({}, {
      recordApproval: vi.fn().mockResolvedValue({
        success: true,
        newStatus: "awaiting_second_approval",
      }),
    } as any);
    await moderation.approvePlayerSubmission(ctx, "ps-2", user);
    expect(applyPlayerSubmission).not.toHaveBeenCalled();
  });

  it("returns warning ephemeral when the applier fails", async () => {
    const { applyPlayerSubmission } =
      await import("../../admin/player-submission-applier.server");
    (applyPlayerSubmission as any).mockResolvedValueOnce({
      success: false,
      error: "FK violation",
    });
    const ctx = makeCtx({}, {
      recordApproval: vi
        .fn()
        .mockResolvedValue({ success: true, newStatus: "approved" }),
    } as any);
    const body = await asJson(
      await moderation.approvePlayerSubmission(ctx, "ps-3", user)
    );
    expect(body.data.flags).toBe(64);
    expect(body.data.content).toContain("apply failed");
    expect(body.data.content).toContain("FK violation");
  });

  it("does NOT call applyPlayerSubmission on equipment approval", async () => {
    const { applyPlayerSubmission } =
      await import("../../admin/player-submission-applier.server");
    const ctx = makeCtx({}, {
      recordApproval: vi
        .fn()
        .mockResolvedValue({ success: true, newStatus: "approved" }),
    } as any);
    await moderation.approveEquipmentSubmission(ctx, "es-1", user);
    expect(applyPlayerSubmission).not.toHaveBeenCalled();
  });
});

// TT-116: parity hook for video submissions. Highest-impact gap in
// the umbrella — both admin and Discord paths previously dropped the
// data. Same shape as sibling apply-hook suites.
describe("approveVideoSubmission — Discord apply hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls applyVideoSubmission when status flips to approved", async () => {
    const { applyVideoSubmission } =
      await import("../../admin/video-submission-applier.server");
    const ctx = makeCtx({}, {
      recordApproval: vi
        .fn()
        .mockResolvedValue({ success: true, newStatus: "approved" }),
    } as any);
    await moderation.approveVideoSubmission(ctx, "vs-1", user);
    expect(applyVideoSubmission).toHaveBeenCalledTimes(1);
    expect(applyVideoSubmission).toHaveBeenCalledWith(
      ctx.supabaseAdmin,
      "vs-1"
    );
  });

  it("skips applier on awaiting_second_approval (one Discord click of two)", async () => {
    const { applyVideoSubmission } =
      await import("../../admin/video-submission-applier.server");
    const ctx = makeCtx({}, {
      recordApproval: vi.fn().mockResolvedValue({
        success: true,
        newStatus: "awaiting_second_approval",
      }),
    } as any);
    await moderation.approveVideoSubmission(ctx, "vs-2", user);
    expect(applyVideoSubmission).not.toHaveBeenCalled();
  });

  it("returns warning ephemeral when the applier fails", async () => {
    const { applyVideoSubmission } =
      await import("../../admin/video-submission-applier.server");
    (applyVideoSubmission as any).mockResolvedValueOnce({
      success: false,
      error: "FK violation on player_id",
    });
    const ctx = makeCtx({}, {
      recordApproval: vi
        .fn()
        .mockResolvedValue({ success: true, newStatus: "approved" }),
    } as any);
    const body = await asJson(
      await moderation.approveVideoSubmission(ctx, "vs-3", user)
    );
    expect(body.data.flags).toBe(64);
    expect(body.data.content).toContain("apply failed");
    expect(body.data.content).toContain("FK violation");
  });

  it("does NOT call applyVideoSubmission on player approval", async () => {
    const { applyVideoSubmission } =
      await import("../../admin/video-submission-applier.server");
    const ctx = makeCtx({}, {
      recordApproval: vi
        .fn()
        .mockResolvedValue({ success: true, newStatus: "approved" }),
    } as any);
    await moderation.approvePlayerSubmission(ctx, "ps-1", user);
    expect(applyVideoSubmission).not.toHaveBeenCalled();
  });
});

// TT-117: parity hook for player_equipment_setup. Closes the last
// staging→canonical gap in the umbrella. The admin route used to
// bypass recordApproval entirely; sibling commits normalise it to
// recordApproval-then-apply, which uses the same handler the
// dispatch table calls on a 2× Discord click.
describe("approvePlayerEquipmentSetup — Discord apply hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls applyPlayerEquipmentSetup when status flips to approved", async () => {
    const { applyPlayerEquipmentSetup } =
      await import("../../admin/player-equipment-setup-applier.server");
    const ctx = makeCtx({}, {
      recordApproval: vi
        .fn()
        .mockResolvedValue({ success: true, newStatus: "approved" }),
    } as any);
    await moderation.approvePlayerEquipmentSetup(ctx, "ses-1", user);
    expect(applyPlayerEquipmentSetup).toHaveBeenCalledTimes(1);
    expect(applyPlayerEquipmentSetup).toHaveBeenCalledWith(
      ctx.supabaseAdmin,
      "ses-1"
    );
  });

  it("skips applier on awaiting_second_approval (one Discord click of two)", async () => {
    const { applyPlayerEquipmentSetup } =
      await import("../../admin/player-equipment-setup-applier.server");
    const ctx = makeCtx({}, {
      recordApproval: vi.fn().mockResolvedValue({
        success: true,
        newStatus: "awaiting_second_approval",
      }),
    } as any);
    await moderation.approvePlayerEquipmentSetup(ctx, "ses-2", user);
    expect(applyPlayerEquipmentSetup).not.toHaveBeenCalled();
  });

  it("returns warning ephemeral when the applier fails", async () => {
    const { applyPlayerEquipmentSetup } =
      await import("../../admin/player-equipment-setup-applier.server");
    (applyPlayerEquipmentSetup as any).mockResolvedValueOnce({
      success: false,
      error: "FK violation on blade_id",
    });
    const ctx = makeCtx({}, {
      recordApproval: vi
        .fn()
        .mockResolvedValue({ success: true, newStatus: "approved" }),
    } as any);
    const body = await asJson(
      await moderation.approvePlayerEquipmentSetup(ctx, "ses-3", user)
    );
    expect(body.data.flags).toBe(64);
    expect(body.data.content).toContain("apply failed");
    expect(body.data.content).toContain("FK violation");
  });

  it("does NOT call applyPlayerEquipmentSetup on video approval", async () => {
    const { applyPlayerEquipmentSetup } =
      await import("../../admin/player-equipment-setup-applier.server");
    const ctx = makeCtx({}, {
      recordApproval: vi
        .fn()
        .mockResolvedValue({ success: true, newStatus: "approved" }),
    } as any);
    await moderation.approveVideoSubmission(ctx, "vs-1", user);
    expect(applyPlayerEquipmentSetup).not.toHaveBeenCalled();
  });
});
