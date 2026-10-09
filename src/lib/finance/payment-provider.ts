// Antarmuka payment gateway (docs/ARSITEKTUR.md bagian 11, "Siap gateway").
// Belum ada implementasi: provider dipilih setelah persyaratan KYC/KYB dicek.
// Implementasi nanti wajib:
// - verifikasi tanda tangan webhook,
// - idempoten berdasarkan provider_order_id (unik di tabel payments),
// - mencocokkan nominal dengan tagihan sebelum menandai lunas,
// - mencatat biaya gateway (fee_amount) sebagai pengeluaran terpisah,
// - rekonsiliasi harian status provider dengan database.

export type ChargeInput = {
  invoiceId: string;
  memberId: string;
  /** Rupiah utuh. */
  amount: number;
  description: string;
  customer: { name: string; email: string; phone: string };
  /** URL kembali setelah pembayaran di halaman provider. */
  returnUrl: string;
};

export type ChargeResult = {
  providerOrderId: string;
  /** URL halaman pembayaran provider untuk anggota. */
  paymentUrl: string;
  expiresAt: Date;
};

export type ProviderStatus = "pending" | "paid" | "expired" | "failed" | "refunded";

export type WebhookEvent = {
  providerOrderId: string;
  status: ProviderStatus;
  /** Nominal yang benar-benar dibayar (rupiah utuh). */
  amount: number;
  /** Biaya gateway bila dilaporkan provider. */
  feeAmount: number | null;
  raw: unknown;
};

export interface PaymentProvider {
  readonly name: string;
  createCharge(input: ChargeInput): Promise<ChargeResult>;
  /** Melempar error bila tanda tangan tidak valid. */
  verifyWebhook(req: Request): Promise<WebhookEvent>;
  getStatus(providerOrderId: string): Promise<ProviderStatus>;
}
