import { SupabaseClient } from '@supabase/supabase-js'
import { Equipment, EquipmentReview, ReviewerContext } from '../types/database.js'

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

  async getEquipmentById(id: string): Promise<Equipment | null> {
    const { data, error } = await this.supabase.from('equipment').select('*').eq('id', id).single()

    if (error) {
      console.error('Error fetching equipment by ID:', error)
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

    return (data as unknown as EquipmentReview[]) || []
  }

  async createReview(
    userId: string,
    equipmentId: string,
    overallRating: number,
    categoryRatings: Record<string, number>,
    reviewText: string | undefined,
    reviewerContext: ReviewerContext
  ): Promise<EquipmentReview | null> {
    const { data, error } = await this.supabase
      .from('equipment_reviews')
      .insert({
        user_id: userId,
        equipment_id: equipmentId,
        overall_rating: overallRating,
        category_ratings: categoryRatings,
        review_text: reviewText,
        reviewer_context: reviewerContext,
        status: 'pending',
      })
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
      .single()

    if (error) {
      console.error('Error creating review:', error)
      return null
    }

    return data as unknown as EquipmentReview
  }

  async getUserReview(userId: string, equipmentId: string): Promise<EquipmentReview | null> {
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
          subcategory
        )
      `
      )
      .eq('user_id', userId)
      .eq('equipment_id', equipmentId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      console.error('Error fetching user review:', error)
      return null
    }

    return data as unknown as EquipmentReview
  }

  async updateReview(
    reviewId: string,
    userId: string,
    overallRating?: number,
    categoryRatings?: Record<string, number>,
    reviewText?: string,
    reviewerContext?: ReviewerContext
  ): Promise<EquipmentReview | null> {
    const updateData: Record<string, unknown> = {}

    if (overallRating !== undefined) updateData.overall_rating = overallRating
    if (categoryRatings !== undefined) updateData.category_ratings = categoryRatings
    if (reviewText !== undefined) updateData.review_text = reviewText
    if (reviewerContext !== undefined) updateData.reviewer_context = reviewerContext

    const { data, error } = await this.supabase
      .from('equipment_reviews')
      .update(updateData)
      .eq('id', reviewId)
      .eq('user_id', userId)
      .eq('status', 'pending')
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
      .single()

    if (error) {
      console.error('Error updating review:', error)
      return null
    }

    return data as unknown as EquipmentReview
  }

  async deleteReview(reviewId: string, userId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('equipment_reviews')
      .delete()
      .eq('id', reviewId)
      .eq('user_id', userId)
      .eq('status', 'pending')

    if (error) {
      console.error('Error deleting review:', error)
      return false
    }

    return true
  }

  async getUserReviews(
    userId: string,
    page = 1,
    limit = 10
  ): Promise<{ reviews: EquipmentReview[]; total: number }> {
    const offset = (page - 1) * limit

    const [reviewsResult, countResult] = await Promise.all([
      this.supabase
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
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1),

      this.supabase
        .from('equipment_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
    ])

    if (reviewsResult.error) {
      console.error('Error fetching user reviews:', reviewsResult.error)
      return { reviews: [], total: 0 }
    }

    const total = countResult.count || 0
    const reviews = (reviewsResult.data as unknown as EquipmentReview[]) || []

    return { reviews, total }
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

    return (data as unknown as Equipment[]) || []
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

    return (data as unknown as EquipmentReview[]) || []
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
}
