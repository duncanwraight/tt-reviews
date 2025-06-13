// Shared types that can be used by both client and server components

export interface Player {
  id: string;
  name: string;
  slug: string;
  highest_rating?: string;
  active_years?: string;
  active: boolean;
  playing_style?:
    | "attacker"
    | "all_rounder"
    | "defender"
    | "counter_attacker"
    | "chopper"
    | "unknown";
  birth_country?: string; // ISO 3166-1 alpha-3 country code for birth country
  represents?: string; // ISO 3166-1 alpha-3 country code for represented country
  created_at: string;
  updated_at: string;
}

export interface Equipment {
  id: string;
  name: string;
  slug: string;
  category: "blade" | "rubber" | "ball";
  subcategory?: "inverted" | "long_pips" | "anti" | "short_pips";
  manufacturer: string;
  specifications: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PlayerEquipmentSetup {
  id: string;
  player_id: string;
  year: number;
  blade_id?: string;
  forehand_rubber_id?: string;
  forehand_thickness?: string;
  forehand_color?: "red" | "black";
  backhand_rubber_id?: string;
  backhand_thickness?: string;
  backhand_color?: "red" | "black";
  source_url?: string;
  source_type?:
    | "interview"
    | "video"
    | "tournament_footage"
    | "official_website";
  verified: boolean;
  created_at: string;
  updated_at: string;
}
