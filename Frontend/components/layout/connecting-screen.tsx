"use client";

import { motion } from "motion/react";
import { RotateCw, WifiOff } from "lucide-react";
import { LibraMark } from "@/components/brand/libra-mark";
import { Button } from "@/components/ui/button";

/**
 * Shown while the API wakes up (free-tier hosts sleep when idle) or when it
 * cannot be reached at all. Never a raw network error.
 */
export function ConnectingScreen({ state, onRetry }: { state: "restoring" | "connecting" | "unreachable"; onRetry?: () => void }) {
  return (
    <div className="bg-grid relative flex min-h-dvh items-center justify-center overflow-hidden px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,var(--background)_75%)]" />
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative flex max-w-sm flex-col items-center text-center"
      >
        <div className="relative mb-6 grid size-14 place-items-center rounded-xl border border-primary/30 bg-primary-soft text-primary">
          <LibraMark className="size-8" />
          {state !== "unreachable" && (
            <motion.span
              className="absolute inset-0 rounded-xl border border-primary/40"
              animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.18, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </div>
        {state === "unreachable" ? (
          <>
            <div className="flex items-center gap-2 text-sm font-medium">
              <WifiOff className="size-4 text-destructive" /> Libra RP services are unavailable
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              The staff API didn&apos;t respond. It may be restarting or under maintenance. Your work is safe — try again in a moment.
            </p>
            <Button variant="secondary" className="mt-6" onClick={onRetry}>
              <RotateCw /> Retry connection
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium tracking-wide">{state === "connecting" ? "Connecting to Libra RP services…" : "Loading…"}</p>
            {state === "connecting" && (
              <p className="mt-2 text-xs text-muted-foreground">
                The server may be waking up. This can take up to a minute on the first request.
              </p>
            )}
            <div className="mt-6 h-0.5 w-40 overflow-hidden rounded-full bg-border">
              <motion.div
                className="h-full w-1/3 rounded-full bg-primary"
                animate={{ x: ["-100%", "300%"] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
