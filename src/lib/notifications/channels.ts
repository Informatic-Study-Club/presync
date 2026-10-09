// Pemilihan kanal per notifikasi (docs/ARSITEKTUR.md bagian 12). Fungsi murni.

export const NOTIFICATION_CATEGORIES = ["session_reminder", "finance"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export type Channel = "email" | "telegram" | "push";
export type ChannelPrefs = { email: boolean; telegram: boolean; push: boolean };

/**
 * Bawaan bila anggota belum mengatur. Pengingat sesi tidak lewat email karena
 * kuota (80 email/hari untuk worker; satu pengingat ke 85 anggota sudah
 * melewatinya), jadi mengandalkan Telegram dan web push.
 */
export const DEFAULT_PREFERENCES: Record<NotificationCategory, ChannelPrefs> = {
  session_reminder: { email: false, telegram: true, push: true },
  finance: { email: true, telegram: true, push: false },
};

export type Availability = {
  telegramLinked: boolean;
  pushSubscribed: boolean;
  /** Alamat email masuk daftar bounce/spam. */
  emailSuppressed: boolean;
};

export function resolveChannels(
  category: NotificationCategory,
  prefs: ChannelPrefs | null,
  availability: Availability,
): Channel[] {
  const p = prefs ?? DEFAULT_PREFERENCES[category];
  const channels: Channel[] = [];
  if (p.email && !availability.emailSuppressed) channels.push("email");
  if (p.telegram && availability.telegramLinked) channels.push("telegram");
  if (p.push && availability.pushSubscribed) channels.push("push");
  return channels;
}
