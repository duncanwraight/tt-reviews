import { Context } from 'hono'

export function successResponse(
  c: Context,
  data: object | string | number | boolean | null,
  status: number = 200
) {
  c.status(status as never)
  return c.json(data)
}

export function createResponse(
  c: Context,
  data: object | string | number | boolean | null,
  status: number = 200
) {
  c.status(status as never)
  return c.json(data)
}

export function errorResponse(c: Context, message: string, status: number = 500, code?: string) {
  c.status(status as never)
  return c.json({
    error: message,
    code,
    timestamp: new Date().toISOString(),
  })
}

export function createErrorResponse(
  c: Context,
  message: string,
  status: number = 500,
  code?: string
) {
  c.status(status as never)
  return c.json({
    error: message,
    code,
    timestamp: new Date().toISOString(),
  })
}
