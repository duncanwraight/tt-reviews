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
    }
  ): Promise<boolean> {
    return this.createPlayerEquipmentSetup({
      player_id: playerId,
      ...setupData,
    })
  }
}
