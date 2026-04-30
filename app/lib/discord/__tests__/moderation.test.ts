import { describe, it, expect, vi, beforeEach } from "vitest";
import * as moderation from "../moderation";
import * as messages from "../messages";
import type { DiscordContext, DiscordUser } from "../types";

/**
 * Cross-cutting moderation tests: permissions matrix + the
 * approve/reject smoke grid for every submission type.
 *
 * - Per-type Discord apply-hook coverage: see
 *   moderation-apply-hooks-edits.test.ts and
 *   moderation-apply-hooks-submissions.test.ts.
 * - Full review error-path matrix: see moderation-review.test.ts.
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

// The smoke-grid beforeEach dynamically imports every applier to
// re-pin success values after restoreAllMocks(); each module needs a
// vi.mock() declaration so the imports resolve to mockable functions.
vi.mock("../../admin/equipment-edit-applier.server", () => ({
  applyEquipmentEdit: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("../../admin/player-edit-applier.server", () => ({
  applyPlayerEdit: vi.fn().mockResolvedValue({ success: true }),
}));
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
    const { applyPlayerSubmission } =
      await import("../../admin/player-submission-applier.server");
    const { applyVideoSubmission } =
      await import("../../admin/video-submission-applier.server");
    const { applyPlayerEquipmentSetup } =
      await import("../../admin/player-equipment-setup-applier.server");
    (applyEquipmentEdit as any).mockResolvedValue({ success: true });
    (applyPlayerEdit as any).mockResolvedValue({ success: true });
    (applyEquipmentSubmission as any).mockResolvedValue({ success: true });
    (applyPlayerSubmission as any).mockResolvedValue({ success: true });
    (applyVideoSubmission as any).mockResolvedValue({ success: true });
    (applyPlayerEquipmentSetup as any).mockResolvedValue({ success: true });
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
