import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { AppLoadContext } from 'react-router'

// Database types
export interface Equipment {
  id: string
  name: string
  slug: string
  category: 'blade' | 'rubber' | 'ball'
  subcategory?: 'inverted' | 'long_pips' | 'anti' | 'short_pips'
  manufacturer: string
  specifications: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Player {
  id: string
  name: string
  slug: string
  highest_rating?: string
  active_years?: string
  active: boolean
  playing_style?:
    | 'attacker'
    | 'all_rounder'
    | 'defender'
    | 'counter_attacker'
    | 'chopper'
    | 'unknown'
  birth_country?: string // ISO 3166-1 alpha-3 country code for birth country
  represents?: string // ISO 3166-1 alpha-3 country code for represented country
  created_at: string
  updated_at: string
}

export interface EquipmentReview {
  id: string
  equipment_id: string
  user_id: string
  status: 'pending' | 'approved' | 'rejected'
  overall_rating: number
  category_ratings: Record<string, number>
  review_text?: string
  reviewer_context: ReviewerContext
  created_at: string
  updated_at: string
  equipment?: Equipment
}

export interface ReviewerContext {
  playing_level?: string
  style_of_play?: string
  testing_duration?: string
  testing_quantity?: string
  testing_type?: string
  other_equipment?: string
  purchase_location?: string
  purchase_price?: string
}

export interface PlayerEquipmentSetup {
  id: string
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
  verified: boolean
  created_at: string
  updated_at: string
}

export interface PlayerEdit {
  id: string
  player_id: string
  user_id: string
  edit_data: Partial<Player>
  status: 'pending' | 'approved' | 'rejected' | 'awaiting_second_approval'
  moderator_id?: string
  moderator_notes?: string
  created_at: string
  updated_at: string
  players?: Player
}

export interface EquipmentSubmission {
  id: string
  user_id: string
  name: string
  manufacturer: string
  category: 'blade' | 'rubber' | 'ball'
  subcategory?: 'inverted' | 'long_pips' | 'anti' | 'short_pips'
  specifications: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected'
  moderator_id?: string
  moderator_notes?: string
  created_at: string
  updated_at: string
}

// Supabase client factory
export function createSupabaseClient(context: AppLoadContext): SupabaseClient {
  const env = context.cloudflare.env as Record<string, string>
  const supabaseUrl = env.SUPABASE_URL
  const supabaseKey = env.SUPABASE_ANON_KEY

  console.log('createSupabaseClient: Environment check', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseKey,
    url: supabaseUrl,
    keyLength: supabaseKey?.length
  })

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables')
  }

  console.log('createSupabaseClient: Creating client with URL:', supabaseUrl)
  return createClient(supabaseUrl, supabaseKey)
}

export function createSupabaseAdminClient(context: AppLoadContext): SupabaseClient {
  const env = context.cloudflare.env as Record<string, string>
  const supabaseUrl = env.SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase admin environment variables')
  }

  return createClient(supabaseUrl, serviceRoleKey)
}

// Main database service class
export class DatabaseService {
  private supabase: SupabaseClient

  constructor(context: AppLoadContext) {
    this.supabase = createSupabaseClient(context)
  }

  // Equipment methods
  async getEquipment(slug: string): Promise<Equipment | null> {
    const { data, error } = await this.supabase
      .from('equipment')
      .select('*')
      .eq('slug', slug)
      .single()

    if (error) {
      console.error('Error fetching equipment:', error)
      return null
    }

    return data as Equipment
  }

  async getEquipmentById(id: string): Promise<Equipment | null> {
    const { data, error } = await this.supabase
      .from('equipment')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching equipment by ID:', error)
      return null
    }

    return data as Equipment
  }

  async searchEquipment(query: string): Promise<Equipment[]> {
    const { data, error } = await this.supabase
      .from('equipment')
      .select('*')
      .textSearch('name', query)
      .limit(10)

    if (error) {
      console.error('Error searching equipment:', error)
      return []
    }

    return (data as Equipment[]) || []
  }

  async getRecentEquipment(limit = 10): Promise<Equipment[]> {
    const { data, error } = await this.supabase
      .from('equipment')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching recent equipment:', error)
      return []
    }

    return (data as Equipment[]) || []
  }

  async getEquipmentCategories(): Promise<{ category: string; count: number }[]> {
    const { data, error } = await this.supabase.from('equipment').select('category')

    if (error) {
      console.error('Error fetching equipment categories:', error)
      return []
    }

    const categoryCount: Record<string, number> = {}
    data.forEach(item => {
      categoryCount[item.category] = (categoryCount[item.category] || 0) + 1
    })

    return Object.entries(categoryCount).map(([category, count]) => ({
      category,
      count,
    }))
  }

  // Player methods
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

  // Review methods
  async getEquipmentReviews(
    equipmentId: string,
    status: 'approved' | 'all' = 'approved'
  ): Promise<EquipmentReview[]> {
    let query = this.supabase
      .from('equipment_reviews')
      .select(
        `
        *,
        equipment (
          id,
          name,
          manufacturer,
          category,
          subcategory
        )
      `
      )
      .eq('equipment_id', equipmentId)
      .order('created_at', { ascending: false })

    if (status === 'approved') {
      query = query.eq('status', 'approved')
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching reviews:', error)
      return []
    }

    return (data as EquipmentReview[]) || []
  }

  async getRecentReviews(limit = 10): Promise<EquipmentReview[]> {
    const { data, error } = await this.supabase
      .from('equipment_reviews')
      .select(
        `
        *,
        equipment (
          id,
          name,
          manufacturer,
          category,
          subcategory,
          slug
        )
      `
      )
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching recent reviews:', error)
      return []
    }

    return (data as EquipmentReview[]) || []
  }

  // General search
  async search(query: string): Promise<{
    equipment: Equipment[]
    players: Player[]
  }> {
    const [equipment, players] = await Promise.all([
      this.searchEquipment(query),
      this.searchPlayers(query)
    ])

    return { equipment, players }
  }
}