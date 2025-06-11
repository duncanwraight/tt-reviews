import { EquipmentService, PlayerService } from '../lib/supabase';
import { ModerationService } from './moderation.service';
export class DiscordService {
    supabase;
    env;
    equipmentService;
    playerService;
    moderationService;
    constructor(supabase, env) {
        this.supabase = supabase;
        this.env = env;
        this.equipmentService = new EquipmentService(supabase);
        this.playerService = new PlayerService(supabase);
        this.moderationService = new ModerationService(supabase);
    }
    /**
     * Verify Discord webhook signature
     */
    async verifySignature(signature, timestamp, body) {
        const PUBLIC_KEY = this.env.DISCORD_PUBLIC_KEY;
        if (!PUBLIC_KEY) {
            throw new Error('Discord verification key not configured');
        }
        // Check for placeholder values that indicate misconfiguration
        if (PUBLIC_KEY === 'your_discord_application_public_key_here' || PUBLIC_KEY.length < 32) {
            throw new Error('Discord verification key is not properly configured');
        }
        try {
            // Use global TextEncoder and crypto available in Cloudflare Workers
            const encoder = new globalThis.TextEncoder();
            const data = encoder.encode(timestamp + body);
            const sig = hexToUint8Array(signature);
            // Import the public key
            const crypto = typeof globalThis !== 'undefined' && globalThis.crypto
                ? globalThis.crypto
                : eval('require')('node:crypto').webcrypto;
            const key = await crypto.subtle.importKey('raw', hexToUint8Array(PUBLIC_KEY), {
                name: 'Ed25519',
                namedCurve: 'Ed25519',
            }, false, ['verify']);
            // Verify the signature
            return await crypto.subtle.verify('Ed25519', key, sig, data);
        }
        catch (error) {
            console.error('Signature verification error:', error);
            return false;
        }
    }
    /**
     * Handle Discord slash commands
     */
    async handleSlashCommand(interaction) {
        const { data } = interaction;
        const commandName = data.name;
        // Check user permissions
        const hasPermission = await this.checkUserPermissions(interaction.member, interaction.guild_id);
        if (!hasPermission) {
            return new globalThis.Response(JSON.stringify({
                type: 4,
                data: {
                    content: '❌ You do not have permission to use this command.',
                    flags: 64, // Ephemeral flag
                },
            }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }
        switch (commandName) {
            case 'equipment':
                return await this.handleEquipmentSearch(data.options?.[0]?.value || '');
            case 'player':
                return await this.handlePlayerSearch(data.options?.[0]?.value || '');
            case 'approve':
                return await this.handleApproveReview(data.options?.[0]?.value, interaction.user);
            case 'reject':
                return await this.handleRejectReview(data.options?.[0]?.value, interaction.user);
            default:
                return new globalThis.Response(JSON.stringify({
                    type: 4,
                    data: {
                        content: '❌ Unknown command.',
                        flags: 64,
                    },
                }), {
                    headers: { 'Content-Type': 'application/json' },
                });
        }
    }
    /**
     * Handle Discord prefix commands (!command)
     */
    async handlePrefixCommand(message) {
        const content = message.content.trim();
        // Check user permissions
        const hasPermission = await this.checkUserPermissions(message.member, message.guild_id);
        if (!hasPermission) {
            return {
                content: '❌ You do not have permission to use this command.',
            };
        }
        if (content.startsWith('!equipment ')) {
            const query = content.slice(11).trim();
            return await this.searchEquipment(query);
        }
        if (content.startsWith('!player ')) {
            const query = content.slice(8).trim();
            return await this.searchPlayer(query);
        }
        return null;
    }
    /**
     * Handle equipment search slash command
     */
    async handleEquipmentSearch(query) {
        if (!query.trim()) {
            return new globalThis.Response(JSON.stringify({
                type: 4,
                data: {
                    content: '❌ Please provide a search query. Example: `/equipment query:butterfly`',
                    flags: 64,
                },
            }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }
        const result = await this.searchEquipment(query);
        return new globalThis.Response(JSON.stringify({
            type: 4,
            data: result,
        }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }
    /**
     * Handle player search slash command
     */
    async handlePlayerSearch(query) {
        if (!query.trim()) {
            return new globalThis.Response(JSON.stringify({
                type: 4,
                data: {
                    content: '❌ Please provide a search query. Example: `/player query:messi`',
                    flags: 64,
                },
            }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }
        const result = await this.searchPlayer(query);
        return new globalThis.Response(JSON.stringify({
            type: 4,
            data: result,
        }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }
    /**
     * Search equipment and format for Discord
     */
    async searchEquipment(query) {
        try {
            const equipment = await this.equipmentService.searchEquipment(query);
            if (equipment.length === 0) {
                return {
                    content: `🔍 No equipment found for "${query}"`,
                };
            }
            const results = equipment
                .slice(0, 5)
                .map(item => `**${item.name}** by ${item.manufacturer}\n` +
                `Type: ${item.category}\n` +
                `${this.env.SITE_URL}/equipment/${item.slug}`)
                .join('\n\n');
            return {
                content: `🏓 **Equipment Search Results for "${query}"**\n\n${results}` +
                    (equipment.length > 5 ? `\n\n*Showing top 5 of ${equipment.length} results*` : ''),
            };
        }
        catch (error) {
            console.error('Equipment search error:', error);
            return {
                content: '❌ Error searching equipment. Please try again later.',
            };
        }
    }
    /**
     * Search players and format for Discord
     */
    async searchPlayer(query) {
        try {
            const players = await this.playerService.searchPlayers(query);
            if (players.length === 0) {
                return {
                    content: `🔍 No players found for "${query}"`,
                };
            }
            const results = players
                .slice(0, 5)
                .map(player => `**${player.name}**\n` +
                `Status: ${player.active ? 'Active' : 'Inactive'}\n` +
                `${this.env.SITE_URL}/players/${player.slug}`)
                .join('\n\n');
            return {
                content: `🏓 **Player Search Results for "${query}"**\n\n${results}` +
                    (players.length > 5 ? `\n\n*Showing top 5 of ${players.length} results*` : ''),
            };
        }
        catch (error) {
            console.error('Player search error:', error);
            return {
                content: '❌ Error searching players. Please try again later.',
            };
        }
    }
    /**
     * Handle message components (buttons, select menus)
     */
    async handleMessageComponent(interaction) {
        const customId = interaction.data.custom_id;
        if (customId.startsWith('approve_player_edit_')) {
            const editId = customId.replace('approve_player_edit_', '');
            return await this.handleApprovePlayerEdit(editId, interaction.user);
        }
        if (customId.startsWith('reject_player_edit_')) {
            const editId = customId.replace('reject_player_edit_', '');
            return await this.handleRejectPlayerEdit(editId, interaction.user);
        }
        if (customId.startsWith('approve_equipment_')) {
            const submissionId = customId.replace('approve_equipment_', '');
            return await this.handleApproveEquipmentSubmission(submissionId, interaction.user);
        }
        if (customId.startsWith('reject_equipment_')) {
            const submissionId = customId.replace('reject_equipment_', '');
            return await this.handleRejectEquipmentSubmission(submissionId, interaction.user);
        }
        if (customId.startsWith('approve_')) {
            const reviewId = customId.replace('approve_', '');
            return await this.handleApproveReview(reviewId, interaction.user);
        }
        if (customId.startsWith('reject_')) {
            const reviewId = customId.replace('reject_', '');
            return await this.handleRejectReview(reviewId, interaction.user);
        }
        return new globalThis.Response(JSON.stringify({
            type: 4,
            data: {
                content: '❌ Unknown interaction.',
                flags: 64,
            },
        }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }
    /**
     * Handle review approval
     */
    async handleApproveReview(reviewId, user) {
        try {
            const result = await this.moderationService.approveReview(reviewId, user.id);
            let message;
            let emoji;
            switch (result.status) {
                case 'first_approval':
                    emoji = '👍';
                    message = `${emoji} **First Approval by ${user.username}**\nReview ${reviewId}: ${result.message}`;
                    break;
                case 'fully_approved':
                    emoji = '✅';
                    message = `${emoji} **Review Fully Approved by ${user.username}**\nReview ${reviewId}: ${result.message}`;
                    break;
                case 'already_approved':
                    emoji = '⚠️';
                    message = `${emoji} **${user.username}**: ${result.message}`;
                    break;
                case 'error':
                default:
                    emoji = '❌';
                    message = `${emoji} **Error**: ${result.message}`;
                    break;
            }
            return new globalThis.Response(JSON.stringify({
                type: 4,
                data: {
                    content: message,
                    flags: result.status === 'already_approved' || result.status === 'error' ? 64 : 0, // Ephemeral for errors/warnings
                },
            }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }
        catch (error) {
            console.error('Error handling approve review:', error);
            return new globalThis.Response(JSON.stringify({
                type: 4,
                data: {
                    content: `❌ **Error**: Failed to process approval`,
                    flags: 64,
                },
            }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }
    /**
     * Handle review rejection
     */
    async handleRejectReview(reviewId, user) {
        try {
            const success = await this.moderationService.rejectReview(reviewId, user.id);
            if (success) {
                return new globalThis.Response(JSON.stringify({
                    type: 4,
                    data: {
                        content: `❌ **Review Rejected by ${user.username}**\nReview ${reviewId} has been rejected and will not be published.`,
                    },
                }), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            else {
                return new globalThis.Response(JSON.stringify({
                    type: 4,
                    data: {
                        content: `❌ **Error**: Failed to reject review ${reviewId}. It may have already been processed.`,
                        flags: 64,
                    },
                }), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        }
        catch (error) {
            console.error('Error handling reject review:', error);
            return new globalThis.Response(JSON.stringify({
                type: 4,
                data: {
                    content: `❌ **Error**: Failed to process rejection`,
                    flags: 64,
                },
            }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }
    /**
     * Handle player edit approval
     */
    async handleApprovePlayerEdit(editId, user) {
        try {
            const result = await this.moderationService.approvePlayerEdit(editId, user.id);
            if (result.success) {
                return new globalThis.Response(JSON.stringify({
                    type: 4,
                    data: {
                        content: `✅ **Player Edit Approved by ${user.username}**\nPlayer edit ${editId}: ${result.message}`,
                    },
                }), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            else {
                let emoji = '⚠️';
                if (result.status === 'error') {
                    emoji = '❌';
                }
                return new globalThis.Response(JSON.stringify({
                    type: 4,
                    data: {
                        content: `${emoji} **Error**: ${result.message}`,
                        flags: 64,
                    },
                }), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        }
        catch (error) {
            console.error('Error handling approve player edit:', error);
            return new globalThis.Response(JSON.stringify({
                type: 4,
                data: {
                    content: `❌ **Error**: Failed to process player edit approval`,
                    flags: 64,
                },
            }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }
    /**
     * Handle player edit rejection
     */
    async handleRejectPlayerEdit(editId, user) {
        try {
            const success = await this.moderationService.rejectPlayerEdit(editId, user.id);
            if (success) {
                return new globalThis.Response(JSON.stringify({
                    type: 4,
                    data: {
                        content: `❌ **Player Edit Rejected by ${user.username}**\nPlayer edit ${editId} has been rejected and changes will not be applied.`,
                    },
                }), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            else {
                return new globalThis.Response(JSON.stringify({
                    type: 4,
                    data: {
                        content: `❌ **Error**: Failed to reject player edit ${editId}. It may have already been processed.`,
                        flags: 64,
                    },
                }), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        }
        catch (error) {
            console.error('Error handling reject player edit:', error);
            return new globalThis.Response(JSON.stringify({
                type: 4,
                data: {
                    content: `❌ **Error**: Failed to process player edit rejection`,
                    flags: 64,
                },
            }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }
    /**
     * Handle equipment submission approval
     */
    async handleApproveEquipmentSubmission(submissionId, user) {
        try {
            const result = await this.moderationService.approveEquipmentSubmission(submissionId, user.id);
            if (result.success) {
                return new globalThis.Response(JSON.stringify({
                    type: 4,
                    data: {
                        content: `✅ **Equipment Approved by ${user.username}**\nEquipment submission ${submissionId}: ${result.message}`,
                    },
                }), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            else {
                let emoji = '⚠️';
                if (result.status === 'error') {
                    emoji = '❌';
                }
                return new globalThis.Response(JSON.stringify({
                    type: 4,
                    data: {
                        content: `${emoji} **Error**: ${result.message}`,
                        flags: 64,
                    },
                }), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        }
        catch (error) {
            console.error('Error handling approve equipment submission:', error);
            return new globalThis.Response(JSON.stringify({
                type: 4,
                data: {
                    content: `❌ **Error**: Failed to process equipment submission approval`,
                    flags: 64,
                },
            }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }
    /**
     * Handle equipment submission rejection
     */
    async handleRejectEquipmentSubmission(submissionId, user) {
        try {
            const success = await this.moderationService.rejectEquipmentSubmission(submissionId, user.id);
            if (success) {
                return new globalThis.Response(JSON.stringify({
                    type: 4,
                    data: {
                        content: `❌ **Equipment Rejected by ${user.username}**\nEquipment submission ${submissionId} has been rejected and will not be published.`,
                    },
                }), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            else {
                return new globalThis.Response(JSON.stringify({
                    type: 4,
                    data: {
                        content: `❌ **Error**: Failed to reject equipment submission`,
                        flags: 64,
                    },
                }), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        }
        catch (error) {
            console.error('Error handling reject equipment submission:', error);
            return new globalThis.Response(JSON.stringify({
                type: 4,
                data: {
                    content: `❌ **Error**: Failed to process equipment submission rejection`,
                    flags: 64,
                },
            }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }
    /**
     * Check if user has required permissions
     */
    async checkUserPermissions(member, guildId) {
        if (!member || !member.roles)
            return false;
        const allowedRoles = this.env.DISCORD_ALLOWED_ROLES?.split(',') || [];
        if (allowedRoles.length === 0) {
            // If no roles configured, allow all users
            return true;
        }
        return member.roles.some((roleId) => allowedRoles.includes(roleId));
    }
    /**
     * Send notification about new review submission
     */
    async notifyNewReview(reviewData) {
        const webhookUrl = this.env.DISCORD_WEBHOOK_URL;
        if (!webhookUrl) {
            throw new Error('DISCORD_WEBHOOK_URL not configured');
        }
        const embed = {
            title: '🆕 New Review Submitted',
            description: `A new review has been submitted and needs moderation.`,
            color: 0x3498db,
            fields: [
                {
                    name: 'Equipment',
                    value: reviewData.equipment_name || 'Unknown',
                    inline: true,
                },
                {
                    name: 'Rating',
                    value: `${reviewData.overall_rating}/10`,
                    inline: true,
                },
                {
                    name: 'Reviewer',
                    value: reviewData.reviewer_name || 'Anonymous',
                    inline: true,
                },
            ],
            timestamp: new Date().toISOString(),
        };
        const components = [
            {
                type: 1, // Action Row
                components: [
                    {
                        type: 2, // Button
                        style: 3, // Success/Green
                        label: 'Approve',
                        custom_id: `approve_${reviewData.id}`,
                    },
                    {
                        type: 2, // Button
                        style: 4, // Danger/Red
                        label: 'Reject',
                        custom_id: `reject_${reviewData.id}`,
                    },
                ],
            },
        ];
        const payload = {
            embeds: [embed],
            components,
        };
        const response = await globalThis.fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        return { success: response.ok };
    }
    /**
     * Send notification about new player edit submission
     */
    async notifyNewPlayerEdit(editData) {
        const webhookUrl = this.env.DISCORD_WEBHOOK_URL;
        if (!webhookUrl) {
            throw new Error('DISCORD_WEBHOOK_URL not configured');
        }
        // Create a summary of the changes
        const changes = [];
        if (editData.edit_data.name)
            changes.push(`Name: ${editData.edit_data.name}`);
        if (editData.edit_data.highest_rating)
            changes.push(`Rating: ${editData.edit_data.highest_rating}`);
        if (editData.edit_data.active_years)
            changes.push(`Active: ${editData.edit_data.active_years}`);
        if (editData.edit_data.active !== undefined)
            changes.push(`Status: ${editData.edit_data.active ? 'Active' : 'Inactive'}`);
        const embed = {
            title: '🏓 Player Edit Submitted',
            description: `A player information update has been submitted and needs moderation.`,
            color: 0xe67e22, // Orange color to distinguish from reviews
            fields: [
                {
                    name: 'Player',
                    value: editData.player_name || 'Unknown Player',
                    inline: true,
                },
                {
                    name: 'Submitted by',
                    value: editData.submitter_email || 'Anonymous',
                    inline: true,
                },
                {
                    name: 'Changes',
                    value: changes.length > 0 ? changes.join('\n') : 'No changes specified',
                    inline: false,
                },
            ],
            timestamp: new Date().toISOString(),
        };
        const components = [
            {
                type: 1, // Action Row
                components: [
                    {
                        type: 2, // Button
                        style: 3, // Success/Green
                        label: 'Approve Edit',
                        custom_id: `approve_player_edit_${editData.id}`,
                    },
                    {
                        type: 2, // Button
                        style: 4, // Danger/Red
                        label: 'Reject Edit',
                        custom_id: `reject_player_edit_${editData.id}`,
                    },
                ],
            },
        ];
        const payload = {
            embeds: [embed],
            components,
        };
        const response = await globalThis.fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        return { success: response.ok };
    }
    /**
     * Send notification about new equipment submission
     */
    async notifyNewEquipmentSubmission(submissionData) {
        const webhookUrl = this.env.DISCORD_WEBHOOK_URL;
        if (!webhookUrl) {
            throw new Error('DISCORD_WEBHOOK_URL not configured');
        }
        const embed = {
            title: '⚙️ Equipment Submission',
            description: `A new equipment submission has been received and needs moderation.`,
            color: 0x9b59b6, // Purple color to distinguish from reviews and player edits
            fields: [
                {
                    name: 'Equipment Name',
                    value: submissionData.name || 'Unknown Equipment',
                    inline: true,
                },
                {
                    name: 'Manufacturer',
                    value: submissionData.manufacturer || 'Unknown',
                    inline: true,
                },
                {
                    name: 'Category',
                    value: submissionData.category
                        ? submissionData.category.charAt(0).toUpperCase() + submissionData.category.slice(1)
                        : 'Unknown',
                    inline: true,
                },
                {
                    name: 'Subcategory',
                    value: submissionData.subcategory || 'N/A',
                    inline: true,
                },
                {
                    name: 'Submitted by',
                    value: submissionData.submitter_email || 'Anonymous',
                    inline: true,
                },
            ],
            timestamp: new Date().toISOString(),
        };
        const components = [
            {
                type: 1, // Action Row
                components: [
                    {
                        type: 2, // Button
                        style: 3, // Success/Green
                        label: 'Approve Equipment',
                        custom_id: `approve_equipment_${submissionData.id}`,
                    },
                    {
                        type: 2, // Button
                        style: 4, // Danger/Red
                        label: 'Reject Equipment',
                        custom_id: `reject_equipment_${submissionData.id}`,
                    },
                ],
            },
        ];
        const payload = {
            embeds: [embed],
            components,
        };
        const response = await globalThis.fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        return { success: response.ok };
    }
    /**
     * Send notification about approved review
     */
    async notifyReviewApproved(reviewData) {
        // TODO: Implement approved review notification
        return { success: true };
    }
    /**
     * Send notification about rejected review
     */
    async notifyReviewRejected(reviewData) {
        // TODO: Implement rejected review notification
        return { success: true };
    }
}
/**
 * Convert hex string to Uint8Array
 */
function hexToUint8Array(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}
