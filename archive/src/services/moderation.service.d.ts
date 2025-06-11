import { SupabaseClient } from '@supabase/supabase-js';
import { EquipmentReview, PlayerEdit, EquipmentSubmission } from '../types/database.js';
export declare class ModerationService {
    private supabase;
    constructor(supabase: SupabaseClient);
    getPendingReviews(limit?: number, offset?: number): Promise<{
        reviews: EquipmentReview[];
        total: number;
    }>;
    approveReview(reviewId: string, moderatorId: string, isAdminApproval?: boolean): Promise<{
        success: boolean;
        status: 'first_approval' | 'fully_approved' | 'already_approved' | 'error';
        message: string;
    }>;
    rejectReview(reviewId: string, moderatorId: string, reason?: string): Promise<boolean>;
    getReviewById(reviewId: string): Promise<EquipmentReview | null>;
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
    getPendingPlayerEdits(limit?: number, offset?: number): Promise<{
        playerEdits: PlayerEdit[];
        total: number;
    }>;
    approvePlayerEdit(editId: string, moderatorId: string): Promise<{
        success: boolean;
        status: 'approved' | 'already_approved' | 'error';
        message: string;
    }>;
    rejectPlayerEdit(editId: string, moderatorId: string, reason?: string): Promise<boolean>;
    getPlayerEditById(editId: string): Promise<PlayerEdit | null>;
    getPendingEquipmentSubmissions(limit?: number, offset?: number): Promise<{
        equipmentSubmissions: EquipmentSubmission[];
        total: number;
    }>;
    approveEquipmentSubmission(submissionId: string, moderatorId: string): Promise<{
        success: boolean;
        status: 'approved' | 'already_approved' | 'error';
        message: string;
    }>;
    rejectEquipmentSubmission(submissionId: string, moderatorId: string, reason?: string): Promise<boolean>;
    getEquipmentSubmissionById(submissionId: string): Promise<EquipmentSubmission | null>;
    getReviewApprovals(_reviewId: string): Promise<string[]>;
    private logModerationAction;
}
//# sourceMappingURL=moderation.service.d.ts.map