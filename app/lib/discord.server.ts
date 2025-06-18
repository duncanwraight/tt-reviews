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
  user: DiscordUser;
  member: DiscordMember;
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
  private logger = Logger.child({ service: "discord" });

  constructor(context: AppLoadContext) {
    this.context = context;
    this.dbService = new DatabaseService(context);
    const supabase = createSupabaseAdminClient(context);
    this.moderationService = createModerationService(supabase);
    this.env = context.cloudflare.env as Cloudflare.Env;
    
    // Log environment configuration for debugging (without sensitive values)
    try {
      console.log(`[DISCORD] Service initialized with config:`, {
        hasWebhookUrl: !!this.env.DISCORD_WEBHOOK_URL,
        webhookUrlLength: this.env.DISCORD_WEBHOOK_URL?.length || 0,
        webhookUrlHost: this.env.DISCORD_WEBHOOK_URL ? new URL(this.env.DISCORD_WEBHOOK_URL).hostname : 'not set',
        hasPublicKey: !!this.env.DISCORD_PUBLIC_KEY,
        publicKeyLength: this.env.DISCORD_PUBLIC_KEY?.length || 0,
        hasSiteUrl: !!this.env.SITE_URL,
        siteUrl: this.env.SITE_URL || 'not set',
        hasAllowedRoles: !!this.env.DISCORD_ALLOWED_ROLES,
        allowedRolesCount: this.env.DISCORD_ALLOWED_ROLES?.split(',').length || 0,
      });
    } catch (error) {
      console.error(`[DISCORD] Error logging service configuration:`, error);
    }
  }

  /**
   * Validate Discord webhook configuration and environment
   */
  private validateWebhookConfig(logContext: LogContext): {
    isValid: boolean;
    webhookUrl?: string;
    issues: string[];
  } {
    const issues: string[] = [];
    let webhookUrl: string | undefined;

    // Check if webhook URL is configured
    if (!this.env.DISCORD_WEBHOOK_URL) {
      issues.push("DISCORD_WEBHOOK_URL environment variable not set");
    } else {
      webhookUrl = this.env.DISCORD_WEBHOOK_URL;

      // Check for placeholder values
      if (
        webhookUrl.includes("your_webhook_url_here") ||
        webhookUrl.includes("placeholder")
      ) {
        issues.push("DISCORD_WEBHOOK_URL appears to be a placeholder value");
      }

      // Validate URL format
      try {
        const url = new URL(webhookUrl);
        if (
          !url.hostname.includes("discord.com") &&
          !url.hostname.includes("discordapp.com")
        ) {
          issues.push(
            "DISCORD_WEBHOOK_URL does not appear to be a valid Discord webhook URL"
          );
        }
        if (!url.pathname.includes("/webhooks/")) {
          issues.push(
            "DISCORD_WEBHOOK_URL path does not contain '/webhooks/' segment"
          );
        }
      } catch (error) {
        issues.push(
          `DISCORD_WEBHOOK_URL is not a valid URL: ${(error as Error).message}`
        );
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
        "Discord webhook configuration issues detected",
        logContext,
        {
          issues,
          hasWebhookUrl: !!webhookUrl,
          hasSiteUrl: !!this.env.SITE_URL,
        }
      );
    }

    return { isValid, webhookUrl, issues };
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
          interaction.user
        );
      case "reject":
        return await this.handleRejectReview(
          data.options?.[0]?.value,
          interaction.user
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

    if (customId.startsWith("approve_player_edit_")) {
      const editId = customId.replace("approve_player_edit_", "");
      return await this.handleApprovePlayerEdit(editId, interaction.user);
    }

    if (customId.startsWith("reject_player_edit_")) {
      const editId = customId.replace("reject_player_edit_", "");
      return await this.handleRejectPlayerEdit(editId, interaction.user);
    }

    if (customId.startsWith("approve_equipment_")) {
      const submissionId = customId.replace("approve_equipment_", "");
      return await this.handleApproveEquipmentSubmission(
        submissionId,
        interaction.user
      );
    }

    if (customId.startsWith("reject_equipment_")) {
      const submissionId = customId.replace("reject_equipment_", "");
      return await this.handleRejectEquipmentSubmission(
        submissionId,
        interaction.user
      );
    }

    if (customId.startsWith("approve_player_")) {
      const submissionId = customId.replace("approve_player_", "");
      return await this.handleApprovePlayerSubmission(
        submissionId,
        interaction.user
      );
    }

    if (customId.startsWith("reject_player_")) {
      const submissionId = customId.replace("reject_player_", "");
      return await this.handleRejectPlayerSubmission(
        submissionId,
        interaction.user
      );
    }

    if (customId.startsWith("approve_")) {
      const reviewId = customId.replace("approve_", "");
      return await this.handleApproveReview(reviewId, interaction.user);
    }

    if (customId.startsWith("reject_")) {
      const reviewId = customId.replace("reject_", "");
      return await this.handleRejectReview(reviewId, interaction.user);
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
      const result = await this.moderationService.recordApproval(
        "player_edit",
        editId,
        user.id,
        "discord"
      );

      if (result.success) {
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
      // For Discord rejections, use a generic rejection category and reason
      const result = await this.moderationService.recordRejection(
        "player_edit",
        editId,
        user.id,
        "discord",
        {
          category: "other",
          reason: `Rejected via Discord by ${user.username}`,
        },
        this.context.cloudflare?.env?.R2_BUCKET
      );

      if (result.success) {
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
      const result = await this.moderationService.recordApproval(
        "equipment",
        submissionId,
        user.id,
        "discord"
      );

      if (result.success) {
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
      // For Discord rejections, use a generic rejection category and reason
      const result = await this.moderationService.recordRejection(
        "equipment",
        submissionId,
        user.id,
        "discord",
        {
          category: "other",
          reason: `Rejected via Discord by ${user.username}`,
        },
        this.context.cloudflare?.env?.R2_BUCKET
      );

      if (result.success) {
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
      const result = await this.moderationService.recordApproval(
        "player",
        submissionId,
        user.id,
        "discord"
      );

      if (result.success) {
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
      // For Discord rejections, use a generic rejection category and reason
      const result = await this.moderationService.recordRejection(
        "player",
        submissionId,
        user.id,
        "discord",
        {
          category: "other",
          reason: `Rejected via Discord by ${user.username}`,
        },
        this.context.cloudflare?.env?.R2_BUCKET
      );

      if (result.success) {
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
      operation: "discord_webhook",
      submissionType: "review",
      submissionId: reviewData.id,
    });

    return this.logger.timeOperation(
      "discord_webhook_review",
      async () => {
        this.logger.info(
          "Sending Discord webhook for review submission",
          logContext,
          {
            reviewId: reviewData.id,
            equipmentName: reviewData.equipment_name,
          }
        );

        // Validate configuration
        const config = this.validateWebhookConfig(logContext);
        if (!config.isValid) {
          const error = new Error(
            `Discord webhook configuration invalid: ${config.issues.join(", ")}`
          );
          this.logger.error(
            "Discord webhook configuration validation failed",
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

        // Send webhook request
        try {
          const response = await globalThis.fetch(config.webhookUrl!, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "tt-reviews-bot/1.0",
            },
            body: JSON.stringify(payload),
          });

          const responseText = await response.text();
          const success = response.ok;

          if (success) {
            this.logger.info("Discord webhook sent successfully", logContext, {
              status: response.status,
              reviewId: reviewData.id,
            });

            this.logger.metric("discord_webhook_success", 1, logContext, {
              submissionType: "review",
            });
          } else {
            this.logger.error("Discord webhook failed", logContext, undefined, {
              status: response.status,
              responseBody: responseText,
              reviewId: reviewData.id,
            });

            this.logger.metric("discord_webhook_failure", 1, logContext, {
              submissionType: "review",
              errorStatus: response.status,
            });
          }

          return { success, status: response.status, response: responseText };
        } catch (error) {
          this.logger.error(
            "Discord webhook network error",
            logContext,
            error as Error,
            {
              reviewId: reviewData.id,
            }
          );

          this.logger.metric("discord_webhook_network_error", 1, logContext, {
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
      operation: "discord_webhook",
      submissionType: "player_edit",
      submissionId: editData.id,
    });

    return this.logger.timeOperation(
      "discord_webhook_player_edit",
      async () => {
        this.logger.info(
          "Sending Discord webhook for player edit",
          logContext,
          {
            editId: editData.id,
            playerName: editData.player_name,
          }
        );

        // Validate configuration
        const config = this.validateWebhookConfig(logContext);
        if (!config.isValid) {
          const error = new Error(
            `Discord webhook configuration invalid: ${config.issues.join(", ")}`
          );
          this.logger.error(
            "Discord webhook configuration validation failed",
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

        const components = [
          {
            type: 1, // Action Row
            components: [
              {
                type: 2, // Button
                style: 3, // Success/Green
                label: "Approve Edit",
                custom_id: `approve_player_edit_${editData.id}`,
              },
              {
                type: 2, // Button
                style: 4, // Danger/Red
                label: "Reject Edit",
                custom_id: `reject_player_edit_${editData.id}`,
              },
            ],
          },
        ];

        const payload = {
          embeds: [embed],
          components,
        };

        const payloadSize = JSON.stringify(payload).length;

        // Send webhook request
        try {
          const response = await globalThis.fetch(config.webhookUrl!, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "tt-reviews-bot/1.0",
            },
            body: JSON.stringify(payload),
          });

          const responseText = await response.text();
          const success = response.ok;

          if (success) {
            this.logger.info("Discord webhook sent successfully", logContext, {
              status: response.status,
              editId: editData.id,
            });

            this.logger.metric("discord_webhook_success", 1, logContext, {
              submissionType: "player_edit",
            });
          } else {
            this.logger.error("Discord webhook failed", logContext, undefined, {
              status: response.status,
              responseBody: responseText,
              editId: editData.id,
            });

            this.logger.metric("discord_webhook_failure", 1, logContext, {
              submissionType: "player_edit",
              errorStatus: response.status,
            });
          }

          return { success, status: response.status, response: responseText };
        } catch (error) {
          this.logger.error(
            "Discord webhook network error",
            logContext,
            error as Error,
            {
              editId: editData.id,
            }
          );

          this.logger.metric("discord_webhook_network_error", 1, logContext, {
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
      operation: "discord_webhook",
      submissionType: "equipment",
      submissionId: submissionData.id,
    });

    return this.logger.timeOperation(
      "discord_webhook_equipment_submission",
      async () => {
        this.logger.info(
          "Sending Discord webhook for equipment submission",
          logContext,
          {
            submissionId: submissionData.id,
            equipmentName: submissionData.name,
          }
        );

        // Validate configuration
        const config = this.validateWebhookConfig(logContext);
        if (!config.isValid) {
          const error = new Error(
            `Discord webhook configuration invalid: ${config.issues.join(", ")}`
          );
          this.logger.error(
            "Discord webhook configuration validation failed",
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

        const components = [
          {
            type: 1, // Action Row
            components: [
              {
                type: 2, // Button
                style: 3, // Success/Green
                label: "Approve Equipment",
                custom_id: `approve_equipment_${submissionData.id}`,
              },
              {
                type: 2, // Button
                style: 4, // Danger/Red
                label: "Reject Equipment",
                custom_id: `reject_equipment_${submissionData.id}`,
              },
            ],
          },
        ];

        const payload = {
          embeds: [embed],
          components,
        };

        const payloadSize = JSON.stringify(payload).length;

        // Send webhook request
        try {
          const response = await globalThis.fetch(config.webhookUrl!, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "tt-reviews-bot/1.0",
            },
            body: JSON.stringify(payload),
          });

          const responseText = await response.text();
          const success = response.ok;

          if (success) {
            this.logger.info("Discord webhook sent successfully", logContext, {
              status: response.status,
              submissionId: submissionData.id,
            });

            this.logger.metric("discord_webhook_success", 1, logContext, {
              submissionType: "equipment",
            });
          } else {
            this.logger.error("Discord webhook failed", logContext, undefined, {
              status: response.status,
              responseBody: responseText,
              submissionId: submissionData.id,
            });

            this.logger.metric("discord_webhook_failure", 1, logContext, {
              submissionType: "equipment",
              errorStatus: response.status,
            });
          }

          return { success, status: response.status, response: responseText };
        } catch (error) {
          this.logger.error(
            "Discord webhook network error",
            logContext,
            error as Error,
            {
              submissionId: submissionData.id,
            }
          );

          this.logger.metric("discord_webhook_network_error", 1, logContext, {
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
      operation: "discord_webhook",
      submissionType: "player",
      submissionId: submissionData.id,
    });

    return this.logger.timeOperation(
      "discord_webhook_player_submission",
      async () => {
        this.logger.info(
          "Sending Discord webhook for player submission",
          logContext,
          {
            submissionId: submissionData.id,
            playerName: submissionData.name,
          }
        );

        // Validate configuration
        const config = this.validateWebhookConfig(logContext);
        if (!config.isValid) {
          const error = new Error(
            `Discord webhook configuration invalid: ${config.issues.join(", ")}`
          );
          this.logger.error(
            "Discord webhook configuration validation failed",
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

        const components = [
          {
            type: 1, // Action Row
            components: [
              {
                type: 2, // Button
                style: 3, // Success/Green
                label: "Approve Player",
                custom_id: `approve_player_${submissionData.id}`,
              },
              {
                type: 2, // Button
                style: 4, // Danger/Red
                label: "Reject Player",
                custom_id: `reject_player_${submissionData.id}`,
              },
            ],
          },
        ];

        const payload = {
          embeds: [embed],
          components,
        };

        const payloadSize = JSON.stringify(payload).length;

        // Send webhook request
        try {
          const response = await globalThis.fetch(config.webhookUrl!, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "tt-reviews-bot/1.0",
            },
            body: JSON.stringify(payload),
          });

          const responseText = await response.text();
          const success = response.ok;

          if (success) {
            this.logger.info("Discord webhook sent successfully", logContext, {
              status: response.status,
              submissionId: submissionData.id,
            });

            this.logger.metric("discord_webhook_success", 1, logContext, {
              submissionType: "player",
            });
          } else {
            this.logger.error("Discord webhook failed", logContext, undefined, {
              status: response.status,
              responseBody: responseText,
              submissionId: submissionData.id,
            });

            this.logger.metric("discord_webhook_failure", 1, logContext, {
              submissionType: "player",
              errorStatus: response.status,
            });
          }

          return { success, status: response.status, response: responseText };
        } catch (error) {
          this.logger.error(
            "Discord webhook network error",
            logContext,
            error as Error,
            {
              submissionId: submissionData.id,
            }
          );

          this.logger.metric("discord_webhook_network_error", 1, logContext, {
            submissionType: "player",
          });

          throw error;
        }
      },
      logContext
    );
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
