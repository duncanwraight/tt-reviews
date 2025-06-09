import { Context, Next } from 'hono'
import { AppError } from '../utils/errors'
import { errorResponse } from '../utils/response'

export async function errorHandler(c: Context, next: Next) {
  try {
    await next()
  } catch (error) {
    console.error('Unhandled error:', error)

    if (error instanceof AppError) {
      return errorResponse(c, error.message, error.status, error.code)
    }

    if (error instanceof Error) {
      return errorResponse(c, error.message, 500, 'INTERNAL_SERVER_ERROR')
    }

    return errorResponse(c, 'An unexpected error occurred', 500, 'UNKNOWN_ERROR')
  }
}
