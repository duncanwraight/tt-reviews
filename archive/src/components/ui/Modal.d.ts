import { FC } from 'hono/jsx';
interface ModalProps {
    id: string;
    title: string;
    message: string;
    type?: 'success' | 'error' | 'info' | 'warning';
    confirmText?: string;
    cancelText?: string;
    onConfirm?: string;
    onCancel?: string;
    showCancel?: boolean;
}
export declare const Modal: FC<ModalProps>;
export declare function getModalScript(): string;
export {};
//# sourceMappingURL=Modal.d.ts.map