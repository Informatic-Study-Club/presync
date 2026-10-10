"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const FALLBACK_POLL_MS = 30_000;

// Memuat ulang halaman (data server) saat presensi sesi berubah. supabase-js di
// klien hanya untuk Realtime (aturan wajib 1); payload tidak berisi data.
export function LiveRefresh({ topic }: { topic: string }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };
    const poll = setInterval(() => router.refresh(), FALLBACK_POLL_MS);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      return () => clearInterval(poll);
    }
    const supabase = createBrowserClient(url, key);
    const channel = supabase.channel(topic).on("broadcast", { event: "changed" }, refresh).subscribe();

    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [router, topic]);

  return null;
}
