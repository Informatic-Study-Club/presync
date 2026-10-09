"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

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
  resetSignal,
}: {
  siteKey: string;
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
      theme: "dark",
      language: "id",
    });
    widgetIdRef.current = widgetId;
    return () => {
      window.turnstile?.remove(widgetId);
      widgetIdRef.current = undefined;
    };
  }, [ready, siteKey]);

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
