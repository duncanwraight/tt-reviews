import { Context } from 'hono';
import { EnhancedAuthVariables } from '../middleware/auth-enhanced';
import { SecureAuthVariables } from '../middleware/auth-secure';
export declare class AuthController {
    static signUp(c: Context): Promise<Response & import("hono").TypedResponse<{
        error: string;
        code: string | undefined;
        timestamp: string;
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
    static signIn(c: Context): Promise<Response & import("hono").TypedResponse<{
        error: string;
        code: string | undefined;
        timestamp: string;
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
    static signOut(c: Context): Promise<Response & import("hono").TypedResponse<{
        error: string;
        code: string | undefined;
        timestamp: string;
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
    static getUser(c: Context): Promise<Response & import("hono").TypedResponse<{
        error: string;
        code: string | undefined;
        timestamp: string;
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
    static resetPassword(c: Context): Promise<Response & import("hono").TypedResponse<{
        error: string;
        code: string | undefined;
        timestamp: string;
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
    static getProfile(c: Context<{
        Variables: EnhancedAuthVariables;
    }>): Promise<Response & import("hono").TypedResponse<never, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
    static getMe(c: Context): Promise<Response & import("hono").TypedResponse<{
        error: string;
        code: string | undefined;
        timestamp: string;
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
    /**
     * Secure cookie-based sign in
     */
    static signInSecure(c: Context<{
        Variables: SecureAuthVariables;
    }>): Promise<Response & import("hono").TypedResponse<{
        error: string;
        code: string | undefined;
        timestamp: string;
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
    /**
     * Secure cookie-based sign out
     */
    static signOutSecure(c: Context<{
        Variables: SecureAuthVariables;
    }>): Promise<Response & import("hono").TypedResponse<{
        error: string;
        code: string | undefined;
        timestamp: string;
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
    /**
     * Get current user info for cookie-authenticated requests
     */
    static getMeSecure(c: Context<{
        Variables: SecureAuthVariables;
    }>): Promise<Response & import("hono").TypedResponse<{
        error: string;
        code: string | undefined;
        timestamp: string;
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
    /**
     * Get CSRF token for form authentication
     */
    static getCSRFToken(c: Context<{
        Variables: Partial<SecureAuthVariables>;
    }>): Promise<Response & import("hono").TypedResponse<{
        error: string;
        code: string | undefined;
        timestamp: string;
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
}
//# sourceMappingURL=auth.controller.d.ts.map