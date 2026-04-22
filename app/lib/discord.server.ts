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
import * as notifications from "./discord/notifications";
import * as search from "./discord/search";
import type { DiscordContext } from "./discord/types";
import type { SubmissionType } from "./types";

interface DiscordUser {
  id: string;
  username: string;
}

interface DiscordMember {
  roles: string[];
}

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

  /**
   * Handle review approval
   */
  private async handleApproveReview(
    reviewId: string,
    user: DiscordUser
  ): Promise<Response> {
    try {
      // Get or create Discord moderator
      const discordModeratorId =
        await this.moderationService.getOrCreateDiscordModerator(
          user.id,
          user.username
        );

      if (!discordModeratorId) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: Failed to create Discord moderator record`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const result = await this.moderationService.recordApproval(
        "review",
        reviewId,
        discordModeratorId,
        "discord",
        `Approved by ${user.username} via Discord`,
        true
      );

      if (result.success) {
        const statusText =
          result.newStatus === "approved"
            ? "fully approved and published"
            : "received first approval";

        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `✅ **Review ${statusText}**\nReview ${reviewId} approved by ${user.username}`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } else {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Approval failed**: ${result.error || "Unknown error"}`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    } catch (error) {
      console.error("Review approval error:", error);
      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: `❌ **Error**: Failed to approve review - ${error instanceof Error ? error.message : "Unknown error"}`,
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
   * Handle review rejection
   */
  private async handleRejectReview(
    reviewId: string,
    user: DiscordUser
  ): Promise<Response> {
    try {
      // Get or create Discord moderator
      const discordModeratorId =
        await this.moderationService.getOrCreateDiscordModerator(
          user.id,
          user.username
        );

      if (!discordModeratorId) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: Failed to create Discord moderator record`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      // For Discord rejections, use a generic rejection category and reason
      const result = await this.moderationService.recordRejection(
        "review",
        reviewId,
        discordModeratorId,
        "discord",
        {
          category: "other",
          reason: `Rejected by ${user.username} via Discord`,
        },
        this.env.R2_BUCKET,
        true
      );

      if (result.success) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Review rejected**\nReview ${reviewId} rejected by ${user.username}`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } else {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Rejection failed**: ${result.error || "Unknown error"}`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    } catch (error) {
      console.error("Review rejection error:", error);
      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: `❌ **Error**: Failed to reject review - ${error instanceof Error ? error.message : "Unknown error"}`,
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
   * Handle player edit approval
   */
  private async handleApprovePlayerEdit(
    editId: string,
    user: DiscordUser
  ): Promise<Response> {
    try {
      // Get or create Discord moderator
      const discordModeratorId =
        await this.moderationService.getOrCreateDiscordModerator(
          user.id,
          user.username
        );

      if (!discordModeratorId) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: Failed to create Discord moderator record`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const result = await this.moderationService.recordApproval(
        "player_edit",
        editId,
        discordModeratorId,
        "discord",
        undefined,
        true // isDiscordModerator
      );

      if (result.success) {
        // Update Discord message with new button states
        await this.updateDiscordMessageAfterModeration(
          "player_edit",
          editId,
          result.newStatus || "pending",
          user.username
        );

        let message = "Your approval has been recorded.";
        if (result.newStatus === "approved") {
          message =
            "Player edit has been fully approved and changes will be applied.";
        } else if (result.newStatus === "awaiting_second_approval") {
          message =
            "Player edit needs one more approval before changes are applied.";
        }

        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `✅ **Player Edit Approved by ${user.username}**\nPlayer edit ${editId}: ${message}`,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } else {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: ${result.error || "Failed to process approval"}`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    } catch (error) {
      console.error("Error handling approve player edit:", error);
      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: `❌ **Error**: Failed to process player edit approval`,
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
   * Handle player edit rejection
   */
  private async handleRejectPlayerEdit(
    editId: string,
    user: DiscordUser
  ): Promise<Response> {
    try {
      // Get or create Discord moderator
      const discordModeratorId =
        await this.moderationService.getOrCreateDiscordModerator(
          user.id,
          user.username
        );

      if (!discordModeratorId) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: Failed to create Discord moderator record`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      // For Discord rejections, use a generic rejection category and reason
      const result = await this.moderationService.recordRejection(
        "player_edit",
        editId,
        discordModeratorId,
        "discord",
        {
          category: "other",
          reason: `Rejected via Discord by ${user.username}`,
        },
        this.context.cloudflare?.env?.R2_BUCKET,
        true // isDiscordModerator
      );

      if (result.success) {
        // Update Discord message with disabled buttons
        await this.updateDiscordMessageAfterModeration(
          "player_edit",
          editId,
          "rejected",
          user.username
        );

        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Player Edit Rejected by ${user.username}**\nPlayer edit ${editId} has been rejected and changes will not be applied.`,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } else {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: ${result.error || "Failed to reject player edit"}`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    } catch (error) {
      console.error("Error handling reject player edit:", error);
      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: `❌ **Error**: Failed to process player edit rejection`,
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
   * Handle equipment submission approval
   */
  private async handleApproveEquipmentSubmission(
    submissionId: string,
    user: DiscordUser
  ): Promise<Response> {
    try {
      // Get or create Discord moderator
      const discordModeratorId =
        await this.moderationService.getOrCreateDiscordModerator(
          user.id,
          user.username
        );

      if (!discordModeratorId) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: Failed to create Discord moderator record`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const result = await this.moderationService.recordApproval(
        "equipment",
        submissionId,
        discordModeratorId,
        "discord",
        undefined,
        true // isDiscordModerator
      );

      if (result.success) {
        // Update Discord message with new button states
        await this.updateDiscordMessageAfterModeration(
          "equipment",
          submissionId,
          result.newStatus || "pending",
          user.username
        );

        let message = "Your approval has been recorded.";
        if (result.newStatus === "approved") {
          message =
            "Equipment submission has been fully approved and will be published.";
        } else if (result.newStatus === "awaiting_second_approval") {
          message =
            "Equipment submission needs one more approval before being published.";
        }

        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `✅ **Equipment Approved by ${user.username}**\nEquipment submission ${submissionId}: ${message}`,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } else {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: ${result.error || "Failed to process approval"}`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    } catch (error) {
      console.error("Error handling approve equipment submission:", error);
      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: `❌ **Error**: Failed to process equipment submission approval`,
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
   * Handle equipment submission rejection
   */
  private async handleRejectEquipmentSubmission(
    submissionId: string,
    user: DiscordUser
  ): Promise<Response> {
    try {
      // Get or create Discord moderator
      const discordModeratorId =
        await this.moderationService.getOrCreateDiscordModerator(
          user.id,
          user.username
        );

      if (!discordModeratorId) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: Failed to create Discord moderator record`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      // For Discord rejections, use a generic rejection category and reason
      const result = await this.moderationService.recordRejection(
        "equipment",
        submissionId,
        discordModeratorId,
        "discord",
        {
          category: "other",
          reason: `Rejected via Discord by ${user.username}`,
        },
        this.context.cloudflare?.env?.R2_BUCKET,
        true // isDiscordModerator
      );

      if (result.success) {
        // Update Discord message with disabled buttons
        await this.updateDiscordMessageAfterModeration(
          "equipment",
          submissionId,
          "rejected",
          user.username
        );

        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Equipment Rejected by ${user.username}**\nEquipment submission ${submissionId} has been rejected and will not be published.`,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } else {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: ${result.error || "Failed to reject equipment submission"}`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    } catch (error) {
      console.error("Error handling reject equipment submission:", error);
      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: `❌ **Error**: Failed to process equipment submission rejection`,
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
   * Handle player submission approval
   */
  private async handleApprovePlayerSubmission(
    submissionId: string,
    user: DiscordUser
  ): Promise<Response> {
    try {
      // Get or create Discord moderator
      const discordModeratorId =
        await this.moderationService.getOrCreateDiscordModerator(
          user.id,
          user.username
        );

      if (!discordModeratorId) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: Failed to create Discord moderator record`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const result = await this.moderationService.recordApproval(
        "player",
        submissionId,
        discordModeratorId,
        "discord",
        undefined,
        true // isDiscordModerator
      );

      if (result.success) {
        // Update Discord message with new button states
        await this.updateDiscordMessageAfterModeration(
          "player",
          submissionId,
          result.newStatus || "pending",
          user.username
        );

        let message = "Your approval has been recorded.";
        if (result.newStatus === "approved") {
          message =
            "Player submission has been fully approved and will be published.";
        } else if (result.newStatus === "awaiting_second_approval") {
          message =
            "Player submission needs one more approval before being published.";
        }

        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `✅ **Player Approved by ${user.username}**\nPlayer submission ${submissionId}: ${message}`,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } else {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: ${result.error || "Failed to process approval"}`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    } catch (error) {
      console.error("Error handling approve player submission:", error);
      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: `❌ **Error**: Failed to process player submission approval`,
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
   * Handle player submission rejection
   */
  private async handleRejectPlayerSubmission(
    submissionId: string,
    user: DiscordUser
  ): Promise<Response> {
    try {
      // Get or create Discord moderator
      const discordModeratorId =
        await this.moderationService.getOrCreateDiscordModerator(
          user.id,
          user.username
        );

      if (!discordModeratorId) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: Failed to create Discord moderator record`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      // For Discord rejections, use a generic rejection category and reason
      const result = await this.moderationService.recordRejection(
        "player",
        submissionId,
        discordModeratorId,
        "discord",
        {
          category: "other",
          reason: `Rejected via Discord by ${user.username}`,
        },
        this.context.cloudflare?.env?.R2_BUCKET,
        true // isDiscordModerator
      );

      if (result.success) {
        // Update Discord message with disabled buttons
        await this.updateDiscordMessageAfterModeration(
          "player",
          submissionId,
          "rejected",
          user.username
        );

        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Player Rejected by ${user.username}**\nPlayer submission ${submissionId} has been rejected and will not be published.`,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } else {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: ${result.error || "Failed to reject player submission"}`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    } catch (error) {
      console.error("Error handling reject player submission:", error);
      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: `❌ **Error**: Failed to process player submission rejection`,
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
   * Handle player equipment setup approval
   */
  private async handleApprovePlayerEquipmentSetup(
    submissionId: string,
    user: DiscordUser
  ): Promise<Response> {
    try {
      // Get or create Discord moderator
      const discordModeratorId =
        await this.moderationService.getOrCreateDiscordModerator(
          user.id,
          user.username
        );

      if (!discordModeratorId) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: Failed to create Discord moderator record`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const result = await this.moderationService.recordApproval(
        "player_equipment_setup",
        submissionId,
        discordModeratorId,
        "discord",
        undefined,
        true // isDiscordModerator
      );

      if (result.success) {
        let message = "Your approval has been recorded.";
        if (result.newStatus === "approved") {
          message =
            "Player equipment setup has been fully approved and will be published.";
        } else if (result.newStatus === "awaiting_second_approval") {
          message =
            "Player equipment setup needs one more approval before being published.";
        }

        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `✅ **Player Equipment Setup Approved by ${user.username}**\nSubmission ${submissionId}: ${message}`,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } else {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: ${result.error || "Failed to process approval"}`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    } catch (error) {
      console.error("Error handling approve player equipment setup:", error);
      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: `❌ **Error**: Failed to process player equipment setup approval`,
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
   * Handle player equipment setup rejection
   */
  private async handleRejectPlayerEquipmentSetup(
    submissionId: string,
    user: DiscordUser
  ): Promise<Response> {
    try {
      // Get or create Discord moderator
      const discordModeratorId =
        await this.moderationService.getOrCreateDiscordModerator(
          user.id,
          user.username
        );

      if (!discordModeratorId) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: Failed to create Discord moderator record`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      // For Discord rejections, use a generic rejection category and reason
      const result = await this.moderationService.recordRejection(
        "player_equipment_setup",
        submissionId,
        discordModeratorId,
        "discord",
        {
          category: "other",
          reason: `Rejected via Discord by ${user.username}`,
        },
        this.context.cloudflare?.env?.R2_BUCKET,
        true // isDiscordModerator
      );

      if (result.success) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Player Equipment Setup Rejected by ${user.username}**\nSubmission ${submissionId} has been rejected and will not be published.`,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } else {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: ${result.error || "Failed to reject player equipment setup"}`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    } catch (error) {
      console.error("Error handling reject player equipment setup:", error);
      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: `❌ **Error**: Failed to process player equipment setup rejection`,
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
   * Handle video submission approval
   */
  private async handleApproveVideoSubmission(
    submissionId: string,
    user: DiscordUser
  ): Promise<Response> {
    try {
      // Get or create Discord moderator
      const discordModeratorId =
        await this.moderationService.getOrCreateDiscordModerator(
          user.id,
          user.username
        );

      if (!discordModeratorId) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: Failed to create Discord moderator record`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const result = await this.moderationService.recordApproval(
        "video",
        submissionId,
        discordModeratorId,
        "discord",
        undefined,
        true // isDiscordModerator
      );

      if (result.success) {
        let message = "Your approval has been recorded.";
        if (result.newStatus === "approved") {
          message =
            "Video submission has been fully approved and will be published.";
        } else if (result.newStatus === "awaiting_second_approval") {
          message =
            "Video submission needs one more approval before being published.";
        }

        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `✅ **Video Approved by ${user.username}**\nSubmission ${submissionId}: ${message}`,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } else {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: ${result.error || "Failed to process approval"}`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    } catch (error) {
      console.error("Error handling approve video submission:", error);
      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: `❌ **Error**: Failed to process video submission approval`,
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
   * Handle video submission rejection
   */
  private async handleRejectVideoSubmission(
    submissionId: string,
    user: DiscordUser
  ): Promise<Response> {
    try {
      // Get or create Discord moderator
      const discordModeratorId =
        await this.moderationService.getOrCreateDiscordModerator(
          user.id,
          user.username
        );

      if (!discordModeratorId) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: Failed to create Discord moderator record`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      // For Discord rejections, use a generic rejection category and reason
      const result = await this.moderationService.recordRejection(
        "video",
        submissionId,
        discordModeratorId,
        "discord",
        {
          category: "other",
          reason: `Rejected via Discord by ${user.username}`,
        },
        this.context.cloudflare?.env?.R2_BUCKET,
        true // isDiscordModerator
      );

      if (result.success) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Video Rejected by ${user.username}**\nSubmission ${submissionId} has been rejected and will not be published.`,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } else {
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: ${result.error || "Failed to reject video submission"}`,
              flags: 64,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    } catch (error) {
      console.error("Error handling reject video submission:", error);
      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: `❌ **Error**: Failed to process video submission rejection`,
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
   * Check if user has required permissions
   */
  private async checkUserPermissions(
    member: DiscordMember,
    guildId: string
  ): Promise<boolean> {
    if (!member || !member.roles) return false;

    const allowedRoles = this.env.DISCORD_ALLOWED_ROLES?.split(",") || [];
    if (allowedRoles.length === 0) {
      // If no roles configured, allow all users
      return true;
    }

    return member.roles.some((roleId: string) => allowedRoles.includes(roleId));
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
