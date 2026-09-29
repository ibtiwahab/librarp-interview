import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="scroll-thin relative w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom border-collapse text-[13px]", className)} {...props} />
    </div>
  );
}

function THead({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("[&_tr]:border-b [&_tr]:border-border", className)} {...props} />;
}

function TBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

function TR({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("border-b border-border transition-colors", className)} {...props} />;
}

function TH({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn("h-9 px-4 text-left align-middle text-[11px] font-medium tracking-wider whitespace-nowrap text-subtle-foreground uppercase", className)}
      {...props}
    />
  );
}

function TD({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-4 py-3 align-middle", className)} {...props} />;
}

function Pagination({
  page,
  totalPages,
  total,
  onPage,
  label = "results",
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
  label?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
      <span className="tabular">
        {total} {label}
      </span>
      <div className="flex items-center gap-2">
        <span className="tabular">
          Page {page} of {totalPages}
        </span>
        <Button variant="secondary" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <Button variant="secondary" size="icon-sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

export { Table, THead, TBody, TR, TH, TD, Pagination };
