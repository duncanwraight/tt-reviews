import { SupabaseClient } from '@supabase/supabase-js';
import { Equipment, EquipmentReview, ReviewerContext } from '../types/database.js';
export declare class EquipmentService {
    private supabase;
    constructor(supabase: SupabaseClient);
    getEquipment(slug: string): Promise<Equipment | null>;
    getEquipmentById(id: string): Promise<Equipment | null>;
    searchEquipment(query: string): Promise<Equipment[]>;
    getEquipmentReviews(equipmentId: string, status?: 'approved' | 'all'): Promise<EquipmentReview[]>;
    createReview(userId: string, equipmentId: string, overallRating: number, categoryRatings: Record<string, number>, reviewText: string | undefined, reviewerContext: ReviewerContext): Promise<EquipmentReview | null>;
    getUserReview(userId: string, equipmentId: string): Promise<EquipmentReview | null>;
    updateReview(reviewId: string, userId: string, overallRating?: number, categoryRatings?: Record<string, number>, reviewText?: string, reviewerContext?: ReviewerContext): Promise<EquipmentReview | null>;
    deleteReview(reviewId: string, userId: string): Promise<boolean>;
    getUserReviews(userId: string, page?: number, limit?: number): Promise<{
        reviews: EquipmentReview[];
        total: number;
    }>;
    getRecentEquipment(limit?: number): Promise<Equipment[]>;
    getRecentReviews(limit?: number): Promise<EquipmentReview[]>;
    getEquipmentCategories(): Promise<{
        category: string;
        count: number;
    }[]>;
    submitEquipment(userId: string, equipmentData: {
        name: string;
        manufacturer: string;
        category: 'blade' | 'rubber' | 'ball';
        subcategory?: 'inverted' | 'long_pips' | 'anti' | 'short_pips';
        specifications?: Record<string, unknown>;
    }): Promise<string | null>;
}
//# sourceMappingURL=equipment.service.d.ts.map