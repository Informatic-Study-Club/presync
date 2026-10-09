import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { MAX_PROOF_BYTES, type ProofType } from "./proof";

// Bukti pembayaran di bucket privat (docs/ARSITEKTUR.md bagian 14). Unggah
// lewat server; akses baca hanya lewat signed URL berumur pendek.

export const PROOF_BUCKET = "bukti-pembayaran";
const SIGNED_URL_SECONDS = 60;

let bucketReady = false;

/** Membuat bucket privat bila belum ada (idempoten). */
async function ensureBucket() {
  if (bucketReady) return;
  const storage = createSupabaseAdminClient().storage;
  const { data } = await storage.getBucket(PROOF_BUCKET);
  if (!data) {
    const { error } = await storage.createBucket(PROOF_BUCKET, {
      public: false,
      fileSizeLimit: MAX_PROOF_BYTES,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    });
    if (error && !/already exists/i.test(error.message)) throw error;
  } else if (data.public) {
    throw new Error(`Bucket ${PROOF_BUCKET} publik; ubah menjadi privat di dashboard Supabase`);
  }
  bucketReady = true;
}

export async function uploadProof(path: string, data: Uint8Array, type: ProofType): Promise<void> {
  await ensureBucket();
  const { error } = await createSupabaseAdminClient()
    .storage.from(PROOF_BUCKET)
    .upload(path, data, { contentType: type.mime, upsert: false });
  if (error) throw error;
}

export async function removeProof(path: string): Promise<void> {
  await createSupabaseAdminClient().storage.from(PROOF_BUCKET).remove([path]);
}

export async function signedProofUrl(path: string): Promise<string | null> {
  const { data } = await createSupabaseAdminClient()
    .storage.from(PROOF_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  return data?.signedUrl ?? null;
}
