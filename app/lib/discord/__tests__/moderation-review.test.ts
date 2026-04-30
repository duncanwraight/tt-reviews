import { describe, it, expect, vi } from "vitest";
import * as moderation from "../moderation";
import type { DiscordContext, DiscordUser } from "../types";

/**
 * Full error-path matrix for review approve/reject. Reviews are the
 * only submission type whose rejection path uses env.R2_BUCKET (others
 * read context.cloudflare.env.R2_BUCKET) and whose moderation flow does
 * not run an applier on second approval — publishing happens inside
 * recordApproval. Cross-cutting smoke coverage for every approve/reject
 * pair lives in moderation.test.ts.
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
