import { SupabaseClient, User, Session } from '@supabase/supabase-js'
import { Environment } from '../types/environment.js'

export class AuthService {
  constructor(
    private supabase: SupabaseClient,
    private env?: Environment
  ) {}

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

  isAdmin(user: User | null): boolean {
    if (!user?.email || !this.env?.ADMIN_EMAILS) {
      return false
    }

    const adminEmails = this.env.ADMIN_EMAILS.split(',').map(email => email.trim().toLowerCase())
    return adminEmails.includes(user.email.toLowerCase())
  }

  async requireAdmin(): Promise<{ user: User | null; isAdmin: boolean; error: Error | null }> {
    const { user, error } = await this.getUser()

    if (error) {
      return { user: null, isAdmin: false, error }
    }

    if (!user) {
      return {
        user: null,
        isAdmin: false,
        error: new Error('Authentication required'),
      }
    }

    const isAdmin = this.isAdmin(user)
    if (!isAdmin) {
      return {
        user,
        isAdmin: false,
        error: new Error('Admin access required'),
      }
    }

    return { user, isAdmin: true, error: null }
  }
}
