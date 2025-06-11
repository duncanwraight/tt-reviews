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
