import { EquipmentService } from '../services/equipment.service.js';
import { DiscordService } from '../services/discord.service.js';
import { createAuthService } from '../services/auth-wrapper.service.js';
import { EquipmentSubmitPage } from '../components/pages/EquipmentSubmitPage.jsx';
export async function showEquipmentSubmitForm(c) {
    try {
        const baseUrl = new globalThis.URL(c.req.url).origin;
        // For web pages, authentication is handled client-side via localStorage session
        // The page will redirect to login if no session exists
        return c.html(EquipmentSubmitPage({ baseUrl, user: undefined })?.toString() || 'Error rendering page');
    }
    catch (error) {
        console.error('Error showing equipment submit form:', error);
        return c.html('Internal server error', 500);
    }
}
export async function submitEquipment(c) {
    try {
        const user = c.get('user');
        const authService = createAuthService(c);
        const body = await c.req.parseBody();
        // Validate required fields
        if (!body.name || !body.manufacturer || !body.category) {
            return c.json({
                success: false,
                error: 'Please fill in all required fields (name, manufacturer, and category).',
            }, 400);
        }
        // Parse specifications if provided
        let specifications = {};
        if (body.specifications &&
            typeof body.specifications === 'string' &&
            body.specifications.trim()) {
            try {
                // For now, just store as a simple description
                specifications = { description: body.specifications.trim() };
            }
            catch {
                // If parsing fails, store as description
                specifications = { description: body.specifications.toString() };
            }
        }
        const equipmentData = {
            name: body.name.toString().trim(),
            manufacturer: body.manufacturer.toString().trim(),
            category: body.category.toString(),
            subcategory: body.subcategory && body.subcategory.toString().trim()
                ? body.subcategory.toString()
                : undefined,
            specifications,
        };
        // Validate category
        if (!['blade', 'rubber', 'ball'].includes(equipmentData.category)) {
            return c.json({
                success: false,
                error: 'Please select a valid equipment category.',
            }, 400);
        }
        // Validate subcategory if provided
        if (equipmentData.subcategory &&
            !['inverted', 'long_pips', 'anti', 'short_pips'].includes(equipmentData.subcategory)) {
            return c.json({
                success: false,
                error: 'Please select a valid equipment subcategory.',
            }, 400);
        }
        const supabase = await authService.getAuthenticatedClient(c);
        const equipmentService = new EquipmentService(supabase);
        const submissionId = await equipmentService.submitEquipment(user.id, equipmentData);
        if (!submissionId) {
            return c.json({
                success: false,
                error: 'Failed to submit equipment. Please try again.',
            }, 400);
        }
        // Send Discord notification for new equipment submission
        try {
            const env = c.env;
            if (env?.DISCORD_WEBHOOK_URL) {
                const discordService = new DiscordService(supabase, env);
                await discordService.notifyNewEquipmentSubmission({
                    id: submissionId,
                    name: equipmentData.name,
                    manufacturer: equipmentData.manufacturer,
                    category: equipmentData.category,
                    subcategory: equipmentData.subcategory,
                    submitter_email: user.email || 'Anonymous',
                });
            }
        }
        catch (error) {
            console.error('Failed to send Discord notification for equipment submission:', error);
            // Don't fail the submission if Discord notification fails
        }
        return c.json({
            success: true,
            message: 'Equipment submitted successfully! Your submission will be reviewed by our moderation team.',
            submissionId,
        });
    }
    catch (error) {
        console.error('Error submitting equipment:', error);
        return c.json({
            success: false,
            error: 'Internal server error. Please try again later.',
        }, 500);
    }
}
