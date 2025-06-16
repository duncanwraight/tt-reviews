/**
 * Structured Logging Service for Cloudflare Workers
 * 
 * Provides centralized logging with request correlation, performance metrics,
 * and proper log levels for development vs production environments.
 */

export interface LogContext {
  requestId: string;
  userId?: string;
  userAgent?: string;
  ip?: string;
  route?: string;
  method?: string;
  duration?: number;
  sessionId?: string;
  userRole?: string;
}

export interface LogMetadata {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
  data?: any;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  performance?: {
    operation: string;
    duration: number;
    unit: 'ms';
  };
}

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  METRIC = 'metric',
  PERFORMANCE = 'performance',
}

class LoggerService {
  private readonly isDevelopment: boolean;
  private readonly logLevel: LogLevel;

  constructor() {
    // Determine environment from globalThis or default to production
    this.isDevelopment = globalThis.process?.env?.NODE_ENV === 'development' || 
                        globalThis.ENVIRONMENT === 'development';
    
    // Set log level based on environment
    this.logLevel = this.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO;
  }

  /**
   * Check if a log level should be output based on current configuration
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.METRIC, LogLevel.PERFORMANCE];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const requestedLevelIndex = levels.indexOf(level);
    
    return requestedLevelIndex >= currentLevelIndex;
  }

  /**
   * Create structured log entry
   */
  private createLogEntry(level: LogLevel, message: string, context: LogContext, data?: any): LogMetadata {
    const logEntry: LogMetadata = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        ...context,
        // Ensure we don't log sensitive information
        userId: context.userId ? context.userId.substring(0, 8) + '...' : undefined,
      },
    };

    if (data) {
      logEntry.data = data;
    }

    return logEntry;
  }

  /**
   * Format log entry for console output
   */
  private formatLogEntry(logEntry: LogMetadata): string {
    const { timestamp, level, message, context } = logEntry;
    
    if (this.isDevelopment) {
      // Human-readable format for development
      return `[${timestamp}] ${level.toUpperCase()} [${context.requestId?.substring(0, 8)}] ${message}${
        logEntry.data ? ` ${JSON.stringify(logEntry.data, null, 2)}` : ''
      }`;
    } else {
      // Structured JSON for production
      return JSON.stringify(logEntry);
    }
  }

  /**
   * Output log entry to console and potentially external services
   */
  private output(logEntry: LogMetadata): void {
    if (!this.shouldLog(logEntry.level)) {
      return;
    }

    const formattedLog = this.formatLogEntry(logEntry);

    switch (logEntry.level) {
      case LogLevel.ERROR:
        console.error(formattedLog);
        break;
      case LogLevel.WARN:
        console.warn(formattedLog);
        break;
      case LogLevel.DEBUG:
        this.isDevelopment && console.debug(formattedLog);
        break;
      default:
        console.log(formattedLog);
        break;
    }

    // In production, could send to external logging service
    if (!this.isDevelopment && logEntry.level === LogLevel.ERROR) {
      this.sendToExternalService(logEntry);
    }
  }

  /**
   * Send critical logs to external service (placeholder for future implementation)
   */
  private async sendToExternalService(logEntry: LogMetadata): Promise<void> {
    // TODO: Implement external logging service integration
    // Could use Cloudflare Analytics Engine, Logpush, or third-party service
    try {
      // Example: await fetch('https://logging-service.com/logs', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(logEntry)
      // });
    } catch (error) {
      // Silently fail external logging to avoid recursive logging issues
    }
  }

  /**
   * Log informational messages
   */
  info(message: string, context: LogContext, data?: any): void {
    const logEntry = this.createLogEntry(LogLevel.INFO, message, context, data);
    this.output(logEntry);
  }

  /**
   * Log warning messages
   */
  warn(message: string, context: LogContext, data?: any): void {
    const logEntry = this.createLogEntry(LogLevel.WARN, message, context, data);
    this.output(logEntry);
  }

  /**
   * Log error messages with optional Error object
   */
  error(message: string, context: LogContext, error?: Error, data?: any): void {
    const logEntry = this.createLogEntry(LogLevel.ERROR, message, context, data);
    
    if (error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        stack: this.isDevelopment ? error.stack : undefined, // Only include stack in development
      };
    }

    this.output(logEntry);
  }

  /**
   * Log debug messages (only in development)
   */
  debug(message: string, context: LogContext, data?: any): void {
    const logEntry = this.createLogEntry(LogLevel.DEBUG, message, context, data);
    this.output(logEntry);
  }

  /**
   * Log business metrics and events
   */
  metric(metric: string, value: number, context: LogContext, metadata?: any): void {
    const logEntry = this.createLogEntry(LogLevel.METRIC, `Metric: ${metric}`, context, {
      metric,
      value,
      ...metadata,
    });
    this.output(logEntry);
  }

  /**
   * Log performance measurements
   */
  performance(operation: string, duration: number, context: LogContext, metadata?: any): void {
    const logEntry = this.createLogEntry(LogLevel.PERFORMANCE, `Performance: ${operation}`, context, metadata);
    
    logEntry.performance = {
      operation,
      duration,
      unit: 'ms' as const,
    };

    this.output(logEntry);

    // Alert on slow operations in production
    if (!this.isDevelopment && duration > 2000) {
      this.warn(`Slow operation detected: ${operation}`, context, { duration });
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: Partial<LogContext>): ChildLogger {
    return new ChildLogger(this, additionalContext);
  }

  /**
   * Time an operation and log its performance
   */
  async timeOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    context: LogContext,
    metadata?: any
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      this.debug(`Starting operation: ${operation}`, context, metadata);
      const result = await fn();
      const duration = Date.now() - startTime;
      this.performance(operation, duration, context, metadata);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.error(`Operation failed: ${operation}`, context, error as Error, {
        duration,
        ...metadata,
      });
      throw error;
    }
  }
}

