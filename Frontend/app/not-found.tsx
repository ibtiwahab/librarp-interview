import Link from "next/link";
import { LibraMark } from "@/components/brand/libra-mark";

export default function NotFound() {
  return (
    <div className="bg-grid flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <LibraMark className="size-10 text-primary/70" />
      <p className="mt-6 font-mono text-xs tracking-[0.3em] text-muted-foreground">ERROR 404</p>
      <h1 className="mt-2 text-xl font-semibold">This page doesn&apos;t exist</h1>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">The link may be outdated, or the record was removed.</p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex h-9 items-center rounded-md border border-border-strong px-4 text-sm font-medium transition-colors hover:bg-accent"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
