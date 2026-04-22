import type { AppLoadContext } from "react-router";
import {
  DatabaseService,
  type Equipment,
  type Player,
  type EquipmentReview,
  type PlayerEdit,
  type EquipmentSubmission,
  type PlayerSubmission,
} from "./database.server";
import {
  createModerationService,
  type ModerationService,
} from "./moderation.server";
import { createSupabaseAdminClient } from "./database.server";
import {
  createUnifiedDiscordNotifier,
  type UnifiedDiscordNotifier,
} from "./discord/unified-notifier.server";
import * as dispatch from "./discord/dispatch";
import * as messages from "./discord/messages";
import * as moderation from "./discord/moderation";
import * as notifications from "./discord/notifications";
import * as search from "./discord/search";
import type {
  DiscordContext,
  DiscordInteraction,
  DiscordMember,
  DiscordMessage,
  DiscordUser,
} from "./discord/types";
import type { SubmissionType } from "./types";

export class DiscordService {
  private dbService: DatabaseService;
  private moderationService: ModerationService;
  private env: Cloudflare.Env;
  private context: AppLoadContext;
  private unifiedNotifier: UnifiedDiscordNotifier;
  private ctx: DiscordContext;

  constructor(context: AppLoadContext) {
    this.context = context;
    // Use the same Supabase admin client for both services to ensure consistent database access
    const supabase = createSupabaseAdminClient(context);
    this.dbService = new DatabaseService(context, supabase);
    this.moderationService = createModerationService(supabase);
    this.env = context.cloudflare.env as Cloudflare.Env;
    this.unifiedNotifier = createUnifiedDiscordNotifier(context);
    this.ctx = {
      env: this.env,
      context: this.context,
      dbService: this.dbService,
      moderationService: this.moderationService,
      unifiedNotifier: this.unifiedNotifier,
    };
  }

  /**
   * Verify Discord webhook signature using Ed25519
   */
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

  private async handleEquipmentSearch(query: string): Promise<Response> {
    return search.handleEquipmentSearch(this.ctx, query);
  }

  private async handlePlayerSearch(query: string): Promise<Response> {
    return search.handlePlayerSearch(this.ctx, query);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async searchEquipment(query: string): Promise<any> {
    return search.searchEquipment(this.ctx, query);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async searchPlayer(query: string): Promise<any> {
    return search.searchPlayer(this.ctx, query);
  }

  private async handleApproveReview(
    reviewId: string,
    user: DiscordUser
  ): Promise<Response> {
    return moderation.approveReview(this.ctx, reviewId, user);
  }

  private async handleRejectReview(
    reviewId: string,
    user: DiscordUser
  ): Promise<Response> {
    return moderation.rejectReview(this.ctx, reviewId, user);
  }

  private async handleApprovePlayerEdit(
    editId: string,
    user: DiscordUser
  ): Promise<Response> {
    return moderation.approvePlayerEdit(this.ctx, editId, user);
  }

  private async handleRejectPlayerEdit(
    editId: string,
    user: DiscordUser
  ): Promise<Response> {
    return moderation.rejectPlayerEdit(this.ctx, editId, user);
  }

  private async handleApproveEquipmentSubmission(
    submissionId: string,
    user: DiscordUser
  ): Promise<Response> {
    return moderation.approveEquipmentSubmission(this.ctx, submissionId, user);
  }

  private async handleRejectEquipmentSubmission(
    submissionId: string,
    user: DiscordUser
  ): Promise<Response> {
    return moderation.rejectEquipmentSubmission(this.ctx, submissionId, user);
  }

  private async handleApprovePlayerSubmission(
    submissionId: string,
    user: DiscordUser
  ): Promise<Response> {
    return moderation.approvePlayerSubmission(this.ctx, submissionId, user);
  }

  private async handleRejectPlayerSubmission(
    submissionId: string,
    user: DiscordUser
  ): Promise<Response> {
    return moderation.rejectPlayerSubmission(this.ctx, submissionId, user);
  }

  private async handleApprovePlayerEquipmentSetup(
    submissionId: string,
    user: DiscordUser
  ): Promise<Response> {
    return moderation.approvePlayerEquipmentSetup(this.ctx, submissionId, user);
  }

  private async handleRejectPlayerEquipmentSetup(
    submissionId: string,
    user: DiscordUser
  ): Promise<Response> {
    return moderation.rejectPlayerEquipmentSetup(this.ctx, submissionId, user);
  }

  private async handleApproveVideoSubmission(
    submissionId: string,
    user: DiscordUser
  ): Promise<Response> {
    return moderation.approveVideoSubmission(this.ctx, submissionId, user);
  }

  private async handleRejectVideoSubmission(
    submissionId: string,
    user: DiscordUser
  ): Promise<Response> {
    return moderation.rejectVideoSubmission(this.ctx, submissionId, user);
  }

  private async checkUserPermissions(
    member: DiscordMember,
    guildId: string
  ): Promise<boolean> {
    return moderation.checkUserPermissions(this.ctx, member, guildId);
  }

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

  /**
   * Update Discord message with new button states and embed content
   */
  async updateDiscordMessage(
    channelId: string,
    messageId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: any
  ): Promise<{ success: boolean; error?: string }> {
    return messages.updateDiscordMessage(
      this.ctx,
      channelId,
      messageId,
      payload
    );
  }

  /**
   * Update Discord message after moderation action
   */
  private async updateDiscordMessageAfterModeration(
    submissionType: "equipment" | "player" | "player_edit" | "video",
    submissionId: string,
    newStatus: string,
    moderatorUsername: string
  ): Promise<void> {
    return messages.updateDiscordMessageAfterModeration(
      this.ctx,
      submissionType,
      submissionId,
      newStatus,
      moderatorUsername
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
}
