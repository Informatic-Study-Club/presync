import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { safeNextPath } from "@/lib/auth/paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Tujuan tautan di template email Supabase Auth (undangan, reset password).
// Template harus mengarah ke:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<tipe>&next=/atur-password
// Token diverifikasi di server, lalu sesi disimpan di cookie.

const querySchema = z.object({
  token_hash: z.string().min(1).max(512),
  type: z.enum(["invite", "recovery", "email", "email_change"]),
  next: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);
  const failUrl = new URL("/masuk?galat=tautan", request.url);
  if (!parsed.success) return NextResponse.redirect(failUrl);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: parsed.data.token_hash,
    type: parsed.data.type satisfies EmailOtpType,
  });
  if (error) return NextResponse.redirect(failUrl);

  return NextResponse.redirect(
    new URL(safeNextPath(parsed.data.next, "/atur-password"), request.url),
  );
}
