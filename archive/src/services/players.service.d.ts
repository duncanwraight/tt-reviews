import { SupabaseClient } from '@supabase/supabase-js';
import { Player, PlayerEquipmentSetup } from '../types/database';
export declare class PlayersService {
    private supabase;
    constructor(supabase: SupabaseClient);
    getPlayer(slug: string): Promise<Player | null>;
    getPlayerEquipmentSetups(playerId: string): Promise<PlayerEquipmentSetup[]>;
    getAllPlayers(): Promise<Player[]>;
    searchPlayers(query: string): Promise<Player[]>;
    createPlayer(playerData: Omit<Player, 'id' | 'created_at' | 'updated_at'>): Promise<Player | null>;
    updatePlayer(slug: string, playerData: Partial<Player>): Promise<Player | null>;
    createPlayerEquipmentSetup(setupData: {
        player_id: string;
        year: number;
        blade_id?: string;
        forehand_rubber_id?: string;
        forehand_thickness?: string;
        forehand_color?: 'red' | 'black';
        backhand_rubber_id?: string;
        backhand_thickness?: string;
        backhand_color?: 'red' | 'black';
        source_url?: string;
        source_type?: 'interview' | 'video' | 'tournament_footage' | 'official_website';
    }): Promise<boolean>;
    addEquipmentSetup(playerId: string, setupData: {
        year?: number;
        blade_name?: string;
        blade_id?: string;
        forehand_rubber_name?: string;
        forehand_rubber_id?: string;
        forehand_thickness?: string;
        forehand_color?: 'red' | 'black';
        backhand_rubber_name?: string;
        backhand_rubber_id?: string;
        backhand_thickness?: string;
        backhand_color?: 'red' | 'black';
        source_url?: string;
        source_type?: 'interview' | 'video' | 'tournament_footage' | 'official_website';
    }): Promise<boolean>;
    private findOrCreateEquipment;
    submitPlayerEdit(playerId: string, editData: Partial<Player>, userId: string): Promise<string | null>;
}
//# sourceMappingURL=players.service.d.ts.map