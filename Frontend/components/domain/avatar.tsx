import { cn, initials } from "@/lib/utils";

/** Deterministic initials avatar (no external images). */
export function Avatar({ name, className }: { name: string; className?: string }) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return (
    <div
      className={cn("grid size-8 shrink-0 place-items-center rounded-md border text-[11px] font-semibold tracking-wide", className)}
      style={{
        background: `hsl(${hue} 18% 14%)`,
        borderColor: `hsl(${hue} 18% 24%)`,
        color: `hsl(${hue} 30% 78%)`,
      }}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  );
}
