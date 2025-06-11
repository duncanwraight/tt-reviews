import { SupabaseClient } from '@supabase/supabase-js';
import { Environment } from '../types/environment';
export declare class DiscordService {
    private supabase;
    private env;
    private equipmentService;
    private playerService;
    private moderationService;
    constructor(supabase: SupabaseClient, env: Environment);
    /**
     * Verify Discord webhook signature
     */
    verifySignature(signature: string, timestamp: string, body: string): Promise<boolean>;
    /**
     * Handle Discord slash commands
     */
    handleSlashCommand(interaction: any): Promise<globalThis.Response>;
    /**
     * Handle Discord prefix commands (!command)
     */
    handlePrefixCommand(message: any): Promise<any>;
    /**
     * Handle equipment search slash command
     */
    private handleEquipmentSearch;
    /**
     * Handle player search slash command
     */
    private handlePlayerSearch;
    /**
     * Search equipment and format for Discord
     */
    private searchEquipment;
    /**
     * Search players and format for Discord
     */
    private searchPlayer;
    /**
     * Handle message components (buttons, select menus)
     */
    handleMessageComponent(interaction: any): Promise<globalThis.Response>;
    /**
     * Handle review approval
     */
    private handleApproveReview;
    /**
     * Handle review rejection
     */
    private handleRejectReview;
    /**
     * Handle player edit approval
     */
    private handleApprovePlayerEdit;
    /**
     * Handle player edit rejection
     */
    private handleRejectPlayerEdit;
    /**
     * Handle equipment submission approval
     */
    private handleApproveEquipmentSubmission;
    /**
     * Handle equipment submission rejection
     */
    private handleRejectEquipmentSubmission;
    /**
     * Check if user has required permissions
     */
    private checkUserPermissions;
    /**
     * Send notification about new review submission
     */
    notifyNewReview(reviewData: any): Promise<any>;
    /**
     * Send notification about new player edit submission
     */
    notifyNewPlayerEdit(editData: any): Promise<any>;
    /**
     * Send notification about new equipment submission
     */
    notifyNewEquipmentSubmission(submissionData: any): Promise<any>;
    /**
     * Send notification about approved review
     */
    notifyReviewApproved(reviewData: any): Promise<any>;
    /**
     * Send notification about rejected review
     */
    notifyReviewRejected(reviewData: any): Promise<any>;
}
//# sourceMappingURL=discord.service.d.ts.map