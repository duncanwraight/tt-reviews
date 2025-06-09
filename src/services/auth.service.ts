import { SupabaseClient, User, Session } from '@supabase/supabase-js'

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
