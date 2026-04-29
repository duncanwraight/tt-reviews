import { describe, it, expect, vi, beforeEach } from "vitest";
import * as moderation from "../moderation";
import * as messages from "../messages";
import type { DiscordContext, DiscordUser } from "../types";

/**
 * Unit tests for moderation handlers — approve/reject × 6 submission types,
 * plus checkUserPermissions. approveReview / rejectReview get the full
 * error-path matrix; other handlers are smoke-tested for correct
 * submissionType routing and (where applicable) message-edit side effects.
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

describe("moderation.checkUserPermissions", () => {
  it("rejects when member is missing", async () => {
    const result = await moderation.checkUserPermissions(
      makeCtx(),
      null as any,
      "g"
    );
    expect(result).toBe(false);
  });

  it("rejects when member.roles is missing", async () => {
    const result = await moderation.checkUserPermissions(
      makeCtx(),
      {} as any,
      "g"
    );
    expect(result).toBe(false);
  });

  it("allows any user when DISCORD_ALLOWED_ROLES is not configured", async () => {
    const result = await moderation.checkUserPermissions(
      makeCtx({ DISCORD_ALLOWED_ROLES: undefined }),
      { roles: ["whatever"] },
      "g"
    );
    expect(result).toBe(true);
  });

  it("allows user whose role matches an allowed role", async () => {
    const result = await moderation.checkUserPermissions(
      makeCtx({ DISCORD_ALLOWED_ROLES: "r1,r2,r3" }),
      { roles: ["unrelated", "r2"] },
      "g"
    );
    expect(result).toBe(true);
  });

  it("rejects user with no matching role", async () => {
    const result = await moderation.checkUserPermissions(
      makeCtx({ DISCORD_ALLOWED_ROLES: "r1,r2" }),
      { roles: ["other"] },
      "g"
    );
    expect(result).toBe(false);
  });

  describe("e2e test role auto-allow in development", () => {
    // Mirrors the verifySignature dev auto-injection so Playwright
    // Discord click specs pass checkUserPermissions locally without
    // each dev appending role_e2e_moderator to DISCORD_ALLOWED_ROLES.
    it("allows the e2e test role when ENVIRONMENT=development and role not listed", async () => {
      const result = await moderation.checkUserPermissions(
        makeCtx({
          ENVIRONMENT: "development",
          DISCORD_ALLOWED_ROLES: "real-role-only",
        }),
        { roles: [moderation.E2E_TEST_ROLE_ID] },
        "g"
      );
      expect(result).toBe(true);
    });

    it.each([
      ["production", "production"],
      ["preview", "preview"],
      ["unset", undefined],
    ])(
      "does NOT auto-allow the e2e test role when ENVIRONMENT is %s",
      async (_label, env) => {
        const result = await moderation.checkUserPermissions(
          makeCtx({
            ENVIRONMENT: env,
            DISCORD_ALLOWED_ROLES: "real-role-only",
          }),
          { roles: [moderation.E2E_TEST_ROLE_ID] },
          "g"
        );
        expect(result).toBe(false);
      }
    );
  });
});

// ============================================================
// Review — full error-path coverage
// ============================================================
describe("moderation.approveReview — full flow", () => {
  it("returns ephemeral error when moderator creation fails", async () => {
    const ctx = makeCtx({}, {
      getOrCreateDiscordModerator: vi.fn().mockResolvedValue(null),
    } as any);
    const response = await moderation.approveReview(ctx, "rev-1", user);
    const body = await asJson(response);
    expect(body.type).toBe(4);
    expect(body.data.flags).toBe(64);
    expect(body.data.content).toContain("Failed to create Discord moderator");
  });

  it("passes 'review' and review id through to moderationService.recordApproval", async () => {
    const ctx = makeCtx();
    await moderation.approveReview(ctx, "rev-id", user);
    expect(ctx.moderationService.recordApproval).toHaveBeenCalledWith(
      "review",
      "rev-id",
      "mod-row-id",
      "discord",
      expect.stringContaining("modname"),
      true
    );
  });

  it("reports 'fully approved and published' when status is approved", async () => {
    const ctx = makeCtx({}, {
      recordApproval: vi
        .fn()
        .mockResolvedValue({ success: true, newStatus: "approved" }),
    } as any);
    const body = await asJson(await moderation.approveReview(ctx, "r", user));
    expect(body.data.content).toContain("fully approved and published");
  });

  it("reports 'received first approval' when status is not approved", async () => {
    const ctx = makeCtx({}, {
      recordApproval: vi.fn().mockResolvedValue({
        success: true,
        newStatus: "awaiting_second_approval",
      }),
    } as any);
    const body = await asJson(await moderation.approveReview(ctx, "r", user));
    expect(body.data.content).toContain("received first approval");
  });

  it("surfaces the recordApproval error message on failure", async () => {
    const ctx = makeCtx({}, {
      recordApproval: vi
        .fn()
        .mockResolvedValue({ success: false, error: "RLS denied" }),
    } as any);
    const body = await asJson(await moderation.approveReview(ctx, "r", user));
    expect(body.data.content).toContain("RLS denied");
  });

  it("catches thrown exceptions and returns an ephemeral error", async () => {
    const ctx = makeCtx({}, {
      recordApproval: vi.fn().mockRejectedValue(new Error("boom")),
    } as any);
    const body = await asJson(await moderation.approveReview(ctx, "r", user));
    expect(body.data.content).toContain("Failed to approve review");
    expect(body.data.content).toContain("boom");
  });
});

describe("moderation.rejectReview", () => {
  it("passes env.R2_BUCKET into recordRejection (review is the only path using env.R2_BUCKET, others use context.cloudflare.env.R2_BUCKET)", async () => {
    const ctx = makeCtx({
      R2_BUCKET: "bucket-from-env" as any,
    });
    await moderation.rejectReview(ctx, "rev-id", user);
    expect(ctx.moderationService.recordRejection).toHaveBeenCalledWith(
      "review",
      "rev-id",
      "mod-row-id",
      "discord",
      expect.objectContaining({ category: "other" }),
      "bucket-from-env",
      true
    );
  });

  it("returns success content on successful rejection", async () => {
    const body = await asJson(
      await moderation.rejectReview(makeCtx(), "r1", user)
    );
    expect(body.data.content).toContain("Review rejected");
  });

  it("catches thrown errors", async () => {
    const ctx = makeCtx({}, {
      recordRejection: vi.fn().mockRejectedValue(new Error("nope")),
    } as any);
    const body = await asJson(await moderation.rejectReview(ctx, "r", user));
    expect(body.data.content).toContain("Failed to reject review");
  });
});

// ============================================================
// Smoke tests — every other approve/reject pair
// ============================================================
describe("moderation approve/reject smoke tests", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    // Spy on messages.updateDiscordMessageAfterModeration so handlers
    // that call it don't try to hit Discord.
    vi.spyOn(messages, "updateDiscordMessageAfterModeration").mockResolvedValue(
      undefined
    );
    // restoreAllMocks() resets the module-level vi.mock() return values
    // back to whatever the underlying vi.fn() returns (undefined). Re-pin
    // every dispatch-table applier to a successful result so the smoke
    // tests that drive approval flows past the apply hook still hit the
    // message-refresh path.
    const { applyEquipmentEdit } =
      await import("../../admin/equipment-edit-applier.server");
    const { applyPlayerEdit } =
      await import("../../admin/player-edit-applier.server");
    const { applyEquipmentSubmission } =
      await import("../../admin/equipment-submission-applier.server");
    (applyEquipmentEdit as any).mockResolvedValue({ success: true });
    (applyPlayerEdit as any).mockResolvedValue({ success: true });
    (applyEquipmentSubmission as any).mockResolvedValue({ success: true });
  });

  const cases: Array<{
    name: string;
    fn: (
      ctx: DiscordContext,
      id: string,
      user: DiscordUser
    ) => Promise<Response>;
    expectedType: string;
    isApproval: boolean;
    updatesMessage: boolean;
  }> = [
    {
      name: "approvePlayerEdit",
      fn: moderation.approvePlayerEdit,
      expectedType: "player_edit",
      isApproval: true,
      updatesMessage: true,
    },
    {
      name: "rejectPlayerEdit",
      fn: moderation.rejectPlayerEdit,
      expectedType: "player_edit",
      isApproval: false,
      updatesMessage: true,
    },
    {
      name: "approveEquipmentSubmission",
      fn: moderation.approveEquipmentSubmission,
      expectedType: "equipment",
      isApproval: true,
      updatesMessage: true,
    },
    {
      name: "rejectEquipmentSubmission",
      fn: moderation.rejectEquipmentSubmission,
      expectedType: "equipment",
      isApproval: false,
      updatesMessage: true,
    },
    {
      name: "approvePlayerSubmission",
      fn: moderation.approvePlayerSubmission,
      expectedType: "player",
      isApproval: true,
      updatesMessage: true,
    },
    {
      name: "rejectPlayerSubmission",
      fn: moderation.rejectPlayerSubmission,
      expectedType: "player",
      isApproval: false,
      updatesMessage: true,
    },
    {
      name: "approvePlayerEquipmentSetup",
      fn: moderation.approvePlayerEquipmentSetup,
      expectedType: "player_equipment_setup",
      isApproval: true,
      updatesMessage: false,
    },
    {
      name: "rejectPlayerEquipmentSetup",
      fn: moderation.rejectPlayerEquipmentSetup,
      expectedType: "player_equipment_setup",
      isApproval: false,
      updatesMessage: false,
    },
    {
      name: "approveVideoSubmission",
      fn: moderation.approveVideoSubmission,
      expectedType: "video",
      isApproval: true,
      updatesMessage: false,
    },
    {
      name: "rejectVideoSubmission",
      fn: moderation.rejectVideoSubmission,
      expectedType: "video",
      isApproval: false,
      updatesMessage: false,
    },
  ];

  for (const tc of cases) {
    it(`${tc.name}: passes '${tc.expectedType}' to the moderation service`, async () => {
      const ctx = makeCtx();
      await tc.fn(ctx, "the-id", user);
      const call = tc.isApproval ? "recordApproval" : "recordRejection";
      // Arg count differs between recordApproval (6) and recordRejection (7),
      // so assert the first two positional args (type + id) and the
      // isDiscordModerator flag at the end — those are the ones routing
      // regressions would break.
      const spy = ctx.moderationService[call] as unknown as ReturnType<
        typeof vi.fn
      >;
      expect(spy).toHaveBeenCalledTimes(1);
      const callArgs = spy.mock.calls[0];
      expect(callArgs[0]).toBe(tc.expectedType);
      expect(callArgs[1]).toBe("the-id");
      expect(callArgs[callArgs.length - 1]).toBe(true);
    });

    it(`${tc.name}: returns ephemeral error when moderator creation fails`, async () => {
      const ctx = makeCtx({}, {
        getOrCreateDiscordModerator: vi.fn().mockResolvedValue(null),
      } as any);
      const body = await asJson(await tc.fn(ctx, "x", user));
      expect(body.data.flags).toBe(64);
      expect(body.data.content).toContain("Failed to create Discord moderator");
    });

    if (tc.updatesMessage) {
      it(`${tc.name}: triggers Discord message refresh on success`, async () => {
        const ctx = makeCtx();
        await tc.fn(ctx, "the-id", user);
        expect(
          messages.updateDiscordMessageAfterModeration
        ).toHaveBeenCalledTimes(1);
      });
    }

    it(`${tc.name}: returns env-mismatch ephemeral when submission not found`, async () => {
      const notFoundResult = { success: false, notFound: true, error: "gone" };
      const serviceKey = tc.isApproval ? "recordApproval" : "recordRejection";
      const ctx = makeCtx({}, {
        [serviceKey]: vi.fn().mockResolvedValue(notFoundResult),
      } as any);
      const response = await tc.fn(ctx, "missing-id", user);
      const body = await asJson(response);
      expect(body.data.flags).toBe(64); // ephemeral
      expect(body.data.content).toContain("Submission not found");
      expect(body.data.content).toContain("different environment");
      // Handler must not refresh the Discord message when the submission
      // does not exist — there is no message to refresh.
      expect(
        messages.updateDiscordMessageAfterModeration
      ).not.toHaveBeenCalled();
    });
  }
});

// ============================================================
// Missing-submission path at the service boundary
// ============================================================
describe("moderation handlers — service returns notFound", () => {
  it("approveReview: returns env-mismatch ephemeral, skips success path", async () => {
    const ctx = makeCtx({}, {
      recordApproval: vi
        .fn()
        .mockResolvedValue({ success: false, notFound: true }),
    } as any);
    const body = await asJson(
      await moderation.approveReview(ctx, "nope", user)
    );
    expect(body.data.flags).toBe(64);
    expect(body.data.content).toContain("Submission not found");
    expect(body.data.content).toContain("different environment");
    expect(body.data.content).not.toContain("fully approved");
    expect(body.data.content).not.toContain("received first approval");
  });

  it("rejectReview: returns env-mismatch ephemeral, skips success path", async () => {
    const ctx = makeCtx({}, {
      recordRejection: vi
        .fn()
        .mockResolvedValue({ success: false, notFound: true }),
    } as any);
    const body = await asJson(await moderation.rejectReview(ctx, "nope", user));
    expect(body.data.flags).toBe(64);
    expect(body.data.content).toContain("Submission not found");
    expect(body.data.content).not.toContain("Review rejected");
  });
});

// ============================================================
// TT-106: Discord-driven approval applies the equipment_edit when
// the second approval flips status to "approved". Without this hook
// the trigger would mark the row approved but the equipment table
// would never receive the diff.
// ============================================================

vi.mock("../../admin/equipment-edit-applier.server", () => ({
  applyEquipmentEdit: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("../../admin/player-edit-applier.server", () => ({
  applyPlayerEdit: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("../../admin/equipment-submission-applier.server", () => ({
  applyEquipmentSubmission: vi.fn().mockResolvedValue({ success: true }),
}));

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

// ============================================================
// TT-113: parity hook for player_edit. Same shape as the
// equipment_edit suite above — when the second Discord approval
// flips status to "approved", the dispatch table must run
// applyPlayerEdit so the players row receives the diff.
// ============================================================

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

// ============================================================
// TT-114: parity hook for equipment (new submission). Same shape
// as the equipment_edit + player_edit suites — the second Discord
// approval flips status to "approved" and the dispatch table runs
// applyEquipmentSubmission so the canonical equipment row gets
// created.
// ============================================================

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
