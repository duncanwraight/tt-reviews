/**
 * Internal API service for making server-to-server calls within the same application
 * This allows SSR routes to use the same API endpoints without external HTTP calls
 */
import { Context } from 'hono';
import { Equipment, Player, EquipmentReview } from '../types/database';
export declare class InternalApiService {
    private authService;
    constructor(c: Context);
    /**
     * Equipment operations
     */
    getEquipment(slug: string): Promise<Equipment | null>;
    getEquipmentReviews(equipmentId: string): Promise<EquipmentReview[]>;
    getRecentEquipment(limit?: number): Promise<Equipment[]>;
    getRecentReviews(limit?: number): Promise<EquipmentReview[]>;
    getEquipmentCategories(): Promise<{
        category: string;
        count: number;
    }[]>;
    searchEquipment(query: string): Promise<Equipment[]>;
    /**
     * Player operations
     */
    getPlayer(slug: string): Promise<Player | null>;
    getPlayerEquipmentSetups(playerId: string): Promise<import("../lib/supabase").PlayerEquipmentSetup[]>;
    getAllPlayers(): Promise<Player[]>;
    searchPlayers(query: string): Promise<Player[]>;
    /**
     * Admin/Moderation operations (require service role for admin access)
     */
    getModerationStats(): Promise<{
        pending: number;
        approved: number;
        rejected: number;
        total: number;
        playerEditsPending: number;
        playerEditsApproved: number;
        playerEditsRejected: number;
        playerEditsTotal: number;
        equipmentSubmissionsPending: number;
        equipmentSubmissionsApproved: number;
        equipmentSubmissionsRejected: number;
        equipmentSubmissionsTotal: number;
    }>;
    getPendingReviews(limit?: number, offset?: number): Promise<{
        reviews: EquipmentReview[];
        total: number;
    }>;
    getPendingPlayerEdits(limit?: number, offset?: number): Promise<{
        playerEdits: import("../types/database").PlayerEdit[];
        total: number;
    }>;
    getPendingEquipmentSubmissions(limit?: number, offset?: number): Promise<{
        equipmentSubmissions: import("../types/database").EquipmentSubmission[];
        total: number;
    }>;
}
//# sourceMappingURL=internal-api.service.d.ts.map