import * as moderation from "./moderation";
import * as search from "./search";
import type { DiscordContext, DiscordInteraction } from "./types";

/**
 * Discord inbound request routing. Two entry points:
 *  - handleSlashCommand: /equipment, /player. Defers (type-5) and PATCHes
 *    a webhook followup with the rendered embed once the search work
 *    finishes (TT-159 — see search.ts for the actual search + render).
 *  - handleMessageComponent: button custom_id dispatch (approve/reject).
 *    Untouched — that's the moderation surface.
 *
 * The /approve, /reject, !equipment, !player surfaces existed pre-TT-156
 * but were either redundant with the button moderation flow or unreachable
 * (no message-create gateway is wired up); they were removed in C3.
 */

export async function handleSlashCommand(
  ctx: DiscordContext,
  interaction: DiscordInteraction
): Promise<Response> {
  // Ping challenge first — Discord uses this during registration.
  if (interaction.type === 1) {
    return new Response(JSON.stringify({ type: 1 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data } = interaction;
  // Dev guild registers commands with a `test-` prefix (so they're
  // visually distinct in the picker for testers and so a tighter role
  // gate can be applied via DISCORD_SEARCH_ALLOWED_ROLES). Strip the
  // prefix here so the rest of the dispatch is environment-agnostic;
  // prod and e2e alike send the bare names.
  const isDev = ctx.env.ENVIRONMENT === "development";
  const commandName =
    isDev && data.name.startsWith("test-")
      ? data.name.slice("test-".length)
      : data.name;

  const allowed = await moderation.checkSearchPermissions(
    ctx,
    interaction.member,
    interaction.guild_id
  );
  if (!allowed) {
    return ephemeralJson("❌ You do not have permission to use this command.");
  }

  if (commandName !== "equipment" && commandName !== "player") {
    return ephemeralJson("❌ Unknown command.");
  }

  const query = (data.options?.[0]?.value || "").trim();
  if (!query) {
    return ephemeralJson(
      `❌ Please provide a search query. Example: \`/${commandName} query:viscaria\``
    );
  }

  // Defer the response — the 3-second Discord deadline is unforgiving
  // and silent. Cold isolate + cold Supabase pool + image-CDN warm-up
  // routinely brushes against it. Type-5 acks within milliseconds and
  // we PATCH the followup once search + render finish, anywhere up to
  // 15 minutes later. ctx.waitUntil keeps the Worker alive for the
  // followup PATCH after the response returns.
  if (!interaction.application_id || !interaction.token) {
    // Defensive — Discord guarantees both on every dispatch we'd see,
    // but if they're missing the followup PATCH can't be addressed.
    // Fall back to a synchronous error rather than silently dropping
    // the user's request.
    return ephemeralJson("❌ Search error: malformed interaction.");
  }

  const followup = (async () => {
    try {
      const outcome =
        commandName === "equipment"
          ? await search.runEquipmentSearch(ctx, query)
          : await search.runPlayerSearch(ctx, query);
      await sendFollowup(ctx, interaction, outcome);
    } catch (err) {
      // Best-effort: surface a generic error to the user even when the
      // search path itself blew up. The structured Logger.error inside
      // search.ts has already fired the Discord alerter for ops.
      try {
        await sendFollowup(ctx, interaction, {
          kind: "error",
          content: "❌ Search error. Please try again later.",
          outcome: "error",
          topRank: null,
          runnerUpRank: null,
          matchCount: 0,
        });
      } catch {
        // Followup PATCH failed too — nothing we can do. The deferred
        // ack will eventually time out client-side; the alerter will
        // have captured the underlying error.
      }
      throw err;
    }
  })();

  ctx.context.cloudflare?.ctx?.waitUntil?.(followup);

  return new Response(JSON.stringify({ type: 5 }), {
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleMessageComponent(
  ctx: DiscordContext,
  interaction: DiscordInteraction
): Promise<Response> {
  const allowed = await moderation.checkModeratorPermissions(
    ctx,
    interaction.member,
    interaction.guild_id
  );
  if (!allowed) {
    return ephemeralJson("❌ You do not have permission to use this command.");
  }

  const customId = interaction.data.custom_id!;

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

async function sendFollowup(
  ctx: DiscordContext,
  interaction: DiscordInteraction,
  outcome: search.SearchOutcome
): Promise<void> {
  const url = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`;

  // Followup PATCH cannot toggle ephemeral state — that's set at ack time
  // (we ack public to keep useful single-match results visible to the
  // channel). Ambiguity / no-match hints are sent the same way; brief,
  // informational, fine to be public.
  let body: Record<string, unknown>;
  if (outcome.kind === "embed") {
    body = { embeds: [outcome.embed], allowed_mentions: { parse: [] } };
  } else {
    body = { content: outcome.content, allowed_mentions: { parse: [] } };
  }

  await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${ctx.env.DISCORD_BOT_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
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
