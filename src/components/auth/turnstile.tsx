"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import type { TurnstileAction } from "@/lib/security/turnstile-check";

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// Widget Cloudflare Turnstile (render eksplisit). Menambah input tersembunyi
// "cf-turnstile-response" ke form induknya; token diverifikasi di server.
// Ubah `resetSignal` (misalnya state hasil action) untuk meminta token baru,
// karena token hanya berlaku sekali.
export function Turnstile({
  siteKey,
  action,
  resetSignal,
}: {
  siteKey: string;
  /** Diperiksa server: token formulir ini tidak berlaku untuk formulir lain. */
  action: TurnstileAction;
  resetSignal?: unknown;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!ready || !el || !window.turnstile) return;
    const widgetId = window.turnstile.render(el, {
      sitekey: siteKey,
      action,
      theme: "light",
      language: "id",
    });
    widgetIdRef.current = widgetId;
    return () => {
      window.turnstile?.remove(widgetId);
      widgetIdRef.current = undefined;
    };
  }, [ready, siteKey, action]);

  useEffect(() => {
    if (resetSignal !== undefined && widgetIdRef.current) {
      window.turnstile?.reset(widgetIdRef.current);
    }
  }, [resetSignal]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
      />
      <div ref={containerRef} className="min-h-[65px]" />
    </>
  );
}
