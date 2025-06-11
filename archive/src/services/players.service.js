export class PlayersService {
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
    async createPlayer(playerData) {
        // Generate slug from name
        const slug = playerData.name
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim();
        const { data, error } = await this.supabase
            .from('players')
            .insert({
            ...playerData,
            slug,
        })
            .select()
            .single();
        if (error) {
            console.error('Error creating player:', error);
            return null;
        }
        return data;
    }
    async updatePlayer(slug, playerData) {
        const { data, error } = await this.supabase
            .from('players')
            .update(playerData)
            .eq('slug', slug)
            .select()
            .single();
        if (error) {
            console.error('Error updating player:', error);
            return null;
        }
        return data;
    }
    async createPlayerEquipmentSetup(setupData) {
        const { error } = await this.supabase.from('player_equipment_setups').insert({
            ...setupData,
            verified: false, // New submissions need verification
        });
        if (error) {
            console.error('Error creating equipment setup:', error);
            return false;
        }
        return true;
    }
    async addEquipmentSetup(playerId, setupData) {
        // Convert equipment names to IDs by finding or creating equipment
        const processedSetup = {
            player_id: playerId,
            year: setupData.year || new Date().getFullYear(),
        };
        // Handle blade
        if (setupData.blade_name) {
            processedSetup.blade_id = await this.findOrCreateEquipment(setupData.blade_name, 'blade');
        }
        else if (setupData.blade_id) {
            processedSetup.blade_id = setupData.blade_id;
        }
        // Handle forehand rubber
        if (setupData.forehand_rubber_name) {
            processedSetup.forehand_rubber_id = await this.findOrCreateEquipment(setupData.forehand_rubber_name, 'rubber');
            processedSetup.forehand_thickness = setupData.forehand_thickness;
            processedSetup.forehand_color = setupData.forehand_color;
        }
        else if (setupData.forehand_rubber_id) {
            processedSetup.forehand_rubber_id = setupData.forehand_rubber_id;
            processedSetup.forehand_thickness = setupData.forehand_thickness;
            processedSetup.forehand_color = setupData.forehand_color;
        }
        // Handle backhand rubber
        if (setupData.backhand_rubber_name) {
            processedSetup.backhand_rubber_id = await this.findOrCreateEquipment(setupData.backhand_rubber_name, 'rubber');
            processedSetup.backhand_thickness = setupData.backhand_thickness;
            processedSetup.backhand_color = setupData.backhand_color;
        }
        else if (setupData.backhand_rubber_id) {
            processedSetup.backhand_rubber_id = setupData.backhand_rubber_id;
            processedSetup.backhand_thickness = setupData.backhand_thickness;
            processedSetup.backhand_color = setupData.backhand_color;
        }
        // Add source information
        if (setupData.source_url)
            processedSetup.source_url = setupData.source_url;
        if (setupData.source_type)
            processedSetup.source_type = setupData.source_type;
        return this.createPlayerEquipmentSetup(processedSetup);
    }
    async findOrCreateEquipment(name, category) {
        if (!name.trim())
            return undefined;
        // First try to find existing equipment
        const { data: existing } = await this.supabase
            .from('equipment')
            .select('id')
            .eq('name', name.trim())
            .eq('category', category)
            .single();
        if (existing) {
            return existing.id;
        }
        // Create new equipment if not found
        const slug = name
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim();
        const { data: newEquipment, error } = await this.supabase
            .from('equipment')
            .insert({
            name: name.trim(),
            slug,
            category,
            manufacturer: 'Unknown', // Default manufacturer for user-submitted equipment
        })
            .select('id')
            .single();
        if (error) {
            console.error(`Error creating ${category}:`, error);
            return undefined;
        }
        return newEquipment?.id;
    }
    async submitPlayerEdit(playerId, editData, userId) {
        // Submit player edit for moderation
        const { data, error } = await this.supabase
            .from('player_edits')
            .insert({
            player_id: playerId,
            user_id: userId,
            edit_data: editData,
            status: 'pending',
        })
            .select('id')
            .single();
        if (error) {
            console.error('Error submitting player edit:', error);
            return null;
        }
        return data?.id || null;
    }
}
