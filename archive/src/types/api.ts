import { User, Session } from '@supabase/supabase-js'
import { EquipmentReview, Equipment, ReviewerContext } from './database.js'

// Auth API Types
export interface SignUpRequest {
  email: string
  password: string
}

export interface SignInRequest {
  email: string
  password: string
}

export interface ResetPasswordRequest {
  email: string
}

export interface AuthResponse {
  user?: User | null
  session?: Session | null
  message?: string
  error?: string
}

// Equipment API Types
export interface EquipmentResponse {
  equipment: Equipment
  reviews: EquipmentReview[]
}

export interface CreateReviewRequest {
  equipment_id: string
  overall_rating: number
  category_ratings: Record<string, number>
  review_text?: string
  reviewer_context: ReviewerContext
}

export interface UpdateReviewRequest {
  overall_rating?: number
  category_ratings?: Record<string, number>
  review_text?: string
  reviewer_context?: ReviewerContext
}

export interface ReviewsResponse {
  reviews: EquipmentReview[]
  total: number
  page: number
  limit: number
}

// Players API Types
export interface PlayerResponse {
  player: unknown
  equipmentSetups: unknown[]
}

// Search API Types
export interface SearchRequest {
  q: string
}

export interface SearchResponse {
  equipment: unknown[]
  players: unknown[]
}

// Health API Types
export interface HealthResponse {
  status: 'ok' | 'error'
  timestamp: string
  database: 'connected' | 'disconnected' | 'error'
  supabase_url?: string
  error?: string
}

// Error Response
export interface ErrorResponse {
  error: string
  timestamp?: string
}
