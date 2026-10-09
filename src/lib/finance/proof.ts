// Validasi file bukti transfer dari isinya (magic bytes), bukan dari nama
// file atau Content-Type yang bisa dipalsukan.

/** Di bawah batas body fungsi Vercel (4,5 MB) dikurangi overhead multipart. */
export const MAX_PROOF_BYTES = 4 * 1024 * 1024;

export type ProofType = { ext: "jpg" | "png" | "webp" | "pdf"; mime: string };

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((b, i) => bytes[offset + i] === b);
}

export function detectProofType(bytes: Uint8Array): ProofType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { ext: "jpg", mime: "image/jpeg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: "png", mime: "image/png" };
  // RIFF....WEBP
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { ext: "webp", mime: "image/webp" };
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { ext: "pdf", mime: "application/pdf" }; // %PDF-
  return null;
}

export function proofObjectPath(memberId: string, invoiceId: string, fileId: string, ext: string): string {
  return `${memberId}/${invoiceId}/${fileId}.${ext}`;
}
