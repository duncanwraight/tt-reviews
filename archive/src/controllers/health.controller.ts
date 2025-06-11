import { Context } from 'hono'
import { createSupabaseClient } from '../config/database'
import { validateEnvironment } from '../config/environment'
import { successResponse } from '../utils/response'

export class HealthController {
  static async healthCheck(c: Context) {
    const env = validateEnvironment(c.env)
    const supabase = createSupabaseClient(env)

    try {
      // Simple database connection test
      const { error } = await supabase.from('equipment').select('count').limit(1)

      if (error) {
        return successResponse(
          c,
          {
            status: 'error',
            timestamp: new Date().toISOString(),
            database: 'disconnected',
            error: error.message,
          },
          500
        )
      }

      return successResponse(c, {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: 'connected',
        supabase_url: env.SUPABASE_URL,
      })
    } catch (error) {
      return successResponse(
        c,
        {
          status: 'error',
          timestamp: new Date().toISOString(),
          database: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      )
    }
  }

  static async hello(c: Context) {
    return successResponse(c, { message: 'Hello from Hono + Cloudflare Workers!' })
  }
}
