import { describe, it, expect, vi, beforeEach } from 'vitest';
import { discordController } from './discord.controller';
import { DiscordService } from '../services/discord.service';
import { validateEnvironment } from '../config/environment';
import { createSupabaseClient } from '../config/database';
// Mock dependencies
vi.mock('../services/discord.service');
vi.mock('../config/environment');
vi.mock('../config/database');
describe('Discord Controller', () => {
    let mockContext;
    let mockDiscordService;
    beforeEach(() => {
        mockContext = {
            req: {
                header: vi.fn(),
                text: vi.fn(),
                json: vi.fn(),
            },
            json: vi.fn(),
            status: vi.fn().mockReturnThis(),
            env: {
                DISCORD_PUBLIC_KEY: 'mock-key',
                DISCORD_WEBHOOK_URL: 'https://discord.com/webhook',
            },
        };
        mockDiscordService = {
            verifySignature: vi.fn(),
            handleSlashCommand: vi.fn(),
            handleMessageComponent: vi.fn(),
            handlePrefixCommand: vi.fn(),
            notifyNewReview: vi.fn(),
            notifyReviewApproved: vi.fn(),
            notifyReviewRejected: vi.fn(),
        };
        vi.mocked(DiscordService).mockImplementation(() => mockDiscordService);
        vi.mocked(validateEnvironment).mockReturnValue(mockContext.env);
        vi.mocked(createSupabaseClient).mockReturnValue({});
        vi.clearAllMocks();
    });
    describe('handleInteractions', () => {
        it('should return 401 for missing signature headers', async () => {
            mockContext.req.header.mockReturnValue(null);
            await discordController.handleInteractions(mockContext);
            expect(mockContext.json).toHaveBeenCalledWith({ error: 'Missing signature headers' }, 401);
        });
        it('should return 401 for invalid signature', async () => {
            mockContext.req.header.mockReturnValueOnce('mock-signature').mockReturnValueOnce('1234567890');
            mockContext.req.text.mockResolvedValue('{"type": 1}');
            mockDiscordService.verifySignature.mockResolvedValue(false);
            await discordController.handleInteractions(mockContext);
            expect(mockContext.json).toHaveBeenCalledWith({ error: 'Invalid signature' }, 401);
        });
        it('should handle ping challenge (type 1)', async () => {
            mockContext.req.header.mockReturnValueOnce('mock-signature').mockReturnValueOnce('1234567890');
            mockContext.req.text.mockResolvedValue('{"type": 1}');
            mockDiscordService.verifySignature.mockResolvedValue(true);
            await discordController.handleInteractions(mockContext);
            expect(mockContext.json).toHaveBeenCalledWith({ type: 1 });
        });
        it('should handle application commands (type 2)', async () => {
            const mockResponse = new globalThis.Response(JSON.stringify({ type: 4, data: { content: 'Success' } }));
            mockContext.req.header.mockReturnValueOnce('mock-signature').mockReturnValueOnce('1234567890');
            mockContext.req.text.mockResolvedValue('{"type": 2, "data": {"name": "equipment"}}');
            mockDiscordService.verifySignature.mockResolvedValue(true);
            mockDiscordService.handleSlashCommand.mockResolvedValue(mockResponse);
            await discordController.handleInteractions(mockContext);
            expect(mockDiscordService.handleSlashCommand).toHaveBeenCalledWith({
                type: 2,
                data: { name: 'equipment' },
            });
        });
        it('should handle message components (type 3)', async () => {
            const mockResponse = new globalThis.Response(JSON.stringify({ type: 4, data: { content: 'Component handled' } }));
            mockContext.req.header.mockReturnValueOnce('mock-signature').mockReturnValueOnce('1234567890');
            mockContext.req.text.mockResolvedValue('{"type": 3, "data": {"custom_id": "approve_123"}}');
            mockDiscordService.verifySignature.mockResolvedValue(true);
            mockDiscordService.handleMessageComponent.mockResolvedValue(mockResponse);
            await discordController.handleInteractions(mockContext);
            expect(mockDiscordService.handleMessageComponent).toHaveBeenCalledWith({
                type: 3,
                data: { custom_id: 'approve_123' },
            });
        });
        it('should return 400 for unknown interaction type', async () => {
            mockContext.req.header.mockReturnValueOnce('mock-signature').mockReturnValueOnce('1234567890');
            mockContext.req.text.mockResolvedValue('{"type": 99}');
            mockDiscordService.verifySignature.mockResolvedValue(true);
            await discordController.handleInteractions(mockContext);
            expect(mockContext.json).toHaveBeenCalledWith({ error: 'Unknown interaction type' }, 400);
        });
        it('should handle errors gracefully', async () => {
            mockContext.req.header.mockImplementation(() => {
                throw new Error('Header error');
            });
            await discordController.handleInteractions(mockContext);
            expect(mockContext.json).toHaveBeenCalledWith({ error: 'Internal server error' }, 500);
        });
    });
    describe('handleMessages', () => {
        it('should handle prefix commands', async () => {
            const messageBody = {
                content: '!equipment butterfly',
                member: { roles: ['moderator'] },
                guild_id: 'guild-123',
            };
            mockContext.req.json.mockResolvedValue(messageBody);
            mockDiscordService.handlePrefixCommand.mockResolvedValue({
                content: 'Search results for butterfly',
            });
            await discordController.handleMessages(mockContext);
            expect(mockDiscordService.handlePrefixCommand).toHaveBeenCalledWith(messageBody);
            expect(mockContext.json).toHaveBeenCalledWith({
                content: 'Search results for butterfly',
            });
        });
        it('should return no action message when no command is handled', async () => {
            const messageBody = {
                content: 'Hello world',
                member: { roles: ['user'] },
                guild_id: 'guild-123',
            };
            mockContext.req.json.mockResolvedValue(messageBody);
            mockDiscordService.handlePrefixCommand.mockResolvedValue(null);
            await discordController.handleMessages(mockContext);
            expect(mockContext.json).toHaveBeenCalledWith({ message: 'No action taken' });
        });
        it('should handle non-string content', async () => {
            const messageBody = { content: 123 };
            mockContext.req.json.mockResolvedValue(messageBody);
            await discordController.handleMessages(mockContext);
            expect(mockContext.json).toHaveBeenCalledWith({ message: 'No action taken' });
        });
        it('should handle errors', async () => {
            mockContext.req.json.mockRejectedValue(new Error('JSON parse error'));
            await discordController.handleMessages(mockContext);
            expect(mockContext.json).toHaveBeenCalledWith({ error: 'Internal server error' }, 500);
        });
    });
    describe('sendNotification', () => {
        it('should send new review notification', async () => {
            const notificationData = {
                type: 'new_review',
                data: {
                    id: 'review-123',
                    equipment_name: 'Butterfly Tenergy 05',
                    overall_rating: 8,
                    reviewer_name: 'test@example.com',
                },
            };
            mockContext.req.json.mockResolvedValue(notificationData);
            mockDiscordService.notifyNewReview.mockResolvedValue({ success: true });
            await discordController.sendNotification(mockContext);
            expect(mockDiscordService.notifyNewReview).toHaveBeenCalledWith(notificationData.data);
            // Note: successResponse is mocked, so we just verify it was called
        });
        it('should send review approved notification', async () => {
            const notificationData = {
                type: 'review_approved',
                data: { id: 'review-123', moderator: 'mod1' },
            };
            mockContext.req.json.mockResolvedValue(notificationData);
            mockDiscordService.notifyReviewApproved.mockResolvedValue({ success: true });
            await discordController.sendNotification(mockContext);
            expect(mockDiscordService.notifyReviewApproved).toHaveBeenCalledWith(notificationData.data);
        });
        it('should send review rejected notification', async () => {
            const notificationData = {
                type: 'review_rejected',
                data: { id: 'review-123', moderator: 'mod1', reason: 'Inappropriate content' },
            };
            mockContext.req.json.mockResolvedValue(notificationData);
            mockDiscordService.notifyReviewRejected.mockResolvedValue({ success: true });
            await discordController.sendNotification(mockContext);
            expect(mockDiscordService.notifyReviewRejected).toHaveBeenCalledWith(notificationData.data);
        });
        it('should return 400 for unknown notification type', async () => {
            const notificationData = {
                type: 'unknown_type',
                data: {},
            };
            mockContext.req.json.mockResolvedValue(notificationData);
            await discordController.sendNotification(mockContext);
            expect(mockContext.json).toHaveBeenCalledWith({ error: 'Unknown notification type' }, 400);
        });
        it('should handle errors', async () => {
            mockContext.req.json.mockRejectedValue(new Error('JSON error'));
            await discordController.sendNotification(mockContext);
            expect(mockContext.json).toHaveBeenCalledWith({ error: 'Internal server error' }, 500);
        });
    });
});
