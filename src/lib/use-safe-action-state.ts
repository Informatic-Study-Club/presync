"use client";

import { useActionState } from "react";
import { id as t } from "@/messages/id";

// Pengganti useActionState untuk semua formulir Server Action. Galat yang tidak
// tertangkap di server (misalnya penolakan database yang tak terduga atau
// gangguan jaringan) ditampilkan sebagai pesan galat biasa di formulir, bukan
// halaman "This page couldn't load". Galat aslinya tetap tercatat di log
// server (Vercel), dengan digest yang sama.

type WithError = { error?: string } | undefined;

/** Galat kendali Next.js (redirect, notFound) harus diteruskan, bukan ditelan. */
function isNextControlError(err: unknown): boolean {
  const digest = err && typeof err === "object" && "digest" in err ? String(err.digest) : "";
  return digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND";
}

export function useSafeActionState<S extends WithError, P = FormData>(
  action: (state: S, payload: P) => Promise<S>,
  initialState: S,
): [state: S, dispatch: (payload: P) => void, isPending: boolean] {
  // State formulir tidak pernah berupa Promise, jadi Awaited<S> sama dengan S.
  const safe = async (state: Awaited<S>, payload: P): Promise<S> => {
    try {
      return await action(state, payload);
    } catch (err) {
      if (isNextControlError(err)) throw err;
      console.error("Aksi server gagal", err);
      return { ...(state ?? {}), error: t.common.unknownError } as S;
    }
  };
  return useActionState<S, P>(safe, initialState as Awaited<S>) as [S, (payload: P) => void, boolean];
}
