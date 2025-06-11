import { SupabaseClient, User, Session } from '@supabase/supabase-js';
export interface Equipment {
    id: string;
    name: string;
    slug: string;
    category: 'blade' | 'rubber' | 'ball';
    subcategory?: 'inverted' | 'long_pips' | 'anti' | 'short_pips';
    manufacturer: string;
    specifications: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}
export interface Player {
    id: string;
    name: string;
    slug: string;
    highest_rating?: string;
    active_years?: string;
    active: boolean;
    created_at: string;
    updated_at: string;
}
export interface EquipmentReview {
    id: string;
    equipment_id: string;
    user_id: string;
    status: 'pending' | 'approved' | 'rejected';
    overall_rating: number;
    category_ratings: Record<string, number>;
    review_text?: string;
    reviewer_context: Record<string, unknown>;
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
    forehand_color?: 'red' | 'black';
    backhand_rubber_id?: string;
    backhand_thickness?: string;
    backhand_color?: 'red' | 'black';
    source_url?: string;
    source_type?: 'interview' | 'video' | 'tournament_footage' | 'official_website';
    verified: boolean;
    created_at: string;
    updated_at: string;
}
export declare function createSupabaseClient(env: unknown): SupabaseClient<any, "public", any>;
export declare function createSupabaseAdminClient(env: unknown): SupabaseClient<any, "public", any>;
export declare class EquipmentService {
    private supabase;
    constructor(supabase: SupabaseClient);
    getEquipment(slug: string): Promise<Equipment | null>;
    searchEquipment(query: string): Promise<Equipment[]>;
    getEquipmentReviews(equipmentId: string, status?: 'approved' | 'all'): Promise<EquipmentReview[]>;
}
export declare class PlayerService {
    private supabase;
    constructor(supabase: SupabaseClient);
    getPlayer(slug: string): Promise<Player | null>;
    getPlayerEquipmentSetups(playerId: string): Promise<PlayerEquipmentSetup[]>;
    getAllPlayers(): Promise<Player[]>;
    searchPlayers(query: string): Promise<Player[]>;
}
export declare class AuthService {
    private supabase;
    constructor(supabase: SupabaseClient);
    signUp(email: string, password: string): Promise<{
        user: User | null;
        error: Error | null;
    }>;
    signIn(email: string, password: string): Promise<{
        user: User | null;
        session: Session | null;
        error: Error | null;
    }>;
    signOut(): Promise<{
        error: Error | null;
    }>;
    getUser(): Promise<{
        user: User | null;
        error: Error | null;
    }>;
    getSession(): Promise<{
        session: Session | null;
        error: Error | null;
    }>;
    resetPassword(email: string): Promise<{
        error: Error | null;
    }>;
}
//# sourceMappingURL=supabase.d.ts.map