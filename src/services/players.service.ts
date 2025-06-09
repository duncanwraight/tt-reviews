import { SupabaseClient } from '@supabase/supabase-js'
import { Player } from '../types/database'

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

    return data as unknown as Player
  }

  async getPlayerEquipmentSetups(playerId: string): Promise<unknown[]> {
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

    return data || []
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

    return (data as unknown as Player[]) || []
  }
}
