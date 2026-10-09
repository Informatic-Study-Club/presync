import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireSecret, serverEnv } from "@/lib/env";

// Klien service role, hanya untuk operasi admin Auth (buat akun, tautan
// aktivasi). Melewati semua pembatasan: jangan pernah dipakai di klien.
export function createSupabaseAdminClient() {
  return createClient(
    serverEnv().NEXT_PUBLIC_SUPABASE_URL,
    requireSecret("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
