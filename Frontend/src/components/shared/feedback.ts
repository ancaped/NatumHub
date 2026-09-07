export type ToastType = 'success' | 'error' | 'info';

export interface ToastPayload {
  id: number;
  text: string;
  type: ToastType;
}

type ToastListener = (toast: ToastPayload) => void;

let toastListener: ToastListener | null = null;
let toastSeq = 0;

export function setToastListener(listener: ToastListener | null) {
  toastListener = listener;
}

export function showToast(text: string, type: ToastType = 'info') {
  if (toastListener) {
    toastListener({ id: ++toastSeq, text, type });
    return;
  }
  console.log(`[toast:${type}]`, text);
}

export interface ConfirmRequest {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
}

type ConfirmHandler = (req: ConfirmRequest) => Promise<boolean>;

let confirmHandler: ConfirmHandler | null = null;

export function setConfirmHandler(handler: ConfirmHandler | null) {
  confirmHandler = handler;
}

export function confirmDialog(
  message: string,
  options?: Omit<ConfirmRequest, 'message'>
): Promise<boolean> {
  if (confirmHandler) {
    return confirmHandler({ message, ...options });
  }
  return Promise.resolve(window.confirm(message));
}
