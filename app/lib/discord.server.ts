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
import { Logger, createLogContext } from "./logger.server";

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

  constructor(context: AppLoadContext) {
    this.context = context;
    this.dbService = new DatabaseService(context);
    const supabase = createSupabaseAdminClient(context);
    this.moderationService = createModerationService(supabase);
    this.env = context.cloudflare.env as Cloudflare.Env;
    
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
          data.options?.[0]?.value,
          user
        );
      case "reject":
        return await this.handleRejectReview(
          data.options?.[0]?.value,
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
   * Handle review approval - placeholder for now
   */
  private async handleApproveReview(
    reviewId: string,
    user: DiscordUser
  ): Promise<Response> {
    // TODO: Implement moderation service for reviews
    return new Response(
      JSON.stringify({
        type: 4,
        data: {
          content: `✅ **Review approval functionality not yet implemented**\nReview ${reviewId} - this will be implemented when the moderation service is ported.`,
          flags: 64,
        },
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  /**
   * Handle review rejection - placeholder for now
   */
  private async handleRejectReview(
    reviewId: string,
    user: DiscordUser
  ): Promise<Response> {
    // TODO: Implement moderation service for reviews
    return new Response(
      JSON.stringify({
        type: 4,
        data: {
          content: `❌ **Review rejection functionality not yet implemented**\nReview ${reviewId} - this will be implemented when the moderation service is ported.`,
          flags: 64,
        },
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
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
    const logContext = createLogContext(requestId, {
      operation: "discord_bot",
      submissionType: "review",
      submissionId: reviewData.id,
    });

    return this.logger.timeOperation(
      "discord_bot_review",
      async () => {
        this.logger.info(
          "Sending Discord bot message for review submission",
          logContext,
          {
            reviewId: reviewData.id,
            equipmentName: reviewData.equipment_name,
          }
        );

        // Validate configuration
        const config = this.validateBotConfig(logContext);
        if (!config.isValid) {
          const error = new Error(
            `Discord bot configuration invalid: ${config.issues.join(", ")}`
          );
          this.logger.error(
            "Discord bot configuration validation failed",
            logContext,
            error,
            {
              issues: config.issues,
              reviewId: reviewData.id,
            }
          );
          throw error;
        }

        const embed = {
          title: "🆕 New Review Submitted",
          description: `A new review has been submitted and needs moderation.`,
          color: 0x3498db,
          fields: [
            {
              name: "Equipment",
              value: reviewData.equipment_name || "Unknown",
              inline: true,
            },
            {
              name: "Rating",
              value: `${reviewData.overall_rating}/10`,
              inline: true,
            },
            {
              name: "Reviewer",
              value: reviewData.reviewer_name || "Anonymous",
              inline: true,
            },
          ],
          timestamp: new Date().toISOString(),
        };

        const components = [
          {
            type: 1, // Action Row
            components: [
              {
                type: 2, // Button
                style: 3, // Success/Green
                label: "Approve",
                custom_id: `approve_${reviewData.id}`,
              },
              {
                type: 2, // Button
                style: 4, // Danger/Red
                label: "Reject",
                custom_id: `reject_${reviewData.id}`,
              },
            ],
          },
        ];

        const payload = {
          embeds: [embed],
          components,
        };

        const payloadSize = JSON.stringify(payload).length;

        // Send bot message request
        try {
          const response = await globalThis.fetch(
            `https://discord.com/api/v10/channels/${config.channelId}/messages`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bot ${config.botToken}`,
                "User-Agent": "tt-reviews-bot/1.0",
              },
              body: JSON.stringify(payload),
            }
          );

          const responseText = await response.text();
          const success = response.ok;

          this.logger.info("Review notification result", {
            reviewId: reviewData.id,
            equipmentName: reviewData.equipment_name,
            success,
            status: response.status,
            requestId,
          });

          return { success, status: response.status, response: responseText };
        } catch (error) {
          this.logger.error(
            "Discord bot API network error",
            logContext,
            error as Error,
            {
              reviewId: reviewData.id,
            }
          );

          this.logger.metric("discord_bot_network_error", 1, logContext, {
            submissionType: "review",
          });

          throw error;
        }
      },
      logContext
    );
  }

  /**
   * Send notification about new player edit submission
   */
  async notifyNewPlayerEdit(
    editData: any,
    requestId: string = "unknown"
  ): Promise<any> {
    const logContext = createLogContext(requestId, {
      operation: "discord_bot",
      submissionType: "player_edit",
      submissionId: editData.id,
    });

    return this.logger.timeOperation(
      "discord_bot_player_edit",
      async () => {
        this.logger.info(
          "Sending Discord bot message for player edit",
          logContext,
          {
            editId: editData.id,
            playerName: editData.player_name,
          }
        );

        // Validate configuration
        const config = this.validateBotConfig(logContext);
        if (!config.isValid) {
          const error = new Error(
            `Discord bot configuration invalid: ${config.issues.join(", ")}`
          );
          this.logger.error(
            "Discord bot configuration validation failed",
            logContext,
            error,
            {
              issues: config.issues,
              editId: editData.id,
            }
          );
          throw error;
        }

        // Create a summary of the changes
        const changes = [];
        if (editData.edit_data.name)
          changes.push(`Name: ${editData.edit_data.name}`);
        if (editData.edit_data.highest_rating)
          changes.push(`Rating: ${editData.edit_data.highest_rating}`);
        if (editData.edit_data.active_years)
          changes.push(`Active: ${editData.edit_data.active_years}`);
        if (editData.edit_data.active !== undefined)
          changes.push(
            `Status: ${editData.edit_data.active ? "Active" : "Inactive"}`
          );

        const embed = {
          title: "🏓 Player Edit Submitted",
          description: `A player information update has been submitted and needs moderation.`,
          color: 0xe67e22, // Orange color to distinguish from reviews
          fields: [
            {
              name: "Player",
              value: editData.player_name || "Unknown Player",
              inline: true,
            },
            {
              name: "Submitted by",
              value: editData.submitter_email || "Anonymous",
              inline: true,
            },
            {
              name: "Changes",
              value:
                changes.length > 0
                  ? changes.join("\n")
                  : "No changes specified",
              inline: false,
            },
          ],
          timestamp: new Date().toISOString(),
        };

        const components = this.createProgressButtons("player_edit", editData.id, 0, 2);

        const payload = {
          embeds: [embed],
          components,
        };

        const payloadSize = JSON.stringify(payload).length;

        // Send bot message request
        try {
          const response = await globalThis.fetch(
            `https://discord.com/api/v10/channels/${config.channelId}/messages`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bot ${config.botToken}`,
                "User-Agent": "tt-reviews-bot/1.0",
              },
              body: JSON.stringify(payload),
            }
          );

          const responseText = await response.text();
          const success = response.ok;

          let messageId: string | null = null;
          if (success) {
            try {
              const discordResponse = JSON.parse(responseText);
              messageId = discordResponse.id;
              
              // Store message ID in database for later editing
              if (messageId) {
                await this.dbService.updatePlayerEditDiscordMessageId(
                  editData.id,
                  messageId
                );
              }
            } catch (error) {
              this.logger.warn("Failed to parse Discord response or store message ID", logContext, {
                editId: editData.id,
                error: error instanceof Error ? error.message : "Unknown error"
              });
            }
          }

          this.logger.info("Player edit notification result", {
            editId: editData.id,
            playerName: editData.player_name,
            success,
            status: response.status,
            messageId,
            requestId,
          });

          return { success, status: response.status, response: responseText, messageId };
        } catch (error) {
          this.logger.error(
            "Discord bot API network error",
            logContext,
            error as Error,
            {
              editId: editData.id,
            }
          );

          this.logger.metric("discord_bot_network_error", 1, logContext, {
            submissionType: "player_edit",
          });

          throw error;
        }
      },
      logContext
    );
  }

  /**
   * Send notification about new equipment submission
   */
  async notifyNewEquipmentSubmission(
    submissionData: any,
    requestId: string = "unknown"
  ): Promise<any> {
    const logContext = createLogContext(requestId, {
      operation: "discord_bot",
      submissionType: "equipment",
      submissionId: submissionData.id,
    });

    return this.logger.timeOperation(
      "discord_bot_equipment_submission",
      async () => {
        this.logger.info(
          "Sending Discord bot message for equipment submission",
          logContext,
          {
            submissionId: submissionData.id,
            equipmentName: submissionData.name,
          }
        );

        // Validate configuration
        const config = this.validateBotConfig(logContext);
        if (!config.isValid) {
          const error = new Error(
            `Discord bot configuration invalid: ${config.issues.join(", ")}`
          );
          this.logger.error(
            "Discord bot configuration validation failed",
            logContext,
            error,
            {
              issues: config.issues,
              submissionId: submissionData.id,
            }
          );
          throw error;
        }

        const embed = {
          title: "⚙️ Equipment Submission",
          description: `A new equipment submission has been received and needs moderation.`,
          color: 0x9b59b6, // Purple color to distinguish from reviews and player edits
          fields: [
            {
              name: "Equipment Name",
              value: submissionData.name || "Unknown Equipment",
              inline: true,
            },
            {
              name: "Manufacturer",
              value: submissionData.manufacturer || "Unknown",
              inline: true,
            },
            {
              name: "Category",
              value: submissionData.category
                ? submissionData.category.charAt(0).toUpperCase() +
                  submissionData.category.slice(1)
                : "Unknown",
              inline: true,
            },
            {
              name: "Subcategory",
              value: submissionData.subcategory || "N/A",
              inline: true,
            },
            {
              name: "Submitted by",
              value: submissionData.submitter_email || "Anonymous",
              inline: true,
            },
          ],
          timestamp: new Date().toISOString(),
        };

        const components = this.createProgressButtons("equipment", submissionData.id, 0, 2);

        const payload = {
          embeds: [embed],
          components,
        };

        const payloadSize = JSON.stringify(payload).length;

        // Send bot message request
        try {
          const response = await globalThis.fetch(
            `https://discord.com/api/v10/channels/${config.channelId}/messages`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bot ${config.botToken}`,
                "User-Agent": "tt-reviews-bot/1.0",
              },
              body: JSON.stringify(payload),
            }
          );

          const responseText = await response.text();
          const success = response.ok;

          let messageId: string | null = null;
          if (success) {
            try {
              const discordResponse = JSON.parse(responseText);
              messageId = discordResponse.id;
              
              // Store message ID in database for later editing
              if (messageId) {
                await this.dbService.updateEquipmentSubmissionDiscordMessageId(
                  submissionData.id,
                  messageId
                );
              }
            } catch (error) {
              this.logger.warn("Failed to parse Discord response or store message ID", logContext, {
                submissionId: submissionData.id,
                error: error instanceof Error ? error.message : "Unknown error"
              });
            }
          }

          this.logger.info("Equipment submission notification result", {
            submissionId: submissionData.id,
            equipmentName: submissionData.name,
            success,
            status: response.status,
            messageId,
            requestId,
          });

          return { success, status: response.status, response: responseText, messageId };
        } catch (error) {
          this.logger.error(
            "Discord bot API network error",
            logContext,
            error as Error,
            {
              submissionId: submissionData.id,
            }
          );

          this.logger.metric("discord_bot_network_error", 1, logContext, {
            submissionType: "equipment",
          });

          throw error;
        }
      },
      logContext
    );
  }

  /**
   * Send notification about new player submission
   */
  async notifyNewPlayerSubmission(
    submissionData: any,
    requestId: string = "unknown"
  ): Promise<any> {
    const logContext = createLogContext(requestId, {
      operation: "discord_bot",
      submissionType: "player",
      submissionId: submissionData.id,
    });

    return this.logger.timeOperation(
      "discord_bot_player_submission",
      async () => {
        this.logger.info(
          "Sending Discord bot message for player submission",
          logContext,
          {
            submissionId: submissionData.id,
            playerName: submissionData.name,
          }
        );

        // Validate configuration
        const config = this.validateBotConfig(logContext);
        if (!config.isValid) {
          const error = new Error(
            `Discord bot configuration invalid: ${config.issues.join(", ")}`
          );
          this.logger.error(
            "Discord bot configuration validation failed",
            logContext,
            error,
            {
              issues: config.issues,
              submissionId: submissionData.id,
            }
          );
          throw error;
        }

        const embed = {
          title: "👤 Player Submission",
          description: `A new player submission has been received and needs moderation.`,
          color: 0x2ecc71, // Green color to distinguish from equipment and edits
          fields: [
            {
              name: "Player Name",
              value: submissionData.name || "Unknown Player",
              inline: true,
            },
            {
              name: "Highest Rating",
              value: submissionData.highest_rating || "N/A",
              inline: true,
            },
            {
              name: "Playing Style",
              value: submissionData.playing_style
                ? submissionData.playing_style
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (l: string) => l.toUpperCase())
                : "N/A",
              inline: true,
            },
            {
              name: "Represents",
              value: submissionData.represents || "N/A",
              inline: true,
            },
            {
              name: "Active Years",
              value: submissionData.active_years || "N/A",
              inline: true,
            },
            {
              name: "Submitted by",
              value: submissionData.submitter_email || "Anonymous",
              inline: true,
            },
          ],
          timestamp: new Date().toISOString(),
        };

        const components = this.createProgressButtons("player", submissionData.id, 0, 2);

        const payload = {
          embeds: [embed],
          components,
        };

        const payloadSize = JSON.stringify(payload).length;

        // Send bot message request
        try {
          const response = await globalThis.fetch(
            `https://discord.com/api/v10/channels/${config.channelId}/messages`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bot ${config.botToken}`,
                "User-Agent": "tt-reviews-bot/1.0",
              },
              body: JSON.stringify(payload),
            }
          );

          const responseText = await response.text();
          const success = response.ok;

          let messageId: string | null = null;
          if (success) {
            try {
              const discordResponse = JSON.parse(responseText);
              messageId = discordResponse.id;
              
              // Store message ID in database for later editing
              if (messageId) {
                await this.dbService.updatePlayerSubmissionDiscordMessageId(
                  submissionData.id,
                  messageId
                );
              }
            } catch (error) {
              this.logger.warn("Failed to parse Discord response or store message ID", logContext, {
                submissionId: submissionData.id,
                error: error instanceof Error ? error.message : "Unknown error"
              });
            }
          }

          this.logger.info("Player submission notification result", {
            submissionId: submissionData.id,
            playerName: submissionData.name,
            success,
            status: response.status,
            messageId,
            requestId,
          });

          return { success, status: response.status, response: responseText, messageId };
        } catch (error) {
          this.logger.error(
            "Discord bot API network error",
            logContext,
            error as Error,
            {
              submissionId: submissionData.id,
            }
          );

          this.logger.metric("discord_bot_network_error", 1, logContext, {
            submissionType: "player",
          });

          throw error;
        }
      },
      logContext
    );
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
   * Create progress buttons based on current approval count
   */
  private createProgressButtons(
    submissionType: "equipment" | "player" | "player_edit",
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
    submissionType: "equipment" | "player" | "player_edit",
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
    submissionType: "equipment" | "player" | "player_edit",
    submissionId: string,
    newStatus: string,
    moderatorUsername: string
  ): Promise<void> {
    try {
      console.log(`Updating Discord message for ${submissionType} ${submissionId} with status ${newStatus}`);
      
      // Get Discord message ID from database
      const messageId = await this.dbService.getDiscordMessageId(
        submissionType,
        submissionId
      );

      if (!messageId) {
        console.warn(`No Discord message ID found for ${submissionType} ${submissionId}`);
        return;
      }

      console.log(`Found Discord message ID: ${messageId}`);

      // Get Discord channel ID from config
      const config = this.validateBotConfig(createLogContext("update-after-moderation"));
      if (!config.isValid || !config.channelId) {
        console.warn("Discord configuration not valid for message editing");
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
      console.log(`Updating Discord message ${messageId} in channel ${config.channelId}`);
      const updateResult = await this.updateDiscordMessage(config.channelId, messageId, {
        embeds: [updatedEmbed],
        components: components,
      });

      if (updateResult.success) {
        console.log(`Successfully updated Discord message ${messageId}`);
      } else {
        console.error("Failed to update Discord message:", updateResult.error);
      }
    } catch (error) {
      console.error("Error updating Discord message after moderation:", error);
    }
  }

  private getEmbedTitle(submissionType: "equipment" | "player" | "player_edit"): string {
    switch (submissionType) {
      case "equipment":
        return "⚙️ Equipment Submission";
      case "player":
        return "👤 Player Submission";
      case "player_edit":
        return "🏓 Player Edit";
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
