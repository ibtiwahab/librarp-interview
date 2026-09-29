"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive, Switch as SwitchPrimitive, Tabs as TabsPrimitive, Tooltip as TooltipPrimitive } from "radix-ui";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Checkbox ─── */
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer grid size-4 shrink-0 place-items-center rounded-[4px] border border-border-strong bg-[#0c0c0f] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        {props.checked === "indeterminate" ? <Minus className="size-3" strokeWidth={3} /> : <Check className="size-3" strokeWidth={3} />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

/* ─── Switch ─── */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border-strong bg-[#1c1c22] p-px transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 data-[state=checked]:border-primary/70 data-[state=checked]:bg-primary/85",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-[#e8e8ec] shadow transition-transform data-[state=checked]:translate-x-4 data-[state=checked]:bg-[#16130d]" />
    </SwitchPrimitive.Root>
  );
}

/* ─── Tabs ─── */
const Tabs = TabsPrimitive.Root;

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("inline-flex h-9 items-center gap-0.5 rounded-lg border border-border bg-[#0c0c0f] p-0.5", className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex h-full items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 data-[state=active]:bg-secondary data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_0_rgb(255_255_255/0.04)_inset,0_1px_2px_rgb(0_0_0/0.4)] [&_svg]:size-3.5",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("outline-none", className)} {...props} />;
}

/* ─── Tooltip ─── */
const TooltipProvider = TooltipPrimitive.Provider;

function Tooltip({
  content,
  children,
  side = "top",
  disabled,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  disabled?: boolean;
}) {
  if (disabled || !content) return <>{children}</>;
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-72 rounded-md border border-border-strong bg-[#1a1a20] px-2.5 py-1.5 text-xs leading-relaxed text-foreground shadow-lg data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/* ─── Kbd ─── */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border-strong bg-[#141418] px-1 font-mono text-[10px] font-medium text-muted-foreground shadow-[0_1px_0_#2d2d36]",
        className,
      )}
      {...props}
    />
  );
}

export { Checkbox, Switch, Tabs, TabsList, TabsTrigger, TabsContent, Tooltip, TooltipProvider, Kbd };
