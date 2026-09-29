import { cn } from "@/lib/utils";

/** Stylised Libra scales — the console's mark. Pure SVG, no external assets. */
export function LibraMark({ className, strokeWidth = 1.6 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn("size-6", className)} aria-hidden="true">
      <path d="M16 5v21" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M10.5 27h11" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M6 9.5h20" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <circle cx="16" cy="5" r="1.6" fill="currentColor" />
      <path d="M8.5 9.5 4.5 18h8l-4-8.5Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M23.5 9.5 19.5 18h8l-4-8.5Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M4.5 18c0 2 1.8 3.2 4 3.2s4-1.2 4-3.2" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M19.5 18c0 2 1.8 3.2 4 3.2s4-1.2 4-3.2" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="grid size-8 place-items-center rounded-md border border-primary/30 bg-primary-soft text-primary">
        <LibraMark className="size-5" />
      </div>
      {!compact && (
        <div className="leading-none">
          <div className="text-[13px] font-semibold tracking-[0.22em] text-foreground">LIBRA RP</div>
          <div className="mt-1 text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">Staff Console</div>
        </div>
      )}
    </div>
  );
}
