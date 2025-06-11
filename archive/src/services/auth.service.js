export class AuthService {
    supabase;
    env;
    constructor(supabase, env) {
        this.supabase = supabase;
        this.env = env;
    }
    async signUp(email, password) {
        const { data, error } = await this.supabase.auth.signUp({
            email,
            password,
        });
        return {
            user: data.user,
            error: error,
        };
    }
    async signIn(email, password) {
        const { data, error } = await this.supabase.auth.signInWithPassword({
            email,
            password,
        });
        return {
            user: data.user,
            session: data.session,
            error: error,
        };
    }
    async signOut() {
        const { error } = await this.supabase.auth.signOut();
        return { error: error };
    }
    async getUser() {
        const { data, error } = await this.supabase.auth.getUser();
        return {
            user: data.user,
            error: error,
        };
    }
    async getSession() {
        const { data, error } = await this.supabase.auth.getSession();
        return {
            session: data.session,
            error: error,
        };
    }
    async resetPassword(email) {
        const { error } = await this.supabase.auth.resetPasswordForEmail(email);
        return { error: error };
    }
    isAdmin(user) {
        if (!user?.email || !this.env?.ADMIN_EMAILS) {
            return false;
        }
        const adminEmails = this.env.ADMIN_EMAILS.split(',').map(email => email.trim().toLowerCase());
        return adminEmails.includes(user.email.toLowerCase());
    }
    async requireAdmin() {
        const { user, error } = await this.getUser();
        if (error) {
            return { user: null, isAdmin: false, error };
        }
        if (!user) {
            return {
                user: null,
                isAdmin: false,
                error: new Error('Authentication required'),
            };
        }
        const isAdmin = this.isAdmin(user);
        if (!isAdmin) {
            return {
                user,
                isAdmin: false,
                error: new Error('Admin access required'),
            };
        }
        return { user, isAdmin: true, error: null };
    }
}
