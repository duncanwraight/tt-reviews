import { SupabaseClient, User, Session } from '@supabase/supabase-js';
import { Environment } from '../types/environment.js';
export declare class AuthService {
    private supabase;
    private env?;
    constructor(supabase: SupabaseClient, env?: Environment | undefined);
    signUp(email: string, password: string): Promise<{
        user: User | null;
        error: Error | null;
    }>;
    signIn(email: string, password: string): Promise<{
        user: User | null;
        session: Session | null;
        error: Error | null;
    }>;
    signOut(): Promise<{
        error: Error | null;
    }>;
    getUser(): Promise<{
        user: User | null;
        error: Error | null;
    }>;
    getSession(): Promise<{
        session: Session | null;
        error: Error | null;
    }>;
    resetPassword(email: string): Promise<{
        error: Error | null;
    }>;
    isAdmin(user: User | null): boolean;
    requireAdmin(): Promise<{
        user: User | null;
        isAdmin: boolean;
        error: Error | null;
    }>;
}
//# sourceMappingURL=auth.service.d.ts.map