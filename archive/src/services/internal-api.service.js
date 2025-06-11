/**
 * Internal API service for making server-to-server calls within the same application
 * This allows SSR routes to use the same API endpoints without external HTTP calls
 */
import { EquipmentService } from './equipment.service';
import { PlayerService } from '../lib/supabase';
import { ModerationService } from './moderation.service';
import { createAuthService } from './auth-wrapper.service';
export class InternalApiService {
    authService;
    constructor(c) {
        this.authService = createAuthService(c);
    }
    /**
     * Equipment operations
     */
    async getEquipment(slug) {
        const supabase = this.authService.createServerClient();
        const equipmentService = new EquipmentService(supabase);
        return equipmentService.getEquipment(slug);
    }
    async getEquipmentReviews(equipmentId) {
        const supabase = this.authService.createServerClient();
        const equipmentService = new EquipmentService(supabase);
        return equipmentService.getEquipmentReviews(equipmentId, 'approved');
    }
    async getRecentEquipment(limit = 8) {
        const supabase = this.authService.createServerClient();
        const equipmentService = new EquipmentService(supabase);
        return equipmentService.getRecentEquipment(limit);
    }
    async getRecentReviews(limit = 6) {
        const supabase = this.authService.createServerClient();
        const equipmentService = new EquipmentService(supabase);
        return equipmentService.getRecentReviews(limit);
    }
    async getEquipmentCategories() {
        const supabase = this.authService.createServerClient();
        const equipmentService = new EquipmentService(supabase);
        return equipmentService.getEquipmentCategories();
    }
    async searchEquipment(query) {
        const supabase = this.authService.createServerClient();
        const equipmentService = new EquipmentService(supabase);
        return equipmentService.searchEquipment(query);
    }
    /**
     * Player operations
     */
    async getPlayer(slug) {
        const supabase = this.authService.createServerClient();
        const playerService = new PlayerService(supabase);
        return playerService.getPlayer(slug);
    }
    async getPlayerEquipmentSetups(playerId) {
        const supabase = this.authService.createServerClient();
        const playerService = new PlayerService(supabase);
        return playerService.getPlayerEquipmentSetups(playerId);
    }
    async getAllPlayers() {
        const supabase = this.authService.createServerClient();
        const playerService = new PlayerService(supabase);
        return playerService.getAllPlayers();
    }
    async searchPlayers(query) {
        const supabase = this.authService.createServerClient();
        const playerService = new PlayerService(supabase);
        return playerService.searchPlayers(query);
    }
    /**
     * Admin/Moderation operations (require service role for admin access)
     */
    async getModerationStats() {
        const supabase = this.authService.createAdminClient();
        const moderationService = new ModerationService(supabase);
        return moderationService.getModerationStats();
    }
    async getPendingReviews(limit = 50, offset = 0) {
        const supabase = this.authService.createAdminClient();
        const moderationService = new ModerationService(supabase);
        return moderationService.getPendingReviews(limit, offset);
    }
    async getPendingPlayerEdits(limit = 50, offset = 0) {
        const supabase = this.authService.createAdminClient();
        const moderationService = new ModerationService(supabase);
        return moderationService.getPendingPlayerEdits(limit, offset);
    }
    async getPendingEquipmentSubmissions(limit = 50, offset = 0) {
        const supabase = this.authService.createAdminClient();
        const moderationService = new ModerationService(supabase);
        return moderationService.getPendingEquipmentSubmissions(limit, offset);
    }
}
