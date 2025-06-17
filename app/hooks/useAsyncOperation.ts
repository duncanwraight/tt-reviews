import { useState, useRef, useCallback } from "react";

export interface AsyncOperationState {
  isLoading: boolean;
  error: string | null;
  success: boolean;
  successMessage: string | null;
}

export interface AsyncOperationOptions {
  successMessage?: string;
  errorMessage?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  resetDelay?: number;
}

export function useAsyncOperation(options: AsyncOperationOptions = {}) {
  const [state, setState] = useState<AsyncOperationState>({
    isLoading: false,
    error: null,
    success: false,
    successMessage: null,
  });

  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const reset = useCallback(() => {
    setState({
      isLoading: false,
      error: null,
      success: false,
      successMessage: null,
    });
  }, []);

  const execute = useCallback(
    async <T>(
      operation: () => Promise<T>,
      operationOptions?: Partial<AsyncOperationOptions>
    ): Promise<T | null> => {
      const finalOptions = { ...options, ...operationOptions };

      setState({
        isLoading: true,
        error: null,
        success: false,
        successMessage: null,
      });

      try {
        const result = await operation();

        setState({
          isLoading: false,
          error: null,
          success: true,
          successMessage:
            finalOptions.successMessage || "Operation completed successfully",
        });

        finalOptions.onSuccess?.();

        // Auto-reset after delay if specified
        if (finalOptions.resetDelay && finalOptions.resetDelay > 0) {
          timeoutRef.current = setTimeout(reset, finalOptions.resetDelay);
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : finalOptions.errorMessage || "An unexpected error occurred";

        setState({
          isLoading: false,
          error: errorMessage,
          success: false,
          successMessage: null,
        });

        finalOptions.onError?.(errorMessage);
        return null;
      }
    },
    [options, reset]
  );

  // Cleanup timeout on unmount
  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  return {
    state,
    execute,
    reset,
    cleanup,
    isLoading: state.isLoading,
    error: state.error,
    success: state.success,
    successMessage: state.successMessage,
  };
}
