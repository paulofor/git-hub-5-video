import { createContext, ReactNode, useContext, useState } from 'react';
import { v4 as uuid } from 'uuid';

type Toast = {
  id: string;
  message: string;
  type?: 'success' | 'error';
};

type ToastContextValue = {
  toasts: Toast[];
  pushToast: (message: string, type?: 'success' | 'error') => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = (message: string, type: 'success' | 'error' = 'success') => {
    const toast = { id: uuid(), message, type };
    setToasts((current) => [...current, toast]);
    setTimeout(() => dismiss(toast.id), 5000);
  };

  const dismiss = (id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toasts, pushToast, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-md px-4 py-2 shadow-lg text-sm ${
              toast.type === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-emerald-600 text-white'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToasts() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToasts deve ser usado dentro de ToastProvider');
  }
  return ctx;
}
