/**
 * Request Correlation Middleware for React Router v7
 *
 * Adds request tracing and logging context to all route loaders and actions.
 * Provides unique request IDs for correlating logs across different operations.
 */

import {
  Logger,
  createLogContext,
  extractRequestContext,
  type LogContext,
} from "~/lib/logger.server";

export interface CorrelatedRequest {
  requestId: string;
  logContext: LogContext;
  startTime: number;
}

/**
 * Higher-order function that wraps route loaders with correlation and logging.
 * Internal helper for withLoaderCorrelation; if action wrapping is ever needed
 * again, re-export and add a withActionCorrelation thin wrapper.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withCorrelation<T extends (...args: any[]) => any>(
  handler: T,
  operationType: "loader" | "action" = "loader"
): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (async (...args: any[]) => {
    // Generate unique request ID
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    // Extract request from arguments (first argument in React Router)
    const request = args[0]?.request as Request | undefined;

    if (!request) {
      // Fallback for cases where request isn't available
      const fallbackContext = createLogContext(requestId);
      return handler(...args, {
        requestId,
        logContext: fallbackContext,
        startTime,
      });
    }

    // Extract request context
    const requestContext = extractRequestContext(request);

    // Create full log context
    const logContext = createLogContext(requestId, {
      ...requestContext,
      route: requestContext.route,
    });

    // Log request start
    Logger.debug(`${operationType} started`, logContext, {
      url: request.url,
      method: request.method,
    });

    try {
      // Execute the handler with correlation context
      const result = await handler(...args, {
        requestId,
        logContext,
        startTime,
      });

      // Log successful completion
      const duration = Date.now() - startTime;
      Logger.performance(`${operationType}_execution`, duration, logContext);

      return result;
    } catch (error) {
      // React Router's idiomatic 404 / redirect / 4xx pattern is
      // `throw new Response(..., { status })`. These are control flow,
      // not bugs — logging them as errors fires the Discord alerter
      // (TT-109). Status ≥ 500 stays loud since those signal genuine
      // server problems; non-Response throws are real exceptions and
      // always log.
      const isClientErrorResponse =
        error instanceof Response && error.status < 500;
      if (!isClientErrorResponse) {
        const duration = Date.now() - startTime;
        Logger.error(`${operationType} failed`, logContext, error as Error, {
          duration,
          operationType,
        });
      }

      throw error;
    }
  }) as T;
}

/**
 * Specific wrapper for route loaders
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withLoaderCorrelation<T extends (...args: any[]) => any>(
  handler: T
): T {
  return withCorrelation(handler, "loader");
}

/**
 * Extract user context from authenticated requests
 */
export function enhanceContextWithUser(
  context: LogContext,
  user: { id: string; email?: string; role?: string } | null
): LogContext {
  if (!user || !user.id) {
    return context;
  }

  return {
    ...context,
    userId: user.id,
    userRole: user.role,
    // Note: We don't log email for privacy reasons
  };
}

/**
 * Track database operation with correlation
 */
export async function withDatabaseCorrelation<T>(
  operation: string,
  fn: () => Promise<T>,
  context: LogContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any
): Promise<T> {
  return Logger.timeOperation(`db_${operation}`, fn, context, {
    operation_type: "database",
    ...metadata,
  });
}

/**
 * Log user action for business metrics
 */
export function logUserAction(
  action: string,
  context: LogContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any
): void {
  Logger.metric(`user_action_${action}`, 1, context, {
    action,
    ...metadata,
  });
}
