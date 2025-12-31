import type { AppLoadContext } from "react-router";
import type { SubmissionType, DiscordNotificationData } from "~/lib/types";
import { formatSubmissionForDiscord } from "~/lib/submissions/registry";
import { Logger, createLogContext } from "~/lib/logger.server";

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  timestamp: string;
}

interface DiscordButtonComponent {
  type: 2; // Button
  style: number;
  label: string;
  custom_id?: string; // Optional for link buttons
  url?: string; // For link buttons (style 5)
}

interface DiscordActionRow {
  type: 1; // Action Row
  components: DiscordButtonComponent[];
}

interface DiscordMessage {
  embeds: DiscordEmbed[];
  components: DiscordActionRow[];
}

export class UnifiedDiscordNotifier {
  private env: Cloudflare.Env;
  private logger = Logger;

  constructor(context: AppLoadContext) {
    this.env = context.cloudflare.env as Cloudflare.Env;
  }

  /**
   * Send a unified Discord notification for any submission type
   */
  async notifySubmission(
    submissionType: SubmissionType,
    submissionData: any,
    requestId: string = "unknown"
  ): Promise<{ success: boolean; message?: string }> {
    const logContext = createLogContext(requestId, {
      operation: "discord_unified_notification",
      submissionType,
      submissionId: submissionData.id,
    });

    return this.logger.timeOperation(
      `discord_${submissionType}_notification`,
      async () => {
        this.logger.info(
          "Sending unified Discord notification",
          logContext,
          {
            submissionType,
            submissionId: submissionData.id,
            submissionTitle: submissionData.name || submissionData.player_name || "Unknown",
          }
        );

        // Validate Discord configuration
        const validation = this.validateDiscordConfig(logContext);
        if (!validation.isValid) {
          this.logger.warn(
            "Discord configuration invalid, skipping notification",
            logContext,
            { issues: validation.issues }
          );
          return { success: false, message: "Discord not configured" };
        }

        try {
          // Format submission data using registry
          const notificationData = formatSubmissionForDiscord(submissionType, submissionData);

          // Create Discord message
          const message = this.createDiscordMessage(notificationData);

          // Send to Discord
          const response = await this.sendToDiscord(message, logContext);

          if (response.success) {
            this.logger.info(
              "Discord notification sent successfully",
              logContext,
              {
                submissionType,
                submissionId: submissionData.id,
                messageId: response.messageId,
              }
            );
          } else {
            this.logger.error(
              "Failed to send Discord notification",
              logContext,
              undefined,
              { errorMessage: response.error }
            );
          }

          return response;
        } catch (error) {
          this.logger.error(
            "Error in unified Discord notification",
            logContext,
            error instanceof Error ? error : undefined,
            { errorMessage: String(error) }
          );
          return { success: false, message: String(error) };
        }
      },
      logContext
    );
  }

  /**
   * Create Discord message with embed and buttons
   */
  private createDiscordMessage(data: DiscordNotificationData): DiscordMessage {
    const embed: DiscordEmbed = {
      title: data.title,
      description: data.description,
      color: data.color,
      fields: data.fields,
      timestamp: new Date().toISOString(),
    };

    const buttons: DiscordButtonComponent[] = [
      {
        type: 2, // Button
        style: 3, // Success/Green
        label: "Approve",
        custom_id: `approve_${data.submissionType}_${data.id}`,
      },
      {
        type: 2, // Button
        style: 4, // Danger/Red
        label: "Reject",
        custom_id: `reject_${data.submissionType}_${data.id}`,
      },
    ];

    // Add "View" button if adminUrl is provided
    if (data.adminUrl) {
      buttons.push({
        type: 2, // Button
        style: 5, // Link style (opens URL in browser)
        label: "View",
        url: `${this.env.SITE_URL || "https://tt-reviews.local"}${data.adminUrl}`,
      });
    }

    const components: DiscordActionRow[] = [
      {
        type: 1, // Action Row
        components: buttons,
      },
    ];

    return {
      embeds: [embed],
      components,
    };
  }

  /**
   * Send message to Discord via bot API
   */
  private async sendToDiscord(
    message: DiscordMessage,
    logContext: any
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const botToken = this.env.DISCORD_BOT_TOKEN;
    const channelId = this.env.DISCORD_CHANNEL_ID;

    if (!botToken || !channelId) {
      return { success: false, error: "Discord bot token or channel ID not configured" };
    }

    try {
      const response = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bot ${botToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          "Discord API error",
          logContext,
          undefined,
          {
            status: response.status,
            statusText: response.statusText,
            errorText,
          }
        );
        return { success: false, error: `Discord API error: ${response.status} ${errorText}` };
      }

      const result = (await response.json()) as { id: string };
      return { success: true, messageId: result.id };
    } catch (error) {
      this.logger.error(
        "Network error sending to Discord",
        logContext,
        error instanceof Error ? error : undefined,
        { errorMessage: String(error) }
      );
      return { success: false, error: String(error) };
    }
  }

  /**
   * Validate Discord bot configuration
   */
  private validateDiscordConfig(logContext: any): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    if (!this.env.DISCORD_BOT_TOKEN) {
      issues.push("DISCORD_BOT_TOKEN environment variable not set");
    } else if (
      this.env.DISCORD_BOT_TOKEN.includes("your_actual_bot_token_here") ||
      this.env.DISCORD_BOT_TOKEN.includes("placeholder") ||
      this.env.DISCORD_BOT_TOKEN.length < 50
    ) {
      issues.push("DISCORD_BOT_TOKEN appears to be a placeholder value");
    }

    if (!this.env.DISCORD_CHANNEL_ID) {
      issues.push("DISCORD_CHANNEL_ID environment variable not set");
    } else if (
      this.env.DISCORD_CHANNEL_ID.includes("your_channel_id") ||
      this.env.DISCORD_CHANNEL_ID.includes("placeholder") ||
      this.env.DISCORD_CHANNEL_ID.length < 15
    ) {
      issues.push("DISCORD_CHANNEL_ID appears to be a placeholder value");
    }

    if (!this.env.SITE_URL) {
      issues.push("SITE_URL environment variable not set (needed for Discord embed links)");
    }

    const isValid = issues.length === 0;

    if (!isValid) {
      this.logger.warn(
        "Discord configuration issues detected",
        logContext,
        {
          issues,
          hasBotToken: !!this.env.DISCORD_BOT_TOKEN,
          hasChannelId: !!this.env.DISCORD_CHANNEL_ID,
          hasSiteUrl: !!this.env.SITE_URL,
        }
      );
    }

    return { isValid, issues };
  }
}

/**
 * Factory function to create notifier instance
 */
export function createUnifiedDiscordNotifier(context: AppLoadContext): UnifiedDiscordNotifier {
  return new UnifiedDiscordNotifier(context);
}