/**
 * Enhanced Error Boundary with Logging and Context Capture
 *
 * Captures client-side errors with correlation context and sends them
 * to the logging service for better debugging and monitoring.
 */

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { isRouteErrorResponse } from "react-router";

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  requestId?: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (
    error: Error,
    errorInfo: ErrorInfo,
    retry: () => void
  ) => ReactNode;
  requestId?: string; // Passed from server-side rendering
  userId?: string;
  route?: string;
}

interface ClientLogEntry {
  timestamp: string;
  level: "error";
  message: string;
  context: {
    requestId?: string;
    userId?: string;
    route?: string;
    userAgent: string;
    url: string;
  };
  error: {
    name: string;
    message: string;
    stack?: string;
    componentStack?: string;
  };
  metadata?: any;
}

export class EnhancedErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  private retryCount = 0;
  private readonly maxRetries = 2;

  constructor(props: ErrorBoundaryProps) {
    super(props);

    this.state = {
      hasError: false,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Capture additional error information
    this.setState({
      error,
      errorInfo,
      requestId: this.props.requestId,
    });

    // Log error with context
    this.logClientError(error, errorInfo);

    // Send to external monitoring service in production
    if (process.env.NODE_ENV === "production") {
      this.sendToMonitoringService(error, errorInfo);
    }
  }

  private logClientError(error: Error, errorInfo: ErrorInfo): void {
    const logEntry: ClientLogEntry = {
      timestamp: new Date().toISOString(),
      level: "error",
      message: "Client-side error caught by ErrorBoundary",
      context: {
        requestId: this.props.requestId,
        userId: this.props.userId?.substring(0, 8) + "...",
        route: this.props.route || window.location.pathname,
        userAgent: navigator.userAgent,
        url: window.location.href,
      },
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack || undefined,
        componentStack: errorInfo.componentStack,
      },
      metadata: {
        retryCount: this.retryCount,
        timestamp: Date.now(),
        // Include additional browser context
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        connection: (navigator as any).connection
          ? {
              effectiveType: (navigator as any).connection.effectiveType,
              downlink: (navigator as any).connection.downlink,
            }
          : undefined,
      },
    };

    // Log to console for development
    if (process.env.NODE_ENV === "development") {
      console.error("ErrorBoundary caught an error:", {
        error,
        errorInfo,
        logEntry,
      });
    } else {
      // Structured logging for production
      console.error(JSON.stringify(logEntry));
    }
  }

  private async sendToMonitoringService(
    error: Error,
    errorInfo: ErrorInfo
  ): Promise<void> {
    try {
      // TODO: Implement monitoring service integration
      // Could send to Sentry, LogRocket, or custom endpoint

      const payload = {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack || undefined,
        },
        errorInfo: {
          componentStack: errorInfo.componentStack,
        },
        context: {
          requestId: this.props.requestId,
          userId: this.props.userId,
          route: this.props.route,
          url: window.location.href,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        },
      };

      // Example implementation:
      // await fetch('/api/errors', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(payload),
      // });
    } catch (logError) {
      // Silently fail to avoid recursive errors
      console.warn("Failed to send error to monitoring service:", logError);
    }
  }

  private handleRetry = (): void => {
    if (this.retryCount < this.maxRetries) {
      this.retryCount += 1;

      // Log retry attempt
      const context = {
        requestId: this.props.requestId || "unknown",
        route: this.props.route || window.location.pathname,
        userAgent: navigator.userAgent,
        url: window.location.href,
      };

      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "info",
          message: "Error boundary retry attempted",
          context,
          metadata: {
            retryCount: this.retryCount,
            maxRetries: this.maxRetries,
          },
        })
      );

      // Reset error state
      this.setState({
        hasError: false,
        error: undefined,
        errorInfo: undefined,
      });
    }
  };

  private renderDefaultFallback(): ReactNode {
    const { error, errorInfo } = this.state;
    const canRetry = this.retryCount < this.maxRetries;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Something went wrong
            </h2>
            <p className="text-gray-600 mb-6">
              We encountered an unexpected error. Our team has been notified.
            </p>

            {process.env.NODE_ENV === "development" && error && (
              <details className="text-left bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <summary className="font-medium text-red-800 cursor-pointer">
                  Error Details (Development)
                </summary>
                <div className="mt-4 space-y-2">
                  <div>
                    <strong>Error:</strong> {error.message}
                  </div>
                  {error.stack && (
                    <div>
                      <strong>Stack:</strong>
                      <pre className="text-xs mt-1 overflow-x-auto">
                        {error.stack}
                      </pre>
                    </div>
                  )}
                  {errorInfo?.componentStack && (
                    <div>
                      <strong>Component Stack:</strong>
                      <pre className="text-xs mt-1 overflow-x-auto">
                        {errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                  {this.props.requestId && (
                    <div>
                      <strong>Request ID:</strong> {this.props.requestId}
                    </div>
                  )}
                </div>
              </details>
            )}

            <div className="space-y-4">
              {canRetry && (
                <button
                  onClick={this.handleRetry}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                >
                  Try Again ({this.maxRetries - this.retryCount} attempts left)
                </button>
              )}

              <button
                onClick={() => (window.location.href = "/")}
                className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
              >
                Go to Homepage
              </button>

              <button
                onClick={() => window.location.reload()}
                className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
              >
                Reload Page
              </button>
            </div>

            {this.props.requestId && (
              <p className="text-xs text-gray-500 mt-4">
                Reference ID: {this.props.requestId}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Render custom fallback if provided, otherwise use default
      if (this.props.fallback && this.state.error && this.state.errorInfo) {
        return this.props.fallback(
          this.state.error,
          this.state.errorInfo,
          this.handleRetry
        );
      }

      return this.renderDefaultFallback();
    }

    return this.props.children;
  }
}

/**
 * React Router Error Component for route-level errors
 */
export function RouteErrorBoundary({ requestId }: { requestId?: string }) {
  // This would be used in route.tsx files for route-specific error handling
  // Implementation would depend on React Router v7 error handling patterns

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Page Error</h1>
        <p className="text-gray-600 mb-6">
          There was an error loading this page.
        </p>
        <a
          href="/"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
        >
          Return Home
        </a>
        {requestId && (
          <p className="text-xs text-gray-500 mt-4">
            Reference ID: {requestId}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Hook for manual error reporting from components
 */
export function useErrorReporting() {
  const reportError = (error: Error, context?: any) => {
    // Create a synthetic ErrorBoundary instance for manual reporting
    const boundary = new EnhancedErrorBoundary({
      children: null,
      requestId: context?.requestId,
      userId: context?.userId,
      route: context?.route || window.location.pathname,
    });

    // Manually trigger error logging
    boundary.componentDidCatch(error, {
      componentStack: context?.componentStack || "Manual error report",
    });
  };

  return { reportError };
}
