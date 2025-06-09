import { SupabaseClient } from '@supabase/supabase-js'
import { Equipment, EquipmentReview } from '../types/database'

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
