import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { id as t } from "@/messages/id";

// Field mode, lokasi, dan tautan meeting. Validasi kombinasinya di server
// (src/lib/academic/validation.ts).
export function VenueFields({
  prefix,
  mode = "offline",
  location,
  meetingUrl,
}: {
  prefix: string;
  mode?: "offline" | "online" | "hybrid";
  location?: string | null;
  meetingUrl?: string | null;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-mode`}>{t.academic.fields.mode}</Label>
        <NativeSelect id={`${prefix}-mode`} name="mode" defaultValue={mode} className="w-full">
          {(["offline", "online", "hybrid"] as const).map((m) => (
            <option key={m} value={m}>
              {t.academic.mode[m]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-location`}>{t.academic.fields.location}</Label>
        <Input id={`${prefix}-location`} name="location" defaultValue={location ?? ""} maxLength={200} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-url`}>{t.academic.fields.meetingUrl}</Label>
        <Input
          id={`${prefix}-url`}
          name="meetingUrl"
          type="url"
          defaultValue={meetingUrl ?? ""}
          placeholder="https://"
          maxLength={500}
        />
      </div>
    </div>
  );
}

export function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
