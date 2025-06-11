import { createClient } from '@supabase/supabase-js';
// Create Supabase client
export function createSupabaseClient(env) {
    const envTyped = env;
    const supabaseUrl = envTyped.SUPABASE_URL;
    const supabaseKey = envTyped.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase environment variables');
    }
    return createClient(supabaseUrl, supabaseKey);
}
// Create admin client for server-side operations
export function createSupabaseAdminClient(env) {
    const envTyped = env;
    const supabaseUrl = envTyped.SUPABASE_URL;
    const serviceRoleKey = envTyped.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing Supabase admin environment variables');
    }
    return createClient(supabaseUrl, serviceRoleKey);
}
// Database operations
export class EquipmentService {
    supabase;
    constructor(supabase) {
        this.supabase = supabase;
    }
    async getEquipment(slug) {
        const { data, error } = await this.supabase
            .from('equipment')
            .select('*')
            .eq('slug', slug)
            .single();
        if (error) {
            console.error('Error fetching equipment:', error);
            return null;
        }
        return data;
    }
    async searchEquipment(query) {
        const { data, error } = await this.supabase
            .from('equipment')
            .select('*')
            .textSearch('name', query)
            .limit(10);
        if (error) {
            console.error('Error searching equipment:', error);
            return [];
        }
        return data || [];
    }
    async getEquipmentReviews(equipmentId, status = 'approved') {
        let query = this.supabase
            .from('equipment_reviews')
            .select('*')
            .eq('equipment_id', equipmentId)
            .order('created_at', { ascending: false });
        if (status === 'approved') {
            query = query.eq('status', 'approved');
        }
        const { data, error } = await query;
        if (error) {
            console.error('Error fetching reviews:', error);
            return [];
        }
        return data || [];
    }
}
export class PlayerService {
    supabase;
    constructor(supabase) {
        this.supabase = supabase;
    }
    async getPlayer(slug) {
        const { data, error } = await this.supabase
            .from('players')
            .select('*')
            .eq('slug', slug)
            .single();
        if (error) {
            console.error('Error fetching player:', error);
            return null;
        }
        return data;
    }
    async getPlayerEquipmentSetups(playerId) {
        const { data, error } = await this.supabase
            .from('player_equipment_setups')
            .select(`
        *,
        blade:blade_id(name, slug),
        forehand_rubber:forehand_rubber_id(name, slug),
        backhand_rubber:backhand_rubber_id(name, slug)
      `)
            .eq('player_id', playerId)
            .eq('verified', true)
            .order('year', { ascending: false });
        if (error) {
            console.error('Error fetching player equipment setups:', error);
            return [];
        }
        return data || [];
    }
    async getAllPlayers() {
        const { data, error } = await this.supabase
            .from('players')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) {
            console.error('Error fetching players:', error);
            return [];
        }
        return data || [];
    }
    async searchPlayers(query) {
        const { data, error } = await this.supabase
            .from('players')
            .select('*')
            .textSearch('name', query)
            .limit(10);
        if (error) {
            console.error('Error searching players:', error);
            return [];
        }
        return data || [];
    }
}
// Authentication service
export class AuthService {
    supabase;
    constructor(supabase) {
        this.supabase = supabase;
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
}
