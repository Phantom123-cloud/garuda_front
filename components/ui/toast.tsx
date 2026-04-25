'use client';
import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'warning' | 'info';
interface ToastItem { id: number; message: string; type: ToastType }

const Ctx = createContext<{ toast: (msg: string, type?: ToastType) => void }>({
  toast: () => {},
});

const ICONS = {
  success: <CheckCircle2 size={15} className="text-green-400 flex-shrink-0" />,
  error:   <XCircle     size={15} className="text-red-400 flex-shrink-0" />,
  warning: <AlertTriangle size={15} className="text-yellow-400 flex-shrink-0" />,
  info:    <Info        size={15} className="text-blue-400 flex-shrink-0" />,
};

const STYLES = {
  success: 'border-green-500/25 bg-green-500/8',
  error:   'border-red-500/25 bg-red-500/8',
  warning: 'border-yellow-500/25 bg-yellow-500/8',
  info:    'border-blue-500/25 bg-blue-500/8',
};

let seq = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++seq;
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id}
            className={cn(
              'flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border shadow-lg backdrop-blur-sm',
              'text-sm text-foreground min-w-[240px] max-w-xs pointer-events-auto',
              'animate-slide-in',
              STYLES[t.type],
            )}
          >
            {ICONS[t.type]}
            <span className="flex-1 text-[13px]">{t.message}</span>
            <button onClick={() => setToasts(p => p.filter(x => x.id !== t.id))}
              className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
