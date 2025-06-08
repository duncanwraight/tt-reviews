import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js'

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
  reviewer_context: Record<string, unknown>
  created_at: string
  updated_at: string
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

// Create Supabase client
export function createSupabaseClient(env: unknown) {
  const envTyped = env as Record<string, string>
  const supabaseUrl = envTyped.SUPABASE_URL
  const supabaseKey = envTyped.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, supabaseKey)
}

// Create admin client for server-side operations
export function createSupabaseAdminClient(env: unknown) {
  const envTyped = env as Record<string, string>
  const supabaseUrl = envTyped.SUPABASE_URL
  const serviceRoleKey = envTyped.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase admin environment variables')
  }

  return createClient(supabaseUrl, serviceRoleKey)
}

// Database operations
export class EquipmentService {
  constructor(private supabase: SupabaseClient) {}

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

    return data as unknown as Equipment
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

    return (data as unknown as Equipment[]) || []
  }

  async getEquipmentReviews(
    equipmentId: string,
    status: 'approved' | 'all' = 'approved'
  ): Promise<EquipmentReview[]> {
    let query = this.supabase
      .from('equipment_reviews')
      .select('*')
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

    return (data as unknown as EquipmentReview[]) || []
  }
}

export class PlayerService {
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

// Authentication service
export class AuthService {
  constructor(private supabase: SupabaseClient) {}

  async signUp(
    email: string,
    password: string
  ): Promise<{ user: User | null; error: Error | null }> {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
    })

    return {
      user: data.user,
      error: error as Error | null,
    }
  }

  async signIn(
    email: string,
    password: string
  ): Promise<{ user: User | null; session: Session | null; error: Error | null }> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    })

    return {
      user: data.user,
      session: data.session,
      error: error as Error | null,
    }
  }

  async signOut(): Promise<{ error: Error | null }> {
    const { error } = await this.supabase.auth.signOut()
    return { error: error as Error | null }
  }

  async getUser(): Promise<{ user: User | null; error: Error | null }> {
    const { data, error } = await this.supabase.auth.getUser()
    return {
      user: data.user,
      error: error as Error | null,
    }
  }

  async getSession(): Promise<{ session: Session | null; error: Error | null }> {
    const { data, error } = await this.supabase.auth.getSession()
    return {
      session: data.session,
      error: error as Error | null,
    }
  }

  async resetPassword(email: string): Promise<{ error: Error | null }> {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email)
    return { error: error as Error | null }
  }
}
