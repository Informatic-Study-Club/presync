import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";

// Klien Supabase untuk Auth di server. Jangan dipakai untuk query data:
// akses data lewat Drizzle (src/db). Cookie tanpa atribut domain sehingga
// terikat ke host presync (docs/ARSITEKTUR.md bagian 14).
export async function createSupabaseServerClient() {
  // cookies() lebih dulu: menandai halaman sebagai dinamis sebelum env dibaca.
  const cookieStore = await cookies();
  const env = serverEnv();
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Dipanggil dari Server Component (cookie read-only). Aman
            // diabaikan karena proxy.ts menyegarkan sesi di setiap request.
          }
        },
      },
    },
  );
}
