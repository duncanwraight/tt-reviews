import type { Equipment } from "~/lib/types";
import type { EquipmentReview } from "~/lib/database/types";

export interface ComparisonItem {
  equipment: Equipment;
  averageRating: number;
  reviewCount: number;
  reviews: EquipmentReview[];
  usedByPlayers: Array<{ id: string; name: string; slug: string }>;
}
