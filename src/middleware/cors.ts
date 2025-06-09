import { Context, Next } from 'hono'

export async function corsMiddleware(c: Context, next: Next) {
  // Handle CORS preflight requests
  if (c.req.method === 'OPTIONS') {
    c.res.headers.set('Access-Control-Allow-Origin', '*')
    c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    c.res.headers.set('Access-Control-Max-Age', '86400')
    c.status(204)
    return c.text('')
  }

  await next()

  // Set CORS headers for all responses
  c.res.headers.set('Access-Control-Allow-Origin', '*')
  c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}
