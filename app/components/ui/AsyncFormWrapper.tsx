import { LoadingState } from "./LoadingState";
import { FeedbackMessage } from "./FeedbackMessage";
import {
  useAsyncOperation,
  type AsyncOperationOptions,
} from "~/hooks/useAsyncOperation";

interface AsyncFormWrapperProps {
  children: (props: {
    isLoading: boolean;
    execute: (
      operation: () => Promise<any>,
      options?: Partial<AsyncOperationOptions>
    ) => Promise<any>;
    reset: () => void;
  }) => React.ReactNode;
  loadingMessage?: string;
  loadingOverlay?: boolean;
  className?: string;
}

export function AsyncFormWrapper({
  children,
  loadingMessage = "Processing...",
  loadingOverlay = false,
  className = "",
}: AsyncFormWrapperProps) {
  const { state, execute, reset } = useAsyncOperation();

  return (
    <div className={className}>
      {/* Success Message */}
      {state.success && state.successMessage && (
        <FeedbackMessage
          type="success"
          message={state.successMessage}
          autoHide={true}
          autoHideDelay={3000}
          onClose={reset}
        />
      )}

      {/* Error Message */}
      {state.error && (
        <FeedbackMessage type="error" message={state.error} onClose={reset} />
      )}

      {/* Loading State */}
      {state.isLoading && (
        <LoadingState message={loadingMessage} overlay={loadingOverlay} />
      )}

      {/* Form Content */}
      {!state.isLoading &&
        children({
          isLoading: state.isLoading,
          execute,
          reset,
        })}
    </div>
  );
}
