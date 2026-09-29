"use client";

import * as React from "react";
import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/api-client";
import { Button } from "./button";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" className={cn("animate-pulse rounded-md bg-[#18181d]", className)} {...props} />;
}

function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin text-muted-foreground", className)} />;
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {Icon && (
        <div className="mb-4 grid size-11 place-items-center rounded-lg border border-border bg-raised">
          <Icon className="size-5 text-muted-foreground" />
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
  title = "Couldn't load this",
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <div className="mb-4 grid size-11 place-items-center rounded-lg border border-destructive/30 bg-destructive-soft">
        <AlertTriangle className="size-5 text-destructive" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>
          <RotateCw /> Try again
        </Button>
      )}
    </div>
  );
}

function Notice({
  tone = "info",
  icon: Icon,
  children,
  className,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-info/25 bg-info-soft text-[#b9c8ea]",
    warning: "border-warning/25 bg-warning-soft text-[#ecd09a]",
    danger: "border-destructive/30 bg-destructive-soft text-[#f2b3a5]",
    success: "border-success/25 bg-success-soft text-[#9fdcbe]",
  };
  return (
    <div className={cn("flex gap-2.5 rounded-md border px-3 py-2.5 text-[13px] leading-relaxed", tones[tone], className)}>
      {Icon && <Icon className="mt-0.5 size-4 shrink-0" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export { Skeleton, Spinner, EmptyState, ErrorState, Notice };
