"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";

type Toast = { id: number; message: string; tone: "success" | "error" };

let nextId = 1;
const listeners = new Set<(t: Toast) => void>();

/** Notification brève, utilisable depuis n'importe quel composant client (le <Toaster /> de la coque l'affiche). */
export const toast = {
  success: (message: string) => emit({ id: nextId++, message, tone: "success" }),
  error: (message: string) => emit({ id: nextId++, message, tone: "error" }),
};

function emit(t: Toast) {
  listeners.forEach((l) => l(t));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const onToast = (t: Toast) => {
      setItems((prev) => [...prev.slice(-2), t]);
      window.setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== t.id)), t.tone === "error" ? 8000 : 4500);
    };
    listeners.add(onToast);
    return () => void listeners.delete(onToast);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-20 z-[60] lg:bottom-4 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className="pointer-events-auto flex max-w-sm items-start gap-2 rounded-xl border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none"
        >
          {t.tone === "success" ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
          ) : (
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          )}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
