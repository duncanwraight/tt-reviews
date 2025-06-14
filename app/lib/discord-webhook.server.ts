import type { AppLoadContext } from "react-router";

interface NotificationData {
  id: string;
  player_name?: string;
  player_id?: string;
  edit_data?: any;
  submitter_email?: string;
  name?: string;
  manufacturer?: string;
  category?: string;
  subcategory?: string;
}

export async function sendDiscordPlayerEditNotification(
  context: AppLoadContext,
  editData: NotificationData
): Promise<{ success: boolean }> {
  try {
    const env = context.cloudflare.env as Cloudflare.Env;
    const webhookUrl = env.DISCORD_WEBHOOK_URL;
    
    if (!webhookUrl) {
      console.error("DISCORD_WEBHOOK_URL not configured");
      return { success: false };
    }

    // Create a summary of the changes
    const changes = [];
    if (editData.edit_data.name) changes.push(`Name: ${editData.edit_data.name}`);
    if (editData.edit_data.highest_rating)
      changes.push(`Rating: ${editData.edit_data.highest_rating}`);
    if (editData.edit_data.active_years)
      changes.push(`Active: ${editData.edit_data.active_years}`);
    if (editData.edit_data.active !== undefined)
      changes.push(`Status: ${editData.edit_data.active ? "Active" : "Inactive"}`);

    const embed = {
      title: "🏓 Player Edit Submitted",
      description: "A player information update has been submitted and needs moderation.",
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
          value: changes.length > 0 ? changes.join("\n") : "No changes specified",
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

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Discord webhook error:", errorText);
    }

    return { success: response.ok };
  } catch (error) {
    console.error("Error sending player edit Discord notification:", error);
    return { success: false };
  }
}