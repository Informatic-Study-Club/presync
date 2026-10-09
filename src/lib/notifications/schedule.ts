// Aturan kuota dan jadwal ulang pengiriman outbox (docs/ARSITEKTUR.md bagian 12).
// Fungsi murni supaya mudah dites.

/** Email per hari untuk worker; 20 sisanya disisakan untuk email auth. */
export const EMAIL_DAILY_CAP = 80;
/** Undangan aktivasi dikirim bertahap (30-50 per hari). */
export const ACTIVATION_DAILY_CAP = 40;
export const MAX_ATTEMPTS = 5;
/** Klaim "sending" yang lebih lama dari ini dianggap macet dan diantrekan lagi. */
export const STALE_CLAIM_MS = 30 * 60 * 1000;

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000; // WIB, tanpa daylight saving
const DAY_MS = 24 * 60 * 60 * 1000;

/** Awal hari (00:00 WIB) untuk waktu tertentu, sebagai Date UTC. */
export function jakartaDayStart(now: Date): Date {
  const shifted = now.getTime() + JAKARTA_OFFSET_MS;
  return new Date(shifted - (shifted % DAY_MS) - JAKARTA_OFFSET_MS);
}

/** Jeda sebelum percobaan berikutnya: 15 menit, 30, 60, ... maksimal 24 jam. */
export function retryDelayMs(attempts: number): number {
  const base = 15 * 60 * 1000;
  return Math.min(base * 2 ** Math.max(0, attempts - 1), DAY_MS);
}

export type QueuedEmail = { id: number; template: string };

/**
 * Memilih email yang dikirim pada putaran ini tanpa melampaui kuota harian.
 * Email selain aktivasi didahulukan; urutan antrean dipertahankan.
 */
export function selectEmailBatch(
  queued: readonly QueuedEmail[],
  usage: { sentToday: number; activationSentToday: number },
  caps = { daily: EMAIL_DAILY_CAP, activation: ACTIVATION_DAILY_CAP },
): number[] {
  let remaining = Math.max(0, caps.daily - usage.sentToday);
  let activationRemaining = Math.max(0, caps.activation - usage.activationSentToday);
  const selected: number[] = [];

  for (const item of queued) {
    if (remaining === 0) break;
    if (item.template === "activation") continue;
    selected.push(item.id);
    remaining--;
  }
  for (const item of queued) {
    if (remaining === 0 || activationRemaining === 0) break;
    if (item.template !== "activation") continue;
    selected.push(item.id);
    remaining--;
    activationRemaining--;
  }
  return selected;
}
