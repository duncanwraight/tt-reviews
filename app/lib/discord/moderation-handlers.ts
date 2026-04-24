import type { SubmissionType } from "../submissions/registry";

/**
 * Per-submission-type configuration for the Discord approve/reject
 * engine in moderation.ts. One entry captures the variations across
 * what used to be six near-identical approve/reject pairs:
 *
 *   - `responseKind`        review returns ephemeral on success; others
 *                           return visible. Pinned by moderation.test.ts.
 *   - `hasTrackedMessage`   review + player_equipment_setup + video
 *                           don't call messages.updateDiscordMessage…
 *                           (reviews are slash-command; the other two
 *                           have no tracked message_id column).
 *   - `r2Source`            rejectReview reads ctx.env.R2_BUCKET; every
 *                           other reject path reads
 *                           ctx.context.cloudflare?.env?.R2_BUCKET.
 *                           Pinned by moderation.test.ts:198.
 *   - `approval.note`       review-only — 5th arg to recordApproval.
 *
 * buildSuccess / buildFallback / buildCatchMessage preserve the exact
 * user-visible strings the test suite asserts on; do not merge text
 * across types without updating the matching tests.
 */

export type ResponseKind = "ephemeral" | "visible";
export type R2Source = "env" | "cloudflareEnv";

export interface ApprovalConfig {
  note?: (username: string) => string;
  buildSuccess: (args: {
    id: string;
    username: string;
    newStatus: string;
  }) => string;
  buildFallback: (err: string | undefined) => string;
  logMessage: string;
  buildCatchMessage: (error: unknown) => string;
  includeSubmissionIdInLog: boolean;
}

export interface RejectionConfig {
  reason: (username: string) => string;
  buildSuccess: (args: { id: string; username: string }) => string;
  buildFallback: (err: string | undefined) => string;
  logMessage: string;
  buildCatchMessage: (error: unknown) => string;
  includeSubmissionIdInLog: boolean;
}

export interface HandlerConfig {
  responseKind: ResponseKind;
  hasTrackedMessage: boolean;
  r2Source: R2Source;
  approval: ApprovalConfig;
  rejection: RejectionConfig;
}

