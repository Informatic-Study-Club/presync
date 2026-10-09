import { Alert, AlertDescription } from "@/components/ui/alert";

export function FormMessage({ error, success }: { error?: string; success?: string }) {
  if (error) {
    return (
      <Alert variant="destructive" aria-live="polite">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (success) {
    return (
      <Alert aria-live="polite">
        <AlertDescription>{success}</AlertDescription>
      </Alert>
    );
  }
  return null;
}
