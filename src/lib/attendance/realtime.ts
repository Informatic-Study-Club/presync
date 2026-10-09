import "server-only";
import { serverEnv } from "@/lib/env";

// Sinyal realtime untuk dashboard presensi lewat Supabase Realtime Broadcast.
// Payload sengaja tanpa data pribadi: channel publik bisa didengar siapa pun
// yang tahu namanya, jadi klien hanya menerima "ada perubahan" lalu memuat
// ulang data dari server (yang memeriksa izin).

export function attendanceTopic(sessionId: string): string {
  return `presensi:${sessionId}`;
}

export async function broadcastAttendanceChanged(sessionId: string): Promise<void> {
  const env = serverEnv();
  try {
    await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ topic: attendanceTopic(sessionId), event: "changed", payload: { at: Date.now() } }],
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Realtime hanya pelengkap; dashboard juga memuat ulang berkala.
  }
}