export const MODERATION_HANDLERS: Record<SubmissionType, HandlerConfig> = {
  review: {
    responseKind: "ephemeral",
    hasTrackedMessage: false,
    r2Source: "env",
    approval: {
      note: username => `Approved by ${username} via Discord`,
      buildSuccess: ({ id, username, newStatus }) => {
        const statusText =
          newStatus === "approved"
            ? "fully approved and published"
            : "received first approval";
        return `✅ **Review ${statusText}**\nReview ${id} approved by ${username}`;
      },
      buildFallback: err => `❌ **Approval failed**: ${err || "Unknown error"}`,
      logMessage: "Review approval error",
      buildCatchMessage: error =>
        `❌ **Error**: Failed to approve review - ${error instanceof Error ? error.message : "Unknown error"}`,
      includeSubmissionIdInLog: true,
    },
    rejection: {
      reason: username => `Rejected by ${username} via Discord`,
      buildSuccess: ({ id, username }) =>
        `❌ **Review rejected**\nReview ${id} rejected by ${username}`,
      buildFallback: err =>
        `❌ **Rejection failed**: ${err || "Unknown error"}`,
      logMessage: "Review rejection error",
      buildCatchMessage: error =>
        `❌ **Error**: Failed to reject review - ${error instanceof Error ? error.message : "Unknown error"}`,
      includeSubmissionIdInLog: true,
    },
  },

  player_edit: {
    responseKind: "visible",
    hasTrackedMessage: true,
    r2Source: "cloudflareEnv",
    approval: {
      buildSuccess: ({ id, username, newStatus }) => {
        let message = "Your approval has been recorded.";
        if (newStatus === "approved") {
          message =
            "Player edit has been fully approved and changes will be applied.";
        } else if (newStatus === "awaiting_second_approval") {
          message =
            "Player edit needs one more approval before changes are applied.";
        }
        return `✅ **Player Edit Approved by ${username}**\nPlayer edit ${id}: ${message}`;
      },
      buildFallback: err =>
        `❌ **Error**: ${err || "Failed to process approval"}`,
      logMessage: "Error handling approve player edit",
      buildCatchMessage: () =>
        `❌ **Error**: Failed to process player edit approval`,
      includeSubmissionIdInLog: false,
    },
    rejection: {
      reason: username => `Rejected via Discord by ${username}`,
      buildSuccess: ({ id, username }) =>
        `❌ **Player Edit Rejected by ${username}**\nPlayer edit ${id} has been rejected and changes will not be applied.`,
      buildFallback: err =>
        `❌ **Error**: ${err || "Failed to reject player edit"}`,
      logMessage: "Error handling reject player edit",
      buildCatchMessage: () =>
        `❌ **Error**: Failed to process player edit rejection`,
      includeSubmissionIdInLog: false,
    },
  },

  equipment: {
    responseKind: "visible",
    hasTrackedMessage: true,
    r2Source: "cloudflareEnv",
    approval: {
      buildSuccess: ({ id, username, newStatus }) => {
        let message = "Your approval has been recorded.";
        if (newStatus === "approved") {
          message =
            "Equipment submission has been fully approved and will be published.";
        } else if (newStatus === "awaiting_second_approval") {
          message =
            "Equipment submission needs one more approval before being published.";
        }
        return `✅ **Equipment Approved by ${username}**\nEquipment submission ${id}: ${message}`;
      },
      buildFallback: err =>
        `❌ **Error**: ${err || "Failed to process approval"}`,
      logMessage: "Error handling approve equipment submission",
      buildCatchMessage: () =>
        `❌ **Error**: Failed to process equipment submission approval`,
      includeSubmissionIdInLog: false,
    },
    rejection: {
      reason: username => `Rejected via Discord by ${username}`,
      buildSuccess: ({ id, username }) =>
        `❌ **Equipment Rejected by ${username}**\nEquipment submission ${id} has been rejected and will not be published.`,
      buildFallback: err =>
        `❌ **Error**: ${err || "Failed to reject equipment submission"}`,
      logMessage: "Error handling reject equipment submission",
      buildCatchMessage: () =>
        `❌ **Error**: Failed to process equipment submission rejection`,
      includeSubmissionIdInLog: false,
    },
  },

  player: {
    responseKind: "visible",
    hasTrackedMessage: true,
    r2Source: "cloudflareEnv",
    approval: {
      buildSuccess: ({ id, username, newStatus }) => {
        let message = "Your approval has been recorded.";
        if (newStatus === "approved") {
          message =
            "Player submission has been fully approved and will be published.";
        } else if (newStatus === "awaiting_second_approval") {
          message =
            "Player submission needs one more approval before being published.";
        }
        return `✅ **Player Approved by ${username}**\nPlayer submission ${id}: ${message}`;
      },
      buildFallback: err =>
        `❌ **Error**: ${err || "Failed to process approval"}`,
      logMessage: "Error handling approve player submission",
      buildCatchMessage: () =>
        `❌ **Error**: Failed to process player submission approval`,
      includeSubmissionIdInLog: false,
    },
    rejection: {
      reason: username => `Rejected via Discord by ${username}`,
      buildSuccess: ({ id, username }) =>
        `❌ **Player Rejected by ${username}**\nPlayer submission ${id} has been rejected and will not be published.`,
      buildFallback: err =>
        `❌ **Error**: ${err || "Failed to reject player submission"}`,
      logMessage: "Error handling reject player submission",
      buildCatchMessage: () =>
        `❌ **Error**: Failed to process player submission rejection`,
      includeSubmissionIdInLog: false,
    },
  },

  player_equipment_setup: {
    responseKind: "visible",
    hasTrackedMessage: false,
    r2Source: "cloudflareEnv",
    approval: {
      buildSuccess: ({ id, username, newStatus }) => {
        let message = "Your approval has been recorded.";
        if (newStatus === "approved") {
          message =
            "Player equipment setup has been fully approved and will be published.";
        } else if (newStatus === "awaiting_second_approval") {
          message =
            "Player equipment setup needs one more approval before being published.";
        }
        return `✅ **Player Equipment Setup Approved by ${username}**\nSubmission ${id}: ${message}`;
      },
      buildFallback: err =>
        `❌ **Error**: ${err || "Failed to process approval"}`,
      logMessage: "Error handling approve player equipment setup",
      buildCatchMessage: () =>
        `❌ **Error**: Failed to process player equipment setup approval`,
      includeSubmissionIdInLog: false,
    },
    rejection: {
      reason: username => `Rejected via Discord by ${username}`,
      buildSuccess: ({ id, username }) =>
        `❌ **Player Equipment Setup Rejected by ${username}**\nSubmission ${id} has been rejected and will not be published.`,
      buildFallback: err =>
        `❌ **Error**: ${err || "Failed to reject player equipment setup"}`,
      logMessage: "Error handling reject player equipment setup",
      buildCatchMessage: () =>
        `❌ **Error**: Failed to process player equipment setup rejection`,
      includeSubmissionIdInLog: false,
    },
  },

  video: {
    responseKind: "visible",
    hasTrackedMessage: false,
    r2Source: "cloudflareEnv",
    approval: {
      buildSuccess: ({ id, username, newStatus }) => {
        let message = "Your approval has been recorded.";
        if (newStatus === "approved") {
          message =
            "Video submission has been fully approved and will be published.";
        } else if (newStatus === "awaiting_second_approval") {
          message =
            "Video submission needs one more approval before being published.";
        }
        return `✅ **Video Approved by ${username}**\nSubmission ${id}: ${message}`;
      },
      buildFallback: err =>
        `❌ **Error**: ${err || "Failed to process approval"}`,
      logMessage: "Error handling approve video submission",
      buildCatchMessage: () =>
        `❌ **Error**: Failed to process video submission approval`,
      includeSubmissionIdInLog: false,
    },
    rejection: {
      reason: username => `Rejected via Discord by ${username}`,
      buildSuccess: ({ id, username }) =>
        `❌ **Video Rejected by ${username}**\nSubmission ${id} has been rejected and will not be published.`,
      buildFallback: err =>
        `❌ **Error**: ${err || "Failed to reject video submission"}`,
      logMessage: "Error handling reject video submission",
      buildCatchMessage: () =>
        `❌ **Error**: Failed to process video submission rejection`,
      includeSubmissionIdInLog: false,
    },
  },
};
