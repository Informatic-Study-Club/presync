"use client";

import { Scanner } from "@yudiel/react-qr-scanner";
import { type KeyboardEvent, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { scanAction } from "@/lib/attendance/actions";
import { inferKeyboardSource, type ScanSource } from "@/lib/attendance/rules";
import type { ScanResult } from "@/lib/attendance/service";
import { cn } from "@/lib/utils";
import { id as t } from "@/messages/id";

const s = t.attendance.scanner;
const DEVICE_KEY = "presync-device-id";
/** Kode yang sama dari kamera diabaikan selama jeda ini. */
const CAMERA_DEDUPE_MS = 3000;

function deviceId(): string | null {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID().replaceAll("-", "");
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

type Entry = ScanResult & { key: number; raw: string; at: string };

/** Pesan kamera yang spesifik, supaya petugas tahu langkah perbaikannya. */
function cameraMessage(error: unknown): string {
  if (typeof window !== "undefined" && !window.isSecureContext) return s.cameraInsecure;
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return s.cameraDenied;
  if (name === "NotFoundError" || name === "OverconstrainedError") return s.cameraNotFound;
  if (name === "NotReadableError" || name === "AbortError") return s.cameraInUse;
  return s.cameraError;
}

const TONE = {
  recorded: "border-emerald-500/60 bg-emerald-500/15",
  duplicate: "border-amber-500/60 bg-amber-500/15",
  rejected: "border-red-500/60 bg-red-500/15",
} as const;

export function AttendanceScanner({ sessionId }: { sessionId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const keyTimes = useRef<number[]>([]);
  const lastCamera = useRef<{ raw: string; at: number } | null>(null);
  const counter = useRef(0);

  const submit = useCallback(
    (raw: string, source: ScanSource) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      startTransition(async () => {
        // Galat jaringan/server tidak boleh membuat pemindai diam tanpa kabar.
        const result: ScanResult = await scanAction({ sessionId, raw: trimmed, source, deviceId: deviceId() }).catch(
          (): ScanResult => ({ kind: "rejected", message: s.serverError }),
        );
        counter.current += 1;
        const at = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setEntries((prev) => [{ ...result, key: counter.current, raw: trimmed, at }, ...prev].slice(0, 15));
        inputRef.current?.focus();
      });
    },
    [sessionId],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      submit(value, inferKeyboardSource(keyTimes.current));
      setValue("");
      keyTimes.current = [];
      return;
    }
    if (event.key.length === 1) keyTimes.current.push(performance.now());
  }

  const latest = entries[0];

  return (
    <div className="space-y-4">
      <div className={cn("min-h-40 rounded-xl border-2 p-5", latest ? TONE[latest.kind] : "border-dashed")}>
        {latest ? (
          <div className="space-y-1">
            <p className="text-lg font-semibold">{latest.message}</p>
            {latest.member ? (
              <>
                <p className="text-3xl font-bold tracking-tight">{latest.member.fullName}</p>
                <p className="text-lg">
                  {latest.member.divisionName} · {t.dashboard.batch} {latest.member.batch} ·{" "}
                  <span className="font-mono">{latest.member.memberCode}</span>
                </p>
              </>
            ) : (
              <p className="font-mono text-muted-foreground">{latest.raw}</p>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">{s.description}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="scan-input">{s.input}</Label>
        <div className="flex gap-2">
          <Input
            id="scan-input"
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono text-lg"
          />
          <Button
            type="button"
            disabled={pending || !value.trim()}
            onClick={() => {
              submit(value, "typed");
              setValue("");
            }}
          >
            {s.submit}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{s.inputHint}</p>
      </div>

      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setCameraError(null);
            setCameraOn((on) => !on);
            // Kembalikan fokus supaya pemindai USB/Bluetooth tetap mengetik ke kolom kode.
            inputRef.current?.focus();
          }}
        >
          {cameraOn ? s.stopCamera : s.startCamera}
        </Button>
        {cameraError ? <p className="text-sm text-destructive">{cameraError}</p> : null}
        {cameraOn && !cameraError ? <p className="text-xs text-muted-foreground">{s.cameraHint}</p> : null}
        {cameraOn ? (
          <div className="mx-auto max-w-sm overflow-hidden rounded-lg">
            <Scanner
              formats={["code_128", "qr_code"]}
              allowMultiple
              scanDelay={800}
              // Code 128 butuh resolusi tinggi: pada 640x480 (bawaan browser)
              // garis barcode kartu terlalu rapat untuk terbaca.
              constraints={{
                facingMode: "environment",
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              }}
              onError={(error) => setCameraError(cameraMessage(error))}
              onScan={(codes) => {
                const raw = codes[0]?.rawValue;
                if (!raw) return;
                const now = Date.now();
                const last = lastCamera.current;
                if (last && last.raw === raw && now - last.at < CAMERA_DEDUPE_MS) return;
                lastCamera.current = { raw, at: now };
                submit(raw, "camera");
              }}
            />
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{s.lastScans}</p>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{s.noScans}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {entries.map((e) => (
              <li key={e.key} className={cn("rounded-md border px-3 py-1.5", TONE[e.kind])}>
                <span className="text-muted-foreground">{e.at}</span>{" "}
                <span className="font-medium">{e.member?.fullName ?? e.raw}</span> · {e.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
