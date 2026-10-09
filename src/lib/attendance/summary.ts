// Perhitungan kehadiran (docs/ARSITEKTUR.md bagian 9):
// - Hanya sesi berstatus "done" yang dihitung; sesi "off" tidak masuk penyebut
//   dan sesi "scheduled" belum dihitung.
// - Tidak Hadir otomatis untuk sesi "done" tanpa catatan.
// - Persentase = hadir / jumlah sesi "done". Izin dan Sakit tampil terpisah.

export type AttendanceStatus = "hadir" | "izin" | "sakit" | "tidak_hadir";

export type AttendanceSummary = {
  hadir: number;
  izin: number;
  sakit: number;
  tidakHadir: number;
  /** Penyebut: jumlah sesi berstatus done. */
  counted: number;
  /** Persen dengan satu desimal, null bila belum ada sesi done. */
  percent: number | null;
};

export function summarizeAttendance(
  sessions: readonly { id: string; status: "scheduled" | "done" | "off" }[],
  records: ReadonlyMap<string, AttendanceStatus>,
): AttendanceSummary {
  const summary: AttendanceSummary = { hadir: 0, izin: 0, sakit: 0, tidakHadir: 0, counted: 0, percent: null };
  for (const session of sessions) {
    if (session.status !== "done") continue;
    summary.counted++;
    const status = records.get(session.id) ?? "tidak_hadir";
    if (status === "hadir") summary.hadir++;
    else if (status === "izin") summary.izin++;
    else if (status === "sakit") summary.sakit++;
    else summary.tidakHadir++;
  }
  if (summary.counted > 0) {
    summary.percent = Math.round((summary.hadir / summary.counted) * 1000) / 10;
  }
  return summary;
}

export type ScanRecord = {
  id: string;
  recordedAt: Date;
  method: string;
  deviceId: string | null;
  recordedBy: string | null;
};

const SCAN_METHODS = new Set(["scan_barcode", "scan_qr", "manual_entry"]);

/**
 * Deteksi kejanggalan: dua scan berurutan dari perangkat (atau pencatat) yang
 * sama dalam jeda sangat singkat, misalnya kartu palsu dipindai beruntun.
 * Mengembalikan id catatan yang ditandai.
 */
export function detectRapidScans(records: readonly ScanRecord[], thresholdMs = 2000): Set<string> {
  const flagged = new Set<string>();
  const bySource = new Map<string, ScanRecord[]>();
  for (const r of records) {
    if (!SCAN_METHODS.has(r.method)) continue;
    const key = r.deviceId ?? `user:${r.recordedBy ?? "-"}`;
    const list = bySource.get(key) ?? [];
    list.push(r);
    bySource.set(key, list);
  }
  for (const list of bySource.values()) {
    list.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1] as ScanRecord;
      const curr = list[i] as ScanRecord;
      if (curr.recordedAt.getTime() - prev.recordedAt.getTime() < thresholdMs) {
        flagged.add(prev.id);
        flagged.add(curr.id);
      }
    }
  }
  return flagged;
}
