"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "Pick one" option styling. Unselected options are neutral grey with an empty
 * radio circle; the selected option gets a solid coloured border, tinted
 * background and a filled circle with a check, so the choice is unmistakable.
 */
export type ChoiceTone = "success" | "warning" | "danger" | "neutral" | "gold";

export const CHOICE_TONES: Record<ChoiceTone, { selected: string; fill: string; text: string }> = {
  success: { selected: "border-success bg-success/15 text-success", fill: "border-success bg-success", text: "text-success" },
  warning: { selected: "border-warning bg-warning/15 text-warning", fill: "border-warning bg-warning", text: "text-warning" },
  danger: { selected: "border-destructive bg-destructive/15 text-destructive", fill: "border-destructive bg-destructive", text: "text-destructive" },
  neutral: { selected: "border-muted-foreground bg-white/[0.07] text-foreground", fill: "border-muted-foreground bg-muted-foreground", text: "text-foreground" },
  gold: { selected: "border-primary bg-primary/15 text-primary", fill: "border-primary bg-primary", text: "text-primary" },
};

export function ChoiceIndicator({ checked, tone }: { checked: boolean; tone: ChoiceTone }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-[18px] shrink-0 place-items-center rounded-full border-2 transition-colors",
        checked ? CHOICE_TONES[tone].fill : "border-border-strong bg-transparent group-hover:border-muted-foreground",
      )}
    >
      {checked && <Check className="size-3 text-[#0b0b0d]" strokeWidth={3.5} />}
    </span>
  );
}

/** Base classes for a selectable option button. */
export function choiceClasses(checked: boolean, tone: ChoiceTone) {
  return cn(
    "group rounded-lg border-2 text-left transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
    checked
      ? CHOICE_TONES[tone].selected
      : "border-border bg-[#0c0c0f] text-muted-foreground hover:border-border-strong hover:bg-[#111114] hover:text-foreground",
  );
}

/**
 * Arrow-key navigation for a radiogroup of buttons (←/→/↑/↓ move and select).
 * Spread the result onto the radiogroup container.
 */
export function useRadioKeys<T>(values: readonly T[], value: T | null, onChange: (v: T) => void) {
  return {
    onKeyDown: (e: React.KeyboardEvent) => {
      const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const i = value === null ? -1 : values.indexOf(value);
      const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
      const next = values[(i + step + values.length) % values.length]!;
      onChange(next);
      const group = e.currentTarget as HTMLElement;
      requestAnimationFrame(() => group.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
    },
  };
}
