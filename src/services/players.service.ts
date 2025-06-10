import { SupabaseClient } from '@supabase/supabase-js'
import { Player, PlayerEquipmentSetup } from '../types/database'

export class PlayersService {
  constructor(private supabase: SupabaseClient) {}

  async getPlayer(slug: string): Promise<Player | null> {
    const { data, error } = await this.supabase
      .from('players')
      .select('*')
      .eq('slug', slug)
      .single()

    if (error) {
      console.error('Error fetching player:', error)
      return null
    }

    return data as Player
  }

  async getPlayerEquipmentSetups(playerId: string): Promise<PlayerEquipmentSetup[]> {
    const { data, error } = await this.supabase
      .from('player_equipment_setups')
      .select(
        `
        *,
        blade:blade_id(name, slug),
        forehand_rubber:forehand_rubber_id(name, slug),
        backhand_rubber:backhand_rubber_id(name, slug)
      `
      )
      .eq('player_id', playerId)
      .eq('verified', true)
      .order('year', { ascending: false })

    if (error) {
      console.error('Error fetching player equipment setups:', error)
      return []
    }

    return (data as PlayerEquipmentSetup[]) || []
  }

  async getAllPlayers(): Promise<Player[]> {
    const { data, error } = await this.supabase
      .from('players')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching players:', error)
      return []
    }

    return (data as Player[]) || []
  }

  async searchPlayers(query: string): Promise<Player[]> {
    const { data, error } = await this.supabase
      .from('players')
      .select('*')
      .textSearch('name', query)
      .limit(10)

    if (error) {
      console.error('Error searching players:', error)
      return []
    }

    return (data as Player[]) || []
  }

  async createPlayer(
    playerData: Omit<Player, 'id' | 'created_at' | 'updated_at'>
  ): Promise<Player | null> {
    // Generate slug from name
    const slug = playerData.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()

    const { data, error } = await this.supabase
      .from('players')
      .insert({
        ...playerData,
        slug,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating player:', error)
      return null
    }

    return data as Player
  }

  async updatePlayer(slug: string, playerData: Partial<Player>): Promise<Player | null> {
    const { data, error } = await this.supabase
      .from('players')
      .update(playerData)
      .eq('slug', slug)
      .select()
      .single()

    if (error) {
      console.error('Error updating player:', error)
      return null
    }

    return data as Player
  }

  async createPlayerEquipmentSetup(setupData: {
    player_id: string
    year: number
    blade_id?: string
    forehand_rubber_id?: string
    forehand_thickness?: string
    forehand_color?: 'red' | 'black'
    backhand_rubber_id?: string
    backhand_thickness?: string
    backhand_color?: 'red' | 'black'
    source_url?: string
    source_type?: 'interview' | 'video' | 'tournament_footage' | 'official_website'
  }): Promise<boolean> {
    const { error } = await this.supabase.from('player_equipment_setups').insert({
      ...setupData,
      verified: false, // New submissions need verification
    })

    if (error) {
      console.error('Error creating equipment setup:', error)
      return false
    }

    return true
  }

  async addEquipmentSetup(
    playerId: string,
    setupData: {
      year?: number
      blade_name?: string
      blade_id?: string
      forehand_rubber_name?: string
      forehand_rubber_id?: string
      forehand_thickness?: string
      forehand_color?: 'red' | 'black'
      backhand_rubber_name?: string
      backhand_rubber_id?: string
      backhand_thickness?: string
      backhand_color?: 'red' | 'black'
      source_url?: string
      source_type?: 'interview' | 'video' | 'tournament_footage' | 'official_website'
    }
  ): Promise<boolean> {
    // Convert equipment names to IDs by finding or creating equipment
    const processedSetup: {
      player_id: string
      year: number
      blade_id?: string
      forehand_rubber_id?: string
      forehand_thickness?: string
      forehand_color?: 'red' | 'black'
      backhand_rubber_id?: string
      backhand_thickness?: string
      backhand_color?: 'red' | 'black'
      source_url?: string
      source_type?: 'interview' | 'video' | 'tournament_footage' | 'official_website'
    } = {
      player_id: playerId,
      year: setupData.year || new Date().getFullYear(),
    }

    // Handle blade
    if (setupData.blade_name) {
      processedSetup.blade_id = await this.findOrCreateEquipment(setupData.blade_name, 'blade')
    } else if (setupData.blade_id) {
      processedSetup.blade_id = setupData.blade_id
    }

    // Handle forehand rubber
    if (setupData.forehand_rubber_name) {
      processedSetup.forehand_rubber_id = await this.findOrCreateEquipment(
        setupData.forehand_rubber_name,
        'rubber'
      )
      processedSetup.forehand_thickness = setupData.forehand_thickness
      processedSetup.forehand_color = setupData.forehand_color
    } else if (setupData.forehand_rubber_id) {
      processedSetup.forehand_rubber_id = setupData.forehand_rubber_id
      processedSetup.forehand_thickness = setupData.forehand_thickness
      processedSetup.forehand_color = setupData.forehand_color
    }

    // Handle backhand rubber
    if (setupData.backhand_rubber_name) {
      processedSetup.backhand_rubber_id = await this.findOrCreateEquipment(
        setupData.backhand_rubber_name,
        'rubber'
      )
      processedSetup.backhand_thickness = setupData.backhand_thickness
      processedSetup.backhand_color = setupData.backhand_color
    } else if (setupData.backhand_rubber_id) {
      processedSetup.backhand_rubber_id = setupData.backhand_rubber_id
      processedSetup.backhand_thickness = setupData.backhand_thickness
      processedSetup.backhand_color = setupData.backhand_color
    }

    // Add source information
    if (setupData.source_url) processedSetup.source_url = setupData.source_url
    if (setupData.source_type) processedSetup.source_type = setupData.source_type

    return this.createPlayerEquipmentSetup(processedSetup)
  }

  private async findOrCreateEquipment(
    name: string,
    category: 'blade' | 'rubber'
  ): Promise<string | undefined> {
    if (!name.trim()) return undefined

    // First try to find existing equipment
    const { data: existing } = await this.supabase
      .from('equipment')
      .select('id')
      .eq('name', name.trim())
      .eq('category', category)
      .single()

    if (existing) {
      return existing.id
    }

    // Create new equipment if not found
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()

    const { data: newEquipment, error } = await this.supabase
      .from('equipment')
      .insert({
        name: name.trim(),
        slug,
        category,
        manufacturer: 'Unknown', // Default manufacturer for user-submitted equipment
      })
      .select('id')
      .single()

    if (error) {
      console.error(`Error creating ${category}:`, error)
      return undefined
    }

    return newEquipment?.id
  }
}
