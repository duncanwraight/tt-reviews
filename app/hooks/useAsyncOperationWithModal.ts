import { useCallback } from "react";
import { useFeedbackModal, type ModalOptions } from "./useFeedbackModal";

export interface AsyncOperationWithModalOptions {
  loadingTitle?: string;
  loadingMessage?: string;
  successTitle?: string;
  successMessage?: string;
  errorTitle?: string;
  errorMessage?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  successRedirect?: () => void;
  successRedirectDelay?: number;
}

export function useAsyncOperationWithModal() {
  const { modalState, showLoading, showSuccess, showError, closeModal } =
    useFeedbackModal();

  const execute = useCallback(
    async <T>(
      operation: () => Promise<T>,
      options: AsyncOperationWithModalOptions = {}
    ): Promise<T | null> => {
      const {
        loadingTitle = "Processing",
        loadingMessage = "Please wait...",
        successTitle = "Success!",
        successMessage = "Operation completed successfully",
        errorTitle = "Error",
        errorMessage = "An unexpected error occurred",
        onSuccess,
        onError,
        successRedirect,
        successRedirectDelay = 2000,
      } = options;

      // Show loading modal
      showLoading({
        title: loadingTitle,
        message: loadingMessage,
      });

      try {
        const result = await operation();

        // Close loading modal first, then show success after a brief delay
        closeModal();

        setTimeout(() => {
          showSuccess({
            title: successTitle,
            message: successMessage,
            autoClose: true,
            autoCloseDelay: successRedirectDelay,
            onClose: () => {
              closeModal();
              successRedirect?.();
            },
          });
        }, 150); // Small delay to prevent overlay stacking

        onSuccess?.();

        return result;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : errorMessage;

        // Close loading modal first, then show error after a brief delay
        closeModal();

        setTimeout(() => {
          showError({
            title: errorTitle,
            message: errorMsg,
            autoClose: false,
            onClose: closeModal,
          });
        }, 150); // Small delay to prevent overlay stacking

        onError?.(errorMsg);
        return null;
      }
    },
    [showLoading, showSuccess, showError, closeModal]
  );

  return {
    modalState,
    execute,
    closeModal,
  };
}
