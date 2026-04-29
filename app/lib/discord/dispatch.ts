import * as moderation from "./moderation";
import * as search from "./search";
import type {
  DiscordContext,
  DiscordInteraction,
  DiscordMessage,
} from "./types";

/**
 * Discord inbound request routing. Three entry points:
 *  - handleSlashCommand: /equipment, /player, /approve, /reject
 *  - handlePrefixCommand: legacy !equipment, !player
 *  - handleMessageComponent: button custom_id dispatch (approve/reject)
 *
 * Each performs permission + user-identity checks, then hands off to
 * search or moderation. Kept deliberately thin — the business rules
 * live in those modules.
 */

export async function handleSlashCommand(
  ctx: DiscordContext,
  interaction: DiscordInteraction
): Promise<Response> {
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
    return ephemeralJson(
      "❌ **Error**: Unable to identify user from interaction."
    );
  }

  const hasPermission = await moderation.checkUserPermissions(
    ctx,
    interaction.member,
    interaction.guild_id
  );
  if (!hasPermission) {
    return ephemeralJson("❌ You do not have permission to use this command.");
  }

  switch (commandName) {
    case "equipment":
      return search.handleEquipmentSearch(ctx, data.options?.[0]?.value || "");
    case "player":
      return search.handlePlayerSearch(ctx, data.options?.[0]?.value || "");
    case "approve":
      return moderation.approveReview(
        ctx,
        data.options?.[0]?.value || "",
        user
      );
    case "reject":
      return moderation.rejectReview(ctx, data.options?.[0]?.value || "", user);
    default:
      return ephemeralJson("❌ Unknown command.");
  }
}

export async function handlePrefixCommand(
  ctx: DiscordContext,
  message: DiscordMessage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const content = message.content.trim();

  const hasPermission = await moderation.checkUserPermissions(
    ctx,
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
    return search.searchEquipment(ctx, query);
  }

  if (content.startsWith("!player ")) {
    const query = content.slice(8).trim();
    return search.searchPlayer(ctx, query);
  }

  return null;
}

export async function handleMessageComponent(
  ctx: DiscordContext,
  interaction: DiscordInteraction
): Promise<Response> {
  const hasPermission = await moderation.checkUserPermissions(
    ctx,
    interaction.member,
    interaction.guild_id
  );
  if (!hasPermission) {
    return ephemeralJson("❌ You do not have permission to use this command.");
  }

  const customId = interaction.data.custom_id!;

  // Get user from either interaction.user or interaction.member.user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = interaction.user || (interaction.member as any)?.user;

  if (!user) {
    return ephemeralJson(
      "❌ **Error**: Unable to identify user from interaction."
    );
  }

  // Prefix-match routing. Order matters — player_equipment_setup_ must
  // be matched before player_ to avoid the shorter prefix swallowing it.
  // Same for equipment_edit_ vs equipment_ (TT-74).
  if (customId.startsWith("approve_player_edit_")) {
    return moderation.approvePlayerEdit(
      ctx,
      customId.replace("approve_player_edit_", ""),
      user
    );
  }

  if (customId.startsWith("reject_player_edit_")) {
    return moderation.rejectPlayerEdit(
      ctx,
      customId.replace("reject_player_edit_", ""),
      user
    );
  }

  if (customId.startsWith("approve_equipment_edit_")) {
    return moderation.approveEquipmentEdit(
      ctx,
      customId.replace("approve_equipment_edit_", ""),
      user
    );
  }

  if (customId.startsWith("reject_equipment_edit_")) {
    return moderation.rejectEquipmentEdit(
      ctx,
      customId.replace("reject_equipment_edit_", ""),
      user
    );
  }

  if (customId.startsWith("approve_equipment_")) {
    return moderation.approveEquipmentSubmission(
      ctx,
      customId.replace("approve_equipment_", ""),
      user
    );
  }

  if (customId.startsWith("reject_equipment_")) {
    return moderation.rejectEquipmentSubmission(
      ctx,
      customId.replace("reject_equipment_", ""),
      user
    );
  }

  if (customId.startsWith("approve_player_equipment_setup_")) {
    return moderation.approvePlayerEquipmentSetup(
      ctx,
      customId.replace("approve_player_equipment_setup_", ""),
      user
    );
  }

  if (customId.startsWith("reject_player_equipment_setup_")) {
    return moderation.rejectPlayerEquipmentSetup(
      ctx,
      customId.replace("reject_player_equipment_setup_", ""),
      user
    );
  }

  if (customId.startsWith("approve_player_")) {
    return moderation.approvePlayerSubmission(
      ctx,
      customId.replace("approve_player_", ""),
      user
    );
  }

  if (customId.startsWith("reject_player_")) {
    return moderation.rejectPlayerSubmission(
      ctx,
      customId.replace("reject_player_", ""),
      user
    );
  }

  if (customId.startsWith("approve_video_")) {
    return moderation.approveVideoSubmission(
      ctx,
      customId.replace("approve_video_", ""),
      user
    );
  }

  if (customId.startsWith("reject_video_")) {
    return moderation.rejectVideoSubmission(
      ctx,
      customId.replace("reject_video_", ""),
      user
    );
  }

  if (customId.startsWith("approve_review_")) {
    return moderation.approveReview(
      ctx,
      customId.replace("approve_review_", ""),
      user
    );
  }

  if (customId.startsWith("reject_review_")) {
    return moderation.rejectReview(
      ctx,
      customId.replace("reject_review_", ""),
      user
    );
  }

  return ephemeralJson("❌ Unknown interaction.");
}

function ephemeralJson(content: string): Response {
  return new Response(
    JSON.stringify({
      type: 4,
      data: { content, flags: 64 },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