/**
 * Child logger that automatically includes additional context
 */
class ChildLogger {
  constructor(
    private parent: LoggerService,
    private additionalContext: Partial<LogContext>
  ) {}

  private mergeContext(context: LogContext): LogContext {
    return { ...context, ...this.additionalContext };
  }

  info(message: string, context: LogContext, data?: any): void {
    this.parent.info(message, this.mergeContext(context), data);
  }

  warn(message: string, context: LogContext, data?: any): void {
    this.parent.warn(message, this.mergeContext(context), data);
  }

  error(message: string, context: LogContext, error?: Error, data?: any): void {
    this.parent.error(message, this.mergeContext(context), error, data);
  }

  debug(message: string, context: LogContext, data?: any): void {
    this.parent.debug(message, this.mergeContext(context), data);
  }

  metric(metric: string, value: number, context: LogContext, metadata?: any): void {
    this.parent.metric(metric, value, this.mergeContext(context), metadata);
  }

  performance(operation: string, duration: number, context: LogContext, metadata?: any): void {
    this.parent.performance(operation, duration, this.mergeContext(context), metadata);
  }

  async timeOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    context: LogContext,
    metadata?: any
  ): Promise<T> {
    return this.parent.timeOperation(operation, fn, this.mergeContext(context), metadata);
  }
}

// Export singleton instance
export const Logger = new LoggerService();

// Export utility functions
export function createLogContext(requestId: string, additionalContext?: Partial<LogContext>): LogContext {
  return {
    requestId,
    ...additionalContext,
  };
}

export function extractRequestContext(request: Request): Partial<LogContext> {
  return {
    method: request.method,
    route: new URL(request.url).pathname,
    userAgent: request.headers.get('user-agent') || undefined,
    ip: request.headers.get('cf-connecting-ip') || 
        request.headers.get('x-forwarded-for') || 
        undefined,
  };
}