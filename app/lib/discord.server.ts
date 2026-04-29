import type { AppLoadContext } from "react-router";
import { DatabaseService, createSupabaseAdminClient } from "./database.server";
import { createModerationService } from "./moderation.server";
import { createUnifiedDiscordNotifier } from "./discord/unified-notifier.server";
import * as dispatch from "./discord/dispatch";
import * as messages from "./discord/messages";
import * as notifications from "./discord/notifications";
import type {
  DiscordContext,
  DiscordInteraction,
  DiscordMessage,
} from "./discord/types";
import type { SubmissionType } from "./types";

/**
 * Thin facade over the app/lib/discord/* submodules — preserves the
 * public API used by the api.discord.* webhook routes and submission
 * flows. New code should prefer calling the submodule functions
 * directly with a DiscordContext (see types.ts); this class exists so
 * existing call sites can keep constructing a single DiscordService.
 */
export class DiscordService {
  private ctx: DiscordContext;

  constructor(context: AppLoadContext) {
    // Use the same Supabase admin client for both services to ensure
    // consistent database access.
    const supabase = createSupabaseAdminClient(context);
    const env = context.cloudflare.env as Cloudflare.Env;
    this.ctx = {
      env,
      context,
      supabaseAdmin: supabase,
      dbService: new DatabaseService(context, supabase),
      moderationService: createModerationService(supabase),
      unifiedNotifier: createUnifiedDiscordNotifier(context),
    };
  }

  // ---------- Inbound routing ----------

  async verifySignature(
    signature: string,
    timestamp: string,
    body: string
  ): Promise<boolean> {
    return messages.verifySignature(this.ctx, signature, timestamp, body);
  }

  async handleSlashCommand(interaction: DiscordInteraction): Promise<Response> {
    return dispatch.handleSlashCommand(this.ctx, interaction);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async handlePrefixCommand(message: DiscordMessage): Promise<any> {
    return dispatch.handlePrefixCommand(this.ctx, message);
  }

  async handleMessageComponent(
    interaction: DiscordInteraction
  ): Promise<Response> {
    return dispatch.handleMessageComponent(this.ctx, interaction);
  }

  // ---------- Outbound notifications ----------

  async notifyNewReview(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reviewData: any,
    requestId: string = "unknown"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return notifications.notifyNewReview(this.ctx, reviewData, requestId);
  }

  async notifyNewPlayerEdit(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editData: any,
    requestId: string = "unknown"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return notifications.notifyNewPlayerEdit(this.ctx, editData, requestId);
  }

  async notifyNewEquipmentSubmission(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    submissionData: any,
    requestId: string = "unknown"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return notifications.notifyNewEquipmentSubmission(
      this.ctx,
      submissionData,
      requestId
    );
  }

  async notifyNewPlayerSubmission(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    submissionData: any,
    requestId: string = "unknown"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return notifications.notifyNewPlayerSubmission(
      this.ctx,
      submissionData,
      requestId
    );
  }

  async notifyNewVideoSubmission(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    submissionData: any,
    requestId: string = "unknown"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return notifications.notifyNewVideoSubmission(
      this.ctx,
      submissionData,
      requestId
    );
  }

  async notifyNewPlayerEquipmentSetup(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    equipmentData: any,
    requestId: string = "unknown"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return notifications.notifyNewPlayerEquipmentSetup(
      this.ctx,
      equipmentData,
      requestId
    );
  }

  async notifySubmission(
    submissionType: SubmissionType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    submissionData: any,
    requestId: string = "unknown"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return notifications.notifySubmission(
      this.ctx,
      submissionType,
      submissionData,
      requestId
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async notifyReviewApproved(reviewData: any): Promise<any> {
    return notifications.notifyReviewApproved(this.ctx, reviewData);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async notifyReviewRejected(reviewData: any): Promise<any> {
    return notifications.notifyReviewRejected(this.ctx, reviewData);
  }
}
