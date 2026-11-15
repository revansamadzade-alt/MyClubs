import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';

type Notify = (message: string) => void;

const ToastCtx = createContext<Notify>(() => {});

interface Toast {
  id: number;
  message: string;
}

let nextId = 1;

/** Canvas-style flash messages, announced to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const notify = useCallback<Notify>(
    (message) => {
      const id = nextId++;
      setToasts((t) => [...t.slice(-2), { id, message }]);
      window.setTimeout(() => dismiss(id), 3500);
    },
    [dismiss],
  );

  return (
    <ToastCtx.Provider value={notify}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex w-full max-w-md items-stretch overflow-hidden rounded-md border border-success bg-white text-sm text-ink shadow-lg"
          >
            <span className="grid w-10 shrink-0 place-items-center bg-success text-white">
              <Check size={18} aria-hidden />
            </span>
            <p className="flex-1 px-3 py-3">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="px-3 text-ink-soft hover:text-ink"
              aria-label="Dismiss message"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
