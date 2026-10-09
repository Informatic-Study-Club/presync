import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Select bawaan browser dengan gaya yang sama seperti Input. Dipakai di form
// GET dan Server Action sederhana yang tidak butuh komponen select kustom.
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}
