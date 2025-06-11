import { Context } from 'hono';
import { EnhancedAuthVariables } from '../middleware/auth-enhanced';
type HonoContext = Context<{
    Variables: EnhancedAuthVariables;
}>;
export declare const discordController: {
    /**
     * Handle Discord interactions (slash commands, buttons, modals)
     */
    handleInteractions(c: HonoContext): Promise<(Response & import("hono").TypedResponse<{
        error: string;
    }, 401, "json">) | (Response & import("hono").TypedResponse<{
        type: number;
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">) | (Response & import("hono").TypedResponse<{
        error: string;
    }, 400, "json">) | (Response & import("hono").TypedResponse<{
        error: string;
    }, 500, "json">)>;
    /**
     * Handle Discord message events (for prefix commands)
     */
    handleMessages(c: HonoContext): Promise<Response & import("hono").TypedResponse<any, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
    /**
     * Send notification to Discord channel
     */
    sendNotification(c: HonoContext): Promise<(Response & import("hono").TypedResponse<never, import("hono/utils/http-status").ContentfulStatusCode, "json">) | (Response & import("hono").TypedResponse<{
        error: string;
    }, 400, "json">) | (Response & import("hono").TypedResponse<{
        error: string;
    }, 500, "json">)>;
};
export {};
//# sourceMappingURL=discord.controller.d.ts.map