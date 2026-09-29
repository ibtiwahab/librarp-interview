"use client";

import * as React from "react";
import { Reorder, useDragControls } from "motion/react";
import { Copy, CornerDownRight, EyeOff, GripVertical, MoreHorizontal, Pencil, Power, Trash2 } from "lucide-react";
import { cn, pluralize } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Question } from "@/types/api";

export interface QuestionRowActions {
  onEdit: (q: Question) => void;
  onDuplicate: (q: Question) => void;
  onToggleActive: (q: Question) => void;
  onDelete: (q: Question) => void;
}

function Body({ q, number }: { q: Question; number: number }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-start gap-3">
        <span className="tabular mt-0.5 w-7 shrink-0 font-mono text-xs text-subtle-foreground">{String(number).padStart(2, "0")}</span>
        <div className="min-w-0 flex-1">
          <p className={cn("text-[13.5px] leading-snug", !q.active && "text-muted-foreground line-through decoration-subtle-foreground/50")}>
            {q.questionText}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {q.category && <Badge>{q.category}</Badge>}
            {q.followUpPrompts.length > 0 && (
              <button onClick={() => setOpen((o) => !o)} className="inline-flex">
                <Badge tone="gold" className="cursor-pointer hover:border-primary/60">
                  <CornerDownRight /> {pluralize(q.followUpPrompts.length, "follow-up")}
                </Badge>
              </button>
            )}
            {q.expectedAnswer && <Badge tone="info">Reference answer</Badge>}
            <Badge tone={q.required ? "base" : "neutral"}>{q.required ? "Required" : "Optional"}</Badge>
            {!q.active && (
              <Badge tone="danger">
                <EyeOff /> Inactive
              </Badge>
            )}
          </div>
          {open && (
            <div className="mt-2 space-y-1 border-l border-primary/30 pl-3">
              {q.followUpPrompts.map((f, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  {f}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RowMenu({ q, actions }: { q: Question; actions: QuestionRowActions }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Question actions">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => actions.onEdit(q)}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onDuplicate(q)}>
          <Copy /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onToggleActive(q)}>
          <Power /> {q.active ? "Deactivate" : "Activate"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => actions.onDelete(q)}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function QuestionRow({
  q,
  number,
  canManage,
  selected,
  onSelect,
  actions,
}: {
  q: Question;
  number: number;
  canManage: boolean;
  selected: boolean;
  onSelect: (v: boolean) => void;
  actions: QuestionRowActions;
}) {
  return (
    <div
      className={cn(
        "group flex items-start gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-[#111114]",
        selected && "bg-primary-soft/40 hover:bg-primary-soft/50",
      )}
    >
      {canManage && <Checkbox className="mt-0.5" checked={selected} onCheckedChange={(v) => onSelect(v === true)} aria-label="Select question" />}
      <Body q={q} number={number} />
      {canManage && (
        <div className="opacity-60 transition-opacity group-hover:opacity-100">
          <RowMenu q={q} actions={actions} />
        </div>
      )}
    </div>
  );
}

export function ReorderRow({ q, number }: { q: Question; number: number }) {
  const controls = useDragControls();
  return (
    <Reorder.Item value={q} dragListener={false} dragControls={controls} className="flex items-start gap-3 border-b border-border bg-card px-4 py-3">
      <button
        className="mt-0.5 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        onPointerDown={(e) => controls.start(e)}
        aria-label="Drag to reorder"
      >
        <GripVertical className="size-4" />
      </button>
      <Body q={q} number={number} />
    </Reorder.Item>
  );
}
