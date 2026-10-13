// One toast at a time, announced to screen readers. Undo toasts stay up for
// at least 12 seconds (the spec asks for 10+), and never vanish while the
// pointer or keyboard focus is on them.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  error?: boolean;
  durationMs?: number;
}

const Ctx = createContext<(t: ToastOptions) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null);
  const [hold, setHold] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((t: ToastOptions) => setToast({ ...t, id: Date.now() }), []);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (!toast || hold) return;
    const ms = toast.durationMs ?? (toast.onAction ? 12000 : 6000);
    timer.current = window.setTimeout(() => setToast(null), ms);
    return () => window.clearTimeout(timer.current);
  }, [toast, hold]);

  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toast-wrap" aria-live="polite" role="status">
        {toast && (
          <div
            className={`toast${toast.error ? ' error' : ''}`}
            key={toast.id}
            onMouseEnter={() => setHold(true)}
            onMouseLeave={() => setHold(false)}
            onFocus={() => setHold(true)}
            onBlur={() => setHold(false)}
          >
            <span className="msg">{toast.message}</span>
            {toast.onAction && (
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const action = toast.onAction!;
                  setToast(null);
                  setHold(false);
                  await action();
                }}
              >
                {toast.actionLabel ?? 'Undo'}
              </button>
            )}
            {!toast.onAction && (
              <button type="button" className="btn" onClick={() => setToast(null)}>
                OK
              </button>
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
