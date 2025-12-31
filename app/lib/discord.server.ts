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
import { Logger, createLogContext, type LogContext } from "./logger.server";
import { createUnifiedDiscordNotifier, type UnifiedDiscordNotifier } from "./discord/unified-notifier.server";
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
  private logger = Logger;
  private unifiedNotifier: UnifiedDiscordNotifier;

  constructor(context: AppLoadContext) {
    this.context = context;
    // Use the same Supabase admin client for both services to ensure consistent database access
    const supabase = createSupabaseAdminClient(context);
    this.dbService = new DatabaseService(context, supabase);
    this.moderationService = createModerationService(supabase);
    this.env = context.cloudflare.env as Cloudflare.Env;
    this.unifiedNotifier = createUnifiedDiscordNotifier(context);
  }

  /**
   * Validate Discord bot configuration and environment
   */
  private validateBotConfig(logContext: LogContext): {
    isValid: boolean;
    botToken?: string;
    channelId?: string;
    issues: string[];
  } {
    const issues: string[] = [];
    let botToken: string | undefined;
    let channelId: string | undefined;

    // Check if bot token is configured
    if (!this.env.DISCORD_BOT_TOKEN) {
      issues.push("DISCORD_BOT_TOKEN environment variable not set");
    } else {
      botToken = this.env.DISCORD_BOT_TOKEN;

      // Check for placeholder values
      if (
        botToken.includes("your_actual_bot_token_here") ||
        botToken.includes("placeholder") ||
        botToken.length < 50
      ) {
        issues.push("DISCORD_BOT_TOKEN appears to be a placeholder value");
      }
    }

    // Check if channel ID is configured
    if (!this.env.DISCORD_CHANNEL_ID) {
      issues.push("DISCORD_CHANNEL_ID environment variable not set");
    } else {
      channelId = this.env.DISCORD_CHANNEL_ID;

      // Check for placeholder values
      if (
        channelId.includes("your_channel_id") ||
        channelId.includes("placeholder") ||
        channelId.length < 15
      ) {
        issues.push("DISCORD_CHANNEL_ID appears to be a placeholder value");
      }
    }

    // Check for other required environment variables
    if (!this.env.SITE_URL) {
      issues.push(
        "SITE_URL environment variable not set (needed for Discord embed links)"
      );
    }

    const isValid = issues.length === 0;

    if (!isValid) {
      this.logger.warn(
        "Discord bot configuration issues detected",
        logContext,
        {
          issues,
          hasBotToken: !!botToken,
          hasChannelId: !!channelId,
          hasSiteUrl: !!this.env.SITE_URL,
        }
      );
    }

    return { isValid, botToken, channelId, issues };
  }

  /**
   * Verify Discord webhook signature using Ed25519
   */
  async verifySignature(
    signature: string,
    timestamp: string,
    body: string
  ): Promise<boolean> {
    const PUBLIC_KEY = this.env.DISCORD_PUBLIC_KEY;
    if (!PUBLIC_KEY) {
      throw new Error("Discord verification key not configured");
    }

    // Check for placeholder values that indicate misconfiguration
    if (
      PUBLIC_KEY === "your_discord_application_public_key_here" ||
      PUBLIC_KEY.length < 32
    ) {
      throw new Error("Discord verification key is not properly configured");
    }

    try {
      // Use global TextEncoder and crypto available in Cloudflare Workers
      const encoder = new globalThis.TextEncoder();
      const data = encoder.encode(timestamp + body);
      const sig = hexToUint8Array(signature);

      // Import the public key
      // In Cloudflare Workers, crypto is available on globalThis
      const crypto = globalThis.crypto;
      const key = await crypto.subtle.importKey(
        "raw",
        hexToUint8Array(PUBLIC_KEY),
        {
          name: "Ed25519",
          namedCurve: "Ed25519",
        },
        false,
        ["verify"]
      );

      // Verify the signature
      return await crypto.subtle.verify("Ed25519", key, sig, data);
    } catch (error) {
      console.error("Signature verification error:", error);
      return false;
    }
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
      const submissionId = customId.replace("approve_player_equipment_setup_", "");
      return await this.handleApprovePlayerEquipmentSetup(submissionId, user);
    }

    if (customId.startsWith("reject_player_equipment_setup_")) {
      const submissionId = customId.replace("reject_player_equipment_setup_", "");
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

    if (customId.startsWith("approve_")) {
      const reviewId = customId.replace("approve_", "");
      return await this.handleApproveReview(reviewId, user);
    }

    if (customId.startsWith("reject_")) {
      const reviewId = customId.replace("reject_", "");
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

  /**
   * Handle equipment search slash command
   */
  private async handleEquipmentSearch(query: string): Promise<Response> {
    if (!query.trim()) {
      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content:
              "❌ Please provide a search query. Example: `/equipment query:butterfly`",
            flags: 64,
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const result = await this.searchEquipment(query);

    return new Response(
      JSON.stringify({
        type: 4,
        data: result,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  /**
   * Handle player search slash command
   */
  private async handlePlayerSearch(query: string): Promise<Response> {
    if (!query.trim()) {
      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content:
              "❌ Please provide a search query. Example: `/player query:messi`",
            flags: 64,
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const result = await this.searchPlayer(query);

    return new Response(
      JSON.stringify({
        type: 4,
        data: result,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  /**
   * Search equipment and format for Discord
   */
  private async searchEquipment(query: string): Promise<any> {
    try {
      const equipment = await this.dbService.searchEquipment(query);

      if (equipment.length === 0) {
        return {
          content: `🔍 No equipment found for "${query}"`,
        };
      }

      const results = equipment
        .slice(0, 5)
        .map(
          item =>
            `**${item.name}** by ${item.manufacturer}\n` +
            `Type: ${item.category}\n` +
            `${this.env.SITE_URL}/equipment/${item.slug}`
        )
        .join("\n\n");

      return {
        content:
          `🏓 **Equipment Search Results for "${query}"**\n\n${results}` +
          (equipment.length > 5
            ? `\n\n*Showing top 5 of ${equipment.length} results*`
            : ""),
      };
    } catch (error) {
      console.error("Equipment search error:", error);
      return {
        content: "❌ Error searching equipment. Please try again later.",
      };
    }
  }

  /**
   * Search players and format for Discord
   */
  private async searchPlayer(query: string): Promise<any> {
    try {
      const players = await this.dbService.searchPlayers(query);

      if (players.length === 0) {
        return {
          content: `🔍 No players found for "${query}"`,
        };
      }

      const results = players
        .slice(0, 5)
        .map(
          player =>
            `**${player.name}**\n` +
            `Status: ${player.active ? "Active" : "Inactive"}\n` +
            `${this.env.SITE_URL}/players/${player.slug}`
        )
        .join("\n\n");

      return {
        content:
          `🏓 **Player Search Results for "${query}"**\n\n${results}` +
          (players.length > 5
            ? `\n\n*Showing top 5 of ${players.length} results*`
            : ""),
      };
    } catch (error) {
      console.error("Player search error:", error);
      return {
        content: "❌ Error searching players. Please try again later.",
      };
    }
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
      const discordModeratorId = await this.moderationService.getOrCreateDiscordModerator(
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
        "equipment_review",
        reviewId,
        discordModeratorId,
        "discord",
        `Approved by ${user.username} via Discord`,
        true
      );

      if (result.success) {
        const statusText = result.newStatus === "approved" 
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
      const discordModeratorId = await this.moderationService.getOrCreateDiscordModerator(
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
        "equipment_review",
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
      const discordModeratorId = await this.moderationService.getOrCreateDiscordModerator(
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
      const discordModeratorId = await this.moderationService.getOrCreateDiscordModerator(
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
      const discordModeratorId = await this.moderationService.getOrCreateDiscordModerator(
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
      const discordModeratorId = await this.moderationService.getOrCreateDiscordModerator(
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
      const discordModeratorId = await this.moderationService.getOrCreateDiscordModerator(
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
      const discordModeratorId = await this.moderationService.getOrCreateDiscordModerator(
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
      const discordModeratorId = await this.moderationService.getOrCreateDiscordModerator(
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
      const discordModeratorId = await this.moderationService.getOrCreateDiscordModerator(
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

  /**
   * Send notification about new review submission
   */
  async notifyNewReview(
    reviewData: any,
    requestId: string = "unknown"
  ): Promise<any> {
    return this.unifiedNotifier.notifySubmission("review", reviewData, requestId);
  }

  /**
   * Send notification about new player edit submission
   */
  async notifyNewPlayerEdit(
    editData: any,
    requestId: string = "unknown"
  ): Promise<any> {
    return this.unifiedNotifier.notifySubmission("player_edit", editData, requestId);
  }

  /**
   * Send notification about new equipment submission
   */
  async notifyNewEquipmentSubmission(
    submissionData: any,
    requestId: string = "unknown"
  ): Promise<any> {
    return this.unifiedNotifier.notifySubmission("equipment", submissionData, requestId);
  }

  /**
   * Send notification about new player submission
   */
  async notifyNewPlayerSubmission(
    submissionData: any,
    requestId: string = "unknown"
  ): Promise<any> {
    return this.unifiedNotifier.notifySubmission("player", submissionData, requestId);
  }

  /**
   * Update Discord message with new button states and embed content
   */
  async updateDiscordMessage(
    channelId: string,
    messageId: string,
    payload: any
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate configuration
      const config = this.validateBotConfig(createLogContext("update-message"));
      if (!config.isValid) {
        return { success: false, error: "Discord bot not configured" };
      }

      const response = await globalThis.fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bot ${config.botToken}`,
            "User-Agent": "tt-reviews-bot/1.0",
          },
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        return { success: true };
      } else {
        const errorText = await response.text();
        return { success: false, error: `Discord API error: ${errorText}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Create initial buttons for new submissions with descriptive labels
   */
  private createInitialButtons(
    submissionType: "equipment" | "player" | "player_edit" | "video",
    submissionId: string
  ): any[] {
    // Create proper custom_id based on submission type
    let approveCustomId: string;
    let rejectCustomId: string;
    let approveLabel: string;
    let rejectLabel: string;
    
    if (submissionType === "player_edit") {
      approveCustomId = `approve_player_edit_${submissionId}`;
      rejectCustomId = `reject_player_edit_${submissionId}`;
      approveLabel = "Approve Player Edit";
      rejectLabel = "Reject Player Edit";
    } else if (submissionType === "equipment") {
      approveCustomId = `approve_${submissionType}_${submissionId}`;
      rejectCustomId = `reject_${submissionType}_${submissionId}`;
      approveLabel = "Approve Equipment";
      rejectLabel = "Reject Equipment";
    } else if (submissionType === "player") {
      approveCustomId = `approve_${submissionType}_${submissionId}`;
      rejectCustomId = `reject_${submissionType}_${submissionId}`;
      approveLabel = "Approve Player";
      rejectLabel = "Reject Player";
    } else if (submissionType === "video") {
      approveCustomId = `approve_${submissionType}_${submissionId}`;
      rejectCustomId = `reject_${submissionType}_${submissionId}`;
      approveLabel = "Approve Video";
      rejectLabel = "Reject Video";
    } else {
      approveCustomId = `approve_${submissionType}_${submissionId}`;
      rejectCustomId = `reject_${submissionType}_${submissionId}`;
      approveLabel = "Approve";
      rejectLabel = "Reject";
    }

    return [
      {
        type: 1, // Action Row
        components: [
          {
            type: 2, // Button
            style: 3, // Success/Green
            label: approveLabel,
            custom_id: approveCustomId,
          },
          {
            type: 2, // Button
            style: 4, // Danger/Red
            label: rejectLabel,
            custom_id: rejectCustomId,
          },
        ],
      },
    ];
  }

  /**
   * Create progress buttons based on current approval count
   */
  private createProgressButtons(
    submissionType: "equipment" | "player" | "player_edit" | "video",
    submissionId: string,
    currentApprovals: number,
    requiredApprovals: number = 2
  ): any[] {
    // Create proper custom_id based on submission type
    let approveCustomId: string;
    let rejectCustomId: string;
    
    if (submissionType === "player_edit") {
      approveCustomId = `approve_player_edit_${submissionId}`;
      rejectCustomId = `reject_player_edit_${submissionId}`;
    } else {
      approveCustomId = `approve_${submissionType}_${submissionId}`;
      rejectCustomId = `reject_${submissionType}_${submissionId}`;
    }

    return [
      {
        type: 1, // Action Row
        components: [
          {
            type: 2, // Button
            style: 3, // Success/Green
            label: `Approve (${currentApprovals}/${requiredApprovals})`,
            custom_id: approveCustomId,
          },
          {
            type: 2, // Button
            style: 4, // Danger/Red
            label: "Reject",
            custom_id: rejectCustomId,
          },
        ],
      },
    ];
  }

  /**
   * Create disabled buttons for final state
   */
  private createDisabledButtons(finalStatus: "approved" | "rejected"): any[] {
    return [
      {
        type: 1, // Action Row
        components: [
          {
            type: 2, // Button
            style: finalStatus === "approved" ? 3 : 2, // Green if approved, Gray if rejected
            label: finalStatus === "approved" ? "Approved" : "Approve",
            custom_id: "disabled_approve",
            disabled: true,
          },
          {
            type: 2, // Button
            style: finalStatus === "rejected" ? 4 : 2, // Red if rejected, Gray if approved
            label: finalStatus === "rejected" ? "Rejected" : "Reject",
            custom_id: "disabled_reject",
            disabled: true,
          },
        ],
      },
    ];
  }

  /**
   * Create updated embed with moderation status
   */
  private createUpdatedEmbed(
    originalEmbed: any,
    status: string,
    moderatorUsername?: string
  ): any {
    const updatedEmbed = { ...originalEmbed };
    
    // Add status field
    if (!updatedEmbed.fields) updatedEmbed.fields = [];
    
    // Remove existing status field if present
    updatedEmbed.fields = updatedEmbed.fields.filter(
      (field: any) => field.name !== "Status"
    );
    
    // Add new status field
    let statusValue = "";
    if (status === "approved") {
      statusValue = "✅ **Approved**";
      updatedEmbed.color = 0x2ecc71; // Green
    } else if (status === "rejected") {
      statusValue = "❌ **Rejected**";
      updatedEmbed.color = 0xe74c3c; // Red
    } else if (status === "awaiting_second_approval") {
      statusValue = "⏳ **Awaiting Second Approval** (1/2)";
      updatedEmbed.color = 0xf39c12; // Orange
    }

    if (moderatorUsername) {
      statusValue += `\nModerated by: ${moderatorUsername}`;
    }

    updatedEmbed.fields.push({
      name: "Status",
      value: statusValue,
      inline: false,
    });

    return updatedEmbed;
  }

  /**
   * Get current approval count for a submission
   */
  private async getApprovalCount(
    submissionType: "equipment" | "player" | "player_edit" | "video",
    submissionId: string
  ): Promise<number> {
    try {
      const approvals = await this.moderationService.getSubmissionApprovals(
        submissionType,
        submissionId
      );
      return approvals.filter((approval) => approval.action === "approved").length;
    } catch (error) {
      console.error("Error getting approval count:", error);
      return 0;
    }
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
    try {
      // Get Discord message ID from database
      const messageId = await this.dbService.getDiscordMessageId(
        submissionType,
        submissionId
      );

      if (!messageId) {
        // Skip message update for older submissions without Discord message tracking
        return;
      }

      // Get Discord channel ID from config
      const config = this.validateBotConfig(createLogContext("update-after-moderation"));
      if (!config.isValid || !config.channelId) {
        return;
      }

      // Determine components and embed based on status
      let components: any[];
      let updatedEmbed: any;

      if (newStatus === "approved" || newStatus === "rejected") {
        // Final state - disable all buttons
        components = this.createDisabledButtons(newStatus as "approved" | "rejected");
      } else if (newStatus === "awaiting_second_approval") {
        // Show progress (1/2 approvals)
        components = this.createProgressButtons(submissionType, submissionId, 1, 2);
      } else {
        // Default to first approval state
        components = this.createProgressButtons(submissionType, submissionId, 0, 2);
      }

      // For now, we'll update the embed minimally (just add status)
      // In a full implementation, you'd want to reconstruct the original embed
      updatedEmbed = {
        title: this.getEmbedTitle(submissionType),
        description: "Submission status updated",
        color: this.getStatusColor(newStatus),
        fields: [
          {
            name: "Status",
            value: this.getStatusText(newStatus, moderatorUsername),
            inline: false,
          },
        ],
        timestamp: new Date().toISOString(),
      };

      // Update the Discord message
      const updateResult = await this.updateDiscordMessage(config.channelId, messageId, {
        embeds: [updatedEmbed],
        components: components,
      });

      if (!updateResult.success) {
        console.error("Failed to update Discord message:", updateResult.error);
      }
    } catch (error) {
      console.error("Error updating Discord message after moderation:", error);
    }
  }

  private getEmbedTitle(submissionType: "equipment" | "player" | "player_edit" | "video"): string {
    switch (submissionType) {
      case "equipment":
        return "⚙️ Equipment Submission";
      case "player":
        return "👤 Player Submission";
      case "player_edit":
        return "🏓 Player Edit";
      case "video":
        return "🎥 Video Submission";
      default:
        return "📝 Submission";
    }
  }

  private getStatusColor(status: string): number {
    switch (status) {
      case "approved":
        return 0x2ecc71; // Green
      case "rejected":
        return 0xe74c3c; // Red
      case "awaiting_second_approval":
        return 0xf39c12; // Orange
      default:
        return 0x9b59b6; // Purple (default)
    }
  }

  private getStatusText(status: string, moderatorUsername: string): string {
    let statusText = "";
    switch (status) {
      case "approved":
        statusText = "✅ **Approved**";
        break;
      case "rejected":
        statusText = "❌ **Rejected**";
        break;
      case "awaiting_second_approval":
        statusText = "⏳ **Awaiting Second Approval** (1/2)";
        break;
      default:
        statusText = "⏳ **Pending Review**";
    }
    
    return `${statusText}\nModerated by: ${moderatorUsername}`;
  }

  /**
   * Send notification about approved review
   */
  async notifyReviewApproved(reviewData: any): Promise<any> {
    // TODO: Implement approved review notification
    return { success: true };
  }

  /**
   * Send notification about rejected review
   */
  async notifyReviewRejected(reviewData: any): Promise<any> {
    // TODO: Implement rejected review notification
    return { success: true };
  }

  /**
   * Send notification about new video submission
   */
  async notifyNewVideoSubmission(
    submissionData: any,
    requestId: string = "unknown"
  ): Promise<any> {
    return this.unifiedNotifier.notifySubmission("video", submissionData, requestId);
  }

  async notifyNewPlayerEquipmentSetup(
    equipmentData: any,
    requestId: string = "unknown"
  ): Promise<any> {
    return this.unifiedNotifier.notifySubmission("player_equipment_setup", equipmentData, requestId);
  }

  /**
   * Generic notification method for any submission type
   * Use this for new submission types or when you want to be explicit about the type
   */
  async notifySubmission(
    submissionType: SubmissionType,
    submissionData: any,
    requestId: string = "unknown"
  ): Promise<any> {
    return this.unifiedNotifier.notifySubmission(submissionType, submissionData, requestId);
  }

}

/**
 * Convert hex string to Uint8Array
 */
function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}
