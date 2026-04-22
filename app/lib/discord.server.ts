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
import * as messages from "./discord/messages";
import * as moderation from "./discord/moderation";
import * as notifications from "./discord/notifications";
import * as search from "./discord/search";
import type {
  DiscordContext,
  DiscordMember,
  DiscordUser,
} from "./discord/types";
import type { SubmissionType } from "./types";

interface DiscordInteraction {
  type: number;
  data: {
    name: string;
    custom_id?: string;
    options?: Array<{ value: string }>;
  };
  user?: DiscordUser;
  member: DiscordMember & { user?: DiscordUser };
  guild_id: string;
}

interface DiscordMessage {
  content: string;
  member: DiscordMember;
  guild_id: string;
}

interface ModerationResult {
  success: boolean;
  status: "first_approval" | "fully_approved" | "already_approved" | "error";
  message: string;
}

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

  /**
   * Handle Discord slash commands
   */
  async handleSlashCommand(interaction: DiscordInteraction): Promise<Response> {
    // Handle ping challenge first (before checking permissions or data)
    if (interaction.type === 1) {
      return new Response(JSON.stringify({ type: 1 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data } = interaction;
    const commandName = data.name;

    // Get user from either interaction.user or interaction.member.user
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = interaction.user || (interaction.member as any)?.user;

    if (!user && (commandName === "approve" || commandName === "reject")) {
      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: "❌ **Error**: Unable to identify user from interaction.",
            flags: 64, // Ephemeral flag
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Check user permissions
    const hasPermission = await this.checkUserPermissions(
      interaction.member,
      interaction.guild_id
    );
    if (!hasPermission) {
      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: "❌ You do not have permission to use this command.",
            flags: 64, // Ephemeral flag
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    switch (commandName) {
      case "equipment":
        return await this.handleEquipmentSearch(data.options?.[0]?.value || "");
      case "player":
        return await this.handlePlayerSearch(data.options?.[0]?.value || "");
      case "approve":
        return await this.handleApproveReview(
          data.options?.[0]?.value || "",
          user
        );
      case "reject":
        return await this.handleRejectReview(
          data.options?.[0]?.value || "",
          user
        );
      default:
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: "❌ Unknown command.",
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
    }
  }

  /**
   * Handle Discord prefix commands (!command)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async handlePrefixCommand(message: DiscordMessage): Promise<any> {
    const content = message.content.trim();

    // Check user permissions
    const hasPermission = await this.checkUserPermissions(
      message.member,
      message.guild_id
    );
    if (!hasPermission) {
      return {
        content: "❌ You do not have permission to use this command.",
      };
    }

    if (content.startsWith("!equipment ")) {
      const query = content.slice(11).trim();
      return await this.searchEquipment(query);
    }

    if (content.startsWith("!player ")) {
      const query = content.slice(8).trim();
      return await this.searchPlayer(query);
    }

    return null;
  }

  /**
   * Handle message components (buttons, select menus)
   */
  async handleMessageComponent(
    interaction: DiscordInteraction
  ): Promise<Response> {
    // Check user permissions first
    const hasPermission = await this.checkUserPermissions(
      interaction.member,
      interaction.guild_id
    );
    if (!hasPermission) {
      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: "❌ You do not have permission to use this command.",
            flags: 64, // Ephemeral flag
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const customId = interaction.data.custom_id!;

    // Get user from either interaction.user or interaction.member.user
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = interaction.user || (interaction.member as any)?.user;

    if (!user) {
      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: "❌ **Error**: Unable to identify user from interaction.",
            flags: 64, // Ephemeral flag
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (customId.startsWith("approve_player_edit_")) {
      const editId = customId.replace("approve_player_edit_", "");
      return await this.handleApprovePlayerEdit(editId, user);
    }

    if (customId.startsWith("reject_player_edit_")) {
      const editId = customId.replace("reject_player_edit_", "");
      return await this.handleRejectPlayerEdit(editId, user);
    }

    if (customId.startsWith("approve_equipment_")) {
      const submissionId = customId.replace("approve_equipment_", "");
      return await this.handleApproveEquipmentSubmission(submissionId, user);
    }

    if (customId.startsWith("reject_equipment_")) {
      const submissionId = customId.replace("reject_equipment_", "");
      return await this.handleRejectEquipmentSubmission(submissionId, user);
    }

    // Handle player_equipment_setup BEFORE player_ to avoid prefix collision
    if (customId.startsWith("approve_player_equipment_setup_")) {
      const submissionId = customId.replace(
        "approve_player_equipment_setup_",
        ""
      );
      return await this.handleApprovePlayerEquipmentSetup(submissionId, user);
    }

    if (customId.startsWith("reject_player_equipment_setup_")) {
      const submissionId = customId.replace(
        "reject_player_equipment_setup_",
        ""
      );
      return await this.handleRejectPlayerEquipmentSetup(submissionId, user);
    }

    if (customId.startsWith("approve_player_")) {
      const submissionId = customId.replace("approve_player_", "");
      return await this.handleApprovePlayerSubmission(submissionId, user);
    }

    if (customId.startsWith("reject_player_")) {
      const submissionId = customId.replace("reject_player_", "");
      return await this.handleRejectPlayerSubmission(submissionId, user);
    }

    // Handle video submissions
    if (customId.startsWith("approve_video_")) {
      const submissionId = customId.replace("approve_video_", "");
      return await this.handleApproveVideoSubmission(submissionId, user);
    }

    if (customId.startsWith("reject_video_")) {
      const submissionId = customId.replace("reject_video_", "");
      return await this.handleRejectVideoSubmission(submissionId, user);
    }

    // Handle review submissions (must be explicit, not catch-all)
    if (customId.startsWith("approve_review_")) {
      const reviewId = customId.replace("approve_review_", "");
      return await this.handleApproveReview(reviewId, user);
    }

    if (customId.startsWith("reject_review_")) {
      const reviewId = customId.replace("reject_review_", "");
      return await this.handleRejectReview(reviewId, user);
    }

    return new Response(
      JSON.stringify({
        type: 4,
        data: {
          content: "❌ Unknown interaction.",
          flags: 64,
        },
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
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
