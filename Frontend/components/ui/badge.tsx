import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded border px-1.5 py-px text-[11px] font-medium leading-4 tracking-wide [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "border-border-strong bg-muted text-muted-foreground",
        gold: "border-primary/35 bg-primary-soft text-primary",
        success: "border-success/35 bg-success-soft text-success",
        danger: "border-destructive/35 bg-destructive-soft text-destructive",
        warning: "border-warning/35 bg-warning-soft text-warning",
        info: "border-info/35 bg-info-soft text-info",
        steel: "border-[#8fa3bf]/30 bg-[#8fa3bf]/10 text-[#aebfd6]",
        state: "border-[#6b8fd6]/30 bg-[#6b8fd6]/10 text-[#94aee6]",
        crime: "border-[#c46a5a]/30 bg-[#c46a5a]/10 text-[#e0917f]",
        support: "border-[#8c7cc9]/30 bg-[#8c7cc9]/10 text-[#b3a6e6]",
        base: "border-border-strong bg-transparent text-muted-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

function Badge({ className, tone, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
