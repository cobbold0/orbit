"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import { AlertCircle, Check, Info } from "lucide-react";

export type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface OrbitToastContextValue {
  notify: (message: string, variant?: ToastVariant) => void;
}

const OrbitToastContext = createContext<OrbitToastContextValue>({
  notify: () => {},
});

export function useOrbitToast() {
  return useContext(OrbitToastContext);
}

export function OrbitToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const notify = useCallback((message: string, variant: ToastVariant = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  return (
    <OrbitToastContext.Provider value={{ notify }}>
      {children}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="toast toast-end bottom-20 z-50 md:bottom-6"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className="alert bg-neutral text-neutral-content rounded-xl border-0 px-4 py-3 shadow-lg flex items-center gap-2"
            >
              {t.variant === "error" ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
              ) : t.variant === "info" ? (
                <Info className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
              ) : (
                <Check className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
              )}
              <span className="text-[0.9375rem] font-medium">{t.message}</span>
            </div>
          ))}
        </div>
      )}
    </OrbitToastContext.Provider>
  );
}
