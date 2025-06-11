import { Context } from 'hono';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { Environment } from '../types/environment';
export interface AuthContext {
    user: User;
    token: string;
    supabase: SupabaseClient;
    isAdmin: boolean;
}
export declare class AuthWrapperService {
    private env;
    constructor(env: Environment);
    /**
     * Extract and validate Bearer token from Authorization header
     */
    private extractToken;
    /**
     * Create Supabase client with user's access token for RLS
     */
    protected createAuthenticatedClient(token: string): SupabaseClient;
    /**
     * Check if user is admin based on email
     */
    protected isUserAdmin(user: User): boolean;
    /**
     * Validate token and get user information
     */
    protected validateTokenAndGetUser(token: string, supabase: SupabaseClient): Promise<User>;
    /**
     * Get authenticated context from HTTP request
     * This provides the user, token, authenticated Supabase client, and admin status
     */
    getAuthContext(c: Context): Promise<AuthContext>;
    /**
     * Get authenticated Supabase client from HTTP request
     * Convenience method when you only need the client
     */
    getAuthenticatedClient(c: Context): Promise<SupabaseClient>;
    /**
     * Get user from HTTP request
     * Convenience method when you only need user info
     */
    getUser(c: Context): Promise<User>;
    /**
     * Check if current user is admin
     */
    checkIsAdmin(c: Context): Promise<boolean>;
    /**
     * Require admin access - throws if user is not admin
     */
    requireAdmin(c: Context): Promise<AuthContext>;
    /**
     * Create server-side Supabase client (no user context)
     * Use this for operations that don't require user-specific RLS
     */
    createServerClient(): SupabaseClient;
    /**
     * Create admin Supabase client with service role key
     * Use this for admin operations that bypass RLS
     */
    createAdminClient(): SupabaseClient;
}
/**
 * Factory function to create AuthWrapperService instance
 */
export declare function createAuthService(c: Context): AuthWrapperService;
/**
 * Convenience function to get auth context from request
 */
export declare function getAuthContext(c: Context): Promise<AuthContext>;
/**
 * Convenience function to get authenticated Supabase client from request
 */
export declare function getAuthenticatedClient(c: Context): Promise<SupabaseClient>;
//# sourceMappingURL=auth-wrapper.service.d.ts.map