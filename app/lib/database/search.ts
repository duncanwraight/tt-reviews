import type { Equipment, Player } from "~/lib/types";
import type { DatabaseContext } from "./types";
import { searchEquipment } from "./equipment";
import { searchPlayers } from "./players";

export async function search(
  ctx: DatabaseContext,
  query: string
): Promise<{ equipment: Equipment[]; players: Player[] }> {
  const [equipment, players] = await Promise.all([
    searchEquipment(ctx, query),
    searchPlayers(ctx, query),
  ]);

  return { equipment, players };
}
