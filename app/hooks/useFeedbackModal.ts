import { useState, useCallback } from "react";

export interface ModalState {
  isOpen: boolean;
  type: "success" | "error" | "loading";
  title: string;
  message: string;
  onClose?: () => void;
  autoClose?: boolean;
  autoCloseDelay?: number;
}

export interface ModalOptions {
  title: string;
  message: string;
  autoClose?: boolean;
  autoCloseDelay?: number;
  onClose?: () => void;
}

export function useFeedbackModal() {
  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    type: "loading",
    title: "",
    message: "",
    onClose: undefined,
    autoClose: false,
    autoCloseDelay: 0,
  });

  const showLoading = useCallback(
    (options: Pick<ModalOptions, "title" | "message">) => {
      setModalState({
        isOpen: true,
        type: "loading",
        title: options.title,
        message: options.message,
        onClose: undefined,
        autoClose: false,
        autoCloseDelay: 0,
      });
    },
    []
  );

  const showSuccess = useCallback((options: ModalOptions) => {
    setModalState({
      isOpen: true,
      type: "success",
      title: options.title,
      message: options.message,
      onClose: options.onClose,
      autoClose: options.autoClose ?? true,
      autoCloseDelay: options.autoCloseDelay ?? 2000,
    });
  }, []);

  const showError = useCallback((options: ModalOptions) => {
    setModalState({
      isOpen: true,
      type: "error",
      title: options.title,
      message: options.message,
      onClose: options.onClose,
      autoClose: options.autoClose ?? false,
      autoCloseDelay: options.autoCloseDelay ?? 0,
    });
  }, []);

  const closeModal = useCallback(() => {
    setModalState(prev => ({ ...prev, isOpen: false }));
  }, []);

  return {
    modalState,
    showLoading,
    showSuccess,
    showError,
    closeModal,
  };
}
