/**
 * Request Correlation Middleware for React Router v7
 * 
 * Adds request tracing and logging context to all route loaders and actions.
 * Provides unique request IDs for correlating logs across different operations.
 */

import { Logger, createLogContext, extractRequestContext, type LogContext } from "~/lib/logger.server";

export interface CorrelatedRequest {
  requestId: string;
  logContext: LogContext;
  startTime: number;
}

/**
 * Higher-order function that wraps route loaders with correlation and logging
 */
export function withCorrelation<T extends (...args: any[]) => any>(
  handler: T,
  operationType: 'loader' | 'action' = 'loader'
): T {
  return (async (...args: any[]) => {
    // Generate unique request ID
    const requestId = crypto.randomUUID();
    const startTime = Date.now();
    
    // Extract request from arguments (first argument in React Router)
    const request = args[0]?.request as Request | undefined;
    
    if (!request) {
      // Fallback for cases where request isn't available
      const fallbackContext = createLogContext(requestId);
      return handler(...args, { requestId, logContext: fallbackContext, startTime });
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
      // Log error with correlation context
      const duration = Date.now() - startTime;
      Logger.error(
        `${operationType} failed`,
        logContext,
        error as Error,
        { duration, operationType }
      );
      
      throw error;
    }
  }) as T;
}

/**
 * Specific wrapper for route loaders
 */
export function withLoaderCorrelation<T extends (...args: any[]) => any>(handler: T): T {
  return withCorrelation(handler, 'loader');
}

/**
 * Specific wrapper for route actions
 */
export function withActionCorrelation<T extends (...args: any[]) => any>(handler: T): T {
  return withCorrelation(handler, 'action');
}

/**
 * Extract user context from authenticated requests
 */
export function enhanceContextWithUser(
  context: LogContext,
  user: { id: string; email?: string; role?: string } | null
): LogContext {
  if (!user) {
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
  metadata?: any
): Promise<T> {
  return Logger.timeOperation(
    `db_${operation}`,
    fn,
    context,
    { operation_type: 'database', ...metadata }
  );
}

/**
 * Track external service calls with correlation
 */
export async function withServiceCorrelation<T>(
  service: string,
  operation: string,
  fn: () => Promise<T>,
  context: LogContext,
  metadata?: any
): Promise<T> {
  return Logger.timeOperation(
    `${service}_${operation}`,
    fn,
    context,
    { operation_type: 'external_service', service, ...metadata }
  );
}

/**
 * Utility to create enhanced context for specific operations
 */
export function createOperationContext(
  baseContext: LogContext,
  operation: string,
  metadata?: any
): LogContext {
  return {
    ...baseContext,
    route: `${baseContext.route}#${operation}`,
    // Add operation-specific metadata to context if needed
  };
}

/**
 * Log user action for business metrics
 */
export function logUserAction(
  action: string,
  context: LogContext,
  metadata?: any
): void {
  Logger.metric(`user_action_${action}`, 1, context, {
    action,
    ...metadata,
  });
}

/**
 * Log business event for analytics
 */
export function logBusinessEvent(
  event: string,
  value: number,
  context: LogContext,
  metadata?: any
): void {
  Logger.metric(`business_event_${event}`, value, context, {
    event,
    ...metadata,
  });
}

/**
 * Log security event for monitoring
 */
export function logSecurityEvent(
  event: string,
  context: LogContext,
  metadata?: any
): void {
  Logger.warn(`Security event: ${event}`, context, {
    security_event: event,
    ...metadata,
  });
}

/**
 * Create correlation-aware error for better tracking
 */
export class CorrelatedError extends Error {
  public readonly requestId: string;
  public readonly context: LogContext;

  constructor(message: string, context: LogContext, cause?: Error) {
    super(message);
    this.name = 'CorrelatedError';
    this.requestId = context.requestId;
    this.context = context;
    
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Helper to wrap errors with correlation context
 */
export function wrapWithCorrelation(
  error: Error,
  context: LogContext,
  message?: string
): CorrelatedError {
  return new CorrelatedError(
    message || error.message,
    context,
    error
  );
}