import type { Context } from 'hono';
import { BindingsEnv } from '../types/environment';
import { EnhancedAuthVariables } from '../middleware/auth-enhanced';
export declare class ModerationController {
    static getPendingReviews(c: Context<BindingsEnv & {
        Variables: EnhancedAuthVariables;
    }>): Promise<(Response & import("hono").TypedResponse<{
        success: true;
        data: {
            reviews: {
                id: string;
                equipment_id: string;
                user_id: string;
                status: "pending" | "approved" | "rejected";
                overall_rating: number;
                category_ratings: {
                    [x: string]: number;
                };
                review_text?: string | undefined;
                reviewer_context: {
                    playing_level?: string | undefined;
                    style_of_play?: string | undefined;
                    testing_duration?: string | undefined;
                    testing_quantity?: string | undefined;
                    testing_type?: string | undefined;
                    other_equipment?: string | undefined;
                    purchase_location?: string | undefined;
                    purchase_price?: string | undefined;
                };
                created_at: string;
                updated_at: string;
                equipment?: {
                    id: string;
                    name: string;
                    slug: string;
                    category: "blade" | "rubber" | "ball";
                    subcategory?: "inverted" | "long_pips" | "anti" | "short_pips" | undefined;
                    manufacturer: string;
                    specifications: {
                        [x: string]: never;
                    };
                    created_at: string;
                    updated_at: string;
                } | undefined;
            }[];
            total: number;
        };
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">) | (Response & import("hono").TypedResponse<{
        success: false;
        error: string;
    }, 500, "json">)>;
    static approveReview(c: Context<BindingsEnv & {
        Variables: EnhancedAuthVariables;
    }>): Promise<(Response & import("hono").TypedResponse<{
        success: false;
        error: string;
    }, 500 | 400, "json">) | (Response & import("hono").TypedResponse<{
        success: true;
        message: string;
        status: "error" | "first_approval" | "fully_approved" | "already_approved";
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">)>;
    static rejectReview(c: Context<BindingsEnv & {
        Variables: EnhancedAuthVariables;
    }>): Promise<(Response & import("hono").TypedResponse<{
        success: false;
        error: string;
    }, 400, "json">) | (Response & import("hono").TypedResponse<{
        success: false;
        error: string;
    }, 500, "json">) | (Response & import("hono").TypedResponse<{
        success: true;
        message: string;
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">)>;
    static getReview(c: Context<BindingsEnv & {
        Variables: EnhancedAuthVariables;
    }>): Promise<(Response & import("hono").TypedResponse<{
        success: false;
        error: string;
    }, 400, "json">) | (Response & import("hono").TypedResponse<{
        success: false;
        error: string;
    }, 404, "json">) | (Response & import("hono").TypedResponse<{
        success: true;
        data: {
            id: string;
            equipment_id: string;
            user_id: string;
            status: "pending" | "approved" | "rejected";
            overall_rating: number;
            category_ratings: {
                [x: string]: number;
            };
            review_text?: string | undefined;
            reviewer_context: {
                playing_level?: string | undefined;
                style_of_play?: string | undefined;
                testing_duration?: string | undefined;
                testing_quantity?: string | undefined;
                testing_type?: string | undefined;
                other_equipment?: string | undefined;
                purchase_location?: string | undefined;
                purchase_price?: string | undefined;
            };
            created_at: string;
            updated_at: string;
            equipment?: {
                id: string;
                name: string;
                slug: string;
                category: "blade" | "rubber" | "ball";
                subcategory?: "inverted" | "long_pips" | "anti" | "short_pips" | undefined;
                manufacturer: string;
                specifications: {
                    [x: string]: never;
                };
                created_at: string;
                updated_at: string;
            } | undefined;
        };
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">) | (Response & import("hono").TypedResponse<{
        success: false;
        error: string;
    }, 500, "json">)>;
    static getModerationStats(c: Context<BindingsEnv & {
        Variables: EnhancedAuthVariables;
    }>): Promise<(Response & import("hono").TypedResponse<{
        success: true;
        data: {
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
        };
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">) | (Response & import("hono").TypedResponse<{
        success: false;
        error: string;
    }, 500, "json">)>;
    static getPendingPlayerEdits(c: Context<BindingsEnv & {
        Variables: EnhancedAuthVariables;
    }>): Promise<(Response & import("hono").TypedResponse<{
        success: true;
        data: {
            playerEdits: {
                id: string;
                player_id: string;
                user_id: string;
                edit_data: {
                    id?: string | undefined;
                    name?: string | undefined;
                    slug?: string | undefined;
                    highest_rating?: string | undefined;
                    active_years?: string | undefined;
                    active?: boolean | undefined;
                    playing_style?: "attacker" | "all_rounder" | "defender" | "counter_attacker" | "chopper" | "unknown" | undefined;
                    birth_country?: string | undefined;
                    represents?: string | undefined;
                    created_at?: string | undefined;
                    updated_at?: string | undefined;
                };
                status: "pending" | "approved" | "rejected" | "awaiting_second_approval";
                moderator_id?: string | undefined;
                moderator_notes?: string | undefined;
                created_at: string;
                updated_at: string;
                players?: {
                    id: string;
                    name: string;
                    slug: string;
                    highest_rating?: string | undefined;
                    active_years?: string | undefined;
                    active: boolean;
                    playing_style?: "attacker" | "all_rounder" | "defender" | "counter_attacker" | "chopper" | "unknown" | undefined;
                    birth_country?: string | undefined;
                    represents?: string | undefined;
                    created_at: string;
                    updated_at: string;
                } | undefined;
            }[];
            total: number;
        };
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">) | (Response & import("hono").TypedResponse<{
        success: false;
        error: string;
    }, 500, "json">)>;
    static approvePlayerEdit(c: Context<BindingsEnv & {
        Variables: EnhancedAuthVariables;
    }>): Promise<(Response & import("hono").TypedResponse<{
        success: false;
        error: string;
    }, 500 | 400, "json">) | (Response & import("hono").TypedResponse<{
        success: true;
        message: string;
        status: "error" | "approved" | "already_approved";
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">)>;
    static rejectPlayerEdit(c: Context<BindingsEnv & {
        Variables: EnhancedAuthVariables;
    }>): Promise<(Response & import("hono").TypedResponse<{
        success: false;
        error: string;
    }, 400, "json">) | (Response & import("hono").TypedResponse<{
        success: false;
        error: string;
    }, 500, "json">) | (Response & import("hono").TypedResponse<{
        success: true;
        message: string;
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">)>;
    static getPlayerEdit(c: Context<BindingsEnv & {
        Variables: EnhancedAuthVariables;
    }>): Promise<(Response & import("hono").TypedResponse<{
        success: false;
        error: string;
    }, 400, "json">) | (Response & import("hono").TypedResponse<{
        success: false;
        error: string;
    }, 404, "json">) | (Response & import("hono").TypedResponse<{
        success: true;
        data: {
            id: string;
            player_id: string;
            user_id: string;
            edit_data: {
                id?: string | undefined;
                name?: string | undefined;
                slug?: string | undefined;
                highest_rating?: string | undefined;
                active_years?: string | undefined;
                active?: boolean | undefined;
                playing_style?: "attacker" | "all_rounder" | "defender" | "counter_attacker" | "chopper" | "unknown" | undefined;
                birth_country?: string | undefined;
                represents?: string | undefined;
                created_at?: string | undefined;
                updated_at?: string | undefined;
            };
            status: "pending" | "approved" | "rejected" | "awaiting_second_approval";
            moderator_id?: string | undefined;
            moderator_notes?: string | undefined;
            created_at: string;
            updated_at: string;
            players?: {
                id: string;
                name: string;
                slug: string;
                highest_rating?: string | undefined;
                active_years?: string | undefined;
                active: boolean;
                playing_style?: "attacker" | "all_rounder" | "defender" | "counter_attacker" | "chopper" | "unknown" | undefined;
                birth_country?: string | undefined;
                represents?: string | undefined;
                created_at: string;
                updated_at: string;
            } | undefined;
        };
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">) | (Response & import("hono").TypedResponse<{
        success: false;
        error: string;
    }, 500, "json">)>;
    static getPendingEquipmentSubmissions(c: Context<BindingsEnv & {
        Variables: EnhancedAuthVariables;
    }>): Promise<(Response & import("hono").TypedResponse<{
        success: true;
        data: {
            equipmentSubmissions: {
                id: string;
                user_id: string;
                name: string;
                manufacturer: string;
                category: "blade" | "rubber" | "ball";
                subcategory?: "inverted" | "long_pips" | "anti" | "short_pips" | undefined;
                specifications: {
                    [x: string]: never;
                };
                status: "pending" | "approved" | "rejected";
                moderator_id?: string | undefined;
                moderator_notes?: string | undefined;
                created_at: string;
                updated_at: string;
            }[];
            total: number;
        };
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">) | (Response & import("hono").TypedResponse<{
        success: false;
        error: string;
    }, 500, "json">)>;
    static approveEquipmentSubmission(c: Context<BindingsEnv & {
        Variables: EnhancedAuthVariables;
    }>): Promise<(Response & import("hono").TypedResponse<{
        success: false;
        error: string;
    }, 500 | 400, "json">) | (Response & import("hono").TypedResponse<{
        success: true;
        message: string;
        status: "error" | "approved" | "already_approved";
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">)>;
    static rejectEquipmentSubmission(c: Context<BindingsEnv & {
        Variables: EnhancedAuthVariables;
    }>): Promise<(Response & import("hono").TypedResponse<{
        success: false;
        error: string;
    }, 400, "json">) | (Response & import("hono").TypedResponse<{
        success: false;
        error: string;
    }, 500, "json">) | (Response & import("hono").TypedResponse<{
        success: true;
        message: string;
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">)>;
    static getEquipmentSubmission(c: Context<BindingsEnv & {
        Variables: EnhancedAuthVariables;
    }>): Promise<(Response & import("hono").TypedResponse<{
        success: false;
        error: string;
    }, 400, "json">) | (Response & import("hono").TypedResponse<{
        success: false;
        error: string;
    }, 404, "json">) | (Response & import("hono").TypedResponse<{
        success: true;
        data: {
            id: string;
            user_id: string;
            name: string;
            manufacturer: string;
            category: "blade" | "rubber" | "ball";
            subcategory?: "inverted" | "long_pips" | "anti" | "short_pips" | undefined;
            specifications: {
                [x: string]: never;
            };
            status: "pending" | "approved" | "rejected";
            moderator_id?: string | undefined;
            moderator_notes?: string | undefined;
            created_at: string;
            updated_at: string;
        };
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">) | (Response & import("hono").TypedResponse<{
        success: false;
        error: string;
    }, 500, "json">)>;
}
//# sourceMappingURL=moderation.controller.d.ts.map