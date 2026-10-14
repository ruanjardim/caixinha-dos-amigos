"use client";

import { useEffect } from "react";

/** Registra o service worker (somente em produção, para não atrapalhar o desenvolvimento). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Falha no registro não impede o uso do sistema.
    });
  }, []);
  return null;
}
