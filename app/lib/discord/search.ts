import { Logger, createLogContext } from "../logger.server";
import type { DiscordContext } from "./types";

/**
 * Search helpers for the /equipment and /player slash/prefix commands.
 * Each function takes DiscordContext so it can be unit-tested with a
 * mocked DatabaseService and no Cloudflare runtime.
 */

/**
 * Handle `/equipment query:...` slash command — wraps searchEquipment
 * with the Discord interaction Response shape.
 */
export async function handleEquipmentSearch(
  ctx: DiscordContext,
  query: string
): Promise<Response> {
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

  const result = await searchEquipment(ctx, query);

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
 * Handle `/player query:...` slash command — wraps searchPlayer with the
 * Discord interaction Response shape.
 */
export async function handlePlayerSearch(
  ctx: DiscordContext,
  query: string
): Promise<Response> {
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

  const result = await searchPlayer(ctx, query);

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
 * Search equipment and format as a Discord content object. Also used by
 * the legacy `!equipment <query>` prefix command.
 */
export async function searchEquipment(
  ctx: DiscordContext,
  query: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  try {
    const equipment = await ctx.dbService.searchEquipment(query);

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
          `${ctx.env.SITE_URL}/equipment/${item.slug}`
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
    Logger.error(
      "Equipment search error",
      createLogContext("discord-search", { query }),
      error instanceof Error ? error : undefined
    );
    return {
      content: "❌ Error searching equipment. Please try again later.",
    };
  }
}

/**
 * Search players and format as a Discord content object. Also used by
 * the legacy `!player <query>` prefix command.
 */
export async function searchPlayer(
  ctx: DiscordContext,
  query: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  try {
    const players = await ctx.dbService.searchPlayers(query);

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
          `${ctx.env.SITE_URL}/players/${player.slug}`
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
    Logger.error(
      "Player search error",
      createLogContext("discord-search", { query }),
      error instanceof Error ? error : undefined
    );
    return {
      content: "❌ Error searching players. Please try again later.",
    };
  }
}
