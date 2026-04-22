import { describe, it, expect, vi, beforeEach } from "vitest";
import * as notifications from "../notifications";
import type { DiscordContext } from "../types";
import type { SubmissionType } from "../../types";

/**
 * Unit tests for notification delegates — each notifyNew* should pass
 * through to unifiedNotifier.notifySubmission with the correct
 * submissionType arg. notifyReviewApproved/Rejected are currently
 * no-ops; we pin that behaviour so future wiring is a deliberate change.
 */

function makeCtx(): {
  ctx: DiscordContext;
  notifySubmission: ReturnType<typeof vi.fn>;
} {
  const notifySubmission = vi
    .fn()
    .mockResolvedValue({ success: true, messageId: "m-1" });
  return {
    notifySubmission,
    ctx: {
       
      env: {} as any,
       
      context: {} as any,
       
      dbService: {} as any,
       
      moderationService: {} as any,
      unifiedNotifier: {
        notifySubmission,
         
      } as any,
    },
  };
}

describe("notifications.notifyNewReview", () => {
  it("delegates to unifiedNotifier with 'review' type and passes data + requestId", async () => {
    const { ctx, notifySubmission } = makeCtx();
    await notifications.notifyNewReview(
      ctx,
      { id: "r1", text: "x" },
      "req-1"
    );
    expect(notifySubmission).toHaveBeenCalledWith(
      "review",
      { id: "r1", text: "x" },
      "req-1"
    );
  });

  it("defaults requestId to 'unknown'", async () => {
    const { ctx, notifySubmission } = makeCtx();
    await notifications.notifyNewReview(ctx, { id: "r1" });
    expect(notifySubmission).toHaveBeenCalledWith(
      "review",
      { id: "r1" },
      "unknown"
    );
  });
});

describe("notifications.notify* type mapping", () => {
  const cases: Array<
    [
      string,
      (
        ctx: DiscordContext,
         
        data: any,
        requestId?: string
         
      ) => Promise<any>,
      SubmissionType,
    ]
  > = [
    ["notifyNewPlayerEdit", notifications.notifyNewPlayerEdit, "player_edit"],
    [
      "notifyNewEquipmentSubmission",
      notifications.notifyNewEquipmentSubmission,
      "equipment",
    ],
    [
      "notifyNewPlayerSubmission",
      notifications.notifyNewPlayerSubmission,
      "player",
    ],
    [
      "notifyNewVideoSubmission",
      notifications.notifyNewVideoSubmission,
      "video",
    ],
    [
      "notifyNewPlayerEquipmentSetup",
      notifications.notifyNewPlayerEquipmentSetup,
      "player_equipment_setup",
    ],
  ];

  it.each(cases)(
    "%s passes the correct submissionType to unifiedNotifier",
    async (_name, fn, expectedType) => {
      const { ctx, notifySubmission } = makeCtx();
      await fn(ctx, { id: "x" }, "r-1");
      expect(notifySubmission).toHaveBeenCalledWith(
        expectedType,
        { id: "x" },
        "r-1"
      );
    }
  );
});

describe("notifications.notifySubmission (generic)", () => {
  it("forwards the supplied submission type", async () => {
    const { ctx, notifySubmission } = makeCtx();
    await notifications.notifySubmission(ctx, "video", { id: "v1" }, "r-1");
    expect(notifySubmission).toHaveBeenCalledWith(
      "video",
      { id: "v1" },
      "r-1"
    );
  });
});

describe("notifications.notifyReviewApproved / Rejected (stubs)", () => {
  it("notifyReviewApproved returns success without side effects", async () => {
    const { ctx, notifySubmission } = makeCtx();
    const result = await notifications.notifyReviewApproved(ctx, { id: "r1" });
    expect(result).toEqual({ success: true });
    expect(notifySubmission).not.toHaveBeenCalled();
  });

  it("notifyReviewRejected returns success without side effects", async () => {
    const { ctx, notifySubmission } = makeCtx();
    const result = await notifications.notifyReviewRejected(ctx, { id: "r1" });
    expect(result).toEqual({ success: true });
    expect(notifySubmission).not.toHaveBeenCalled();
  });
});
