import * as React from "react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full min-w-0 rounded-md border border-input bg-[#0c0c0f] px-3 text-sm text-foreground shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)] transition-[border-color,box-shadow] outline-none placeholder:text-subtle-foreground focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive/70 aria-invalid:ring-destructive/20";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(fieldBase, "h-9 py-1", className)} {...props} />;
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(fieldBase, "min-h-20 resize-y py-2 leading-relaxed", className)} {...props} />;
}

function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        fieldBase,
        "h-9 cursor-pointer appearance-none bg-[url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b8b96' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>\")] bg-[length:12px] bg-[right_0.7rem_center] bg-no-repeat pr-8",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export { Input, Textarea, NativeSelect };
