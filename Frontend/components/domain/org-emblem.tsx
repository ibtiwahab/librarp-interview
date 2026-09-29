/* eslint-disable @next/next/no-img-element -- logos are configurable paths/URLs, not build-time assets */
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { Organization } from "@/types/api";

type OrgLike = Pick<Organization, "code" | "shortName" | "color" | "logo" | "category">;

const SIZES = {
  xs: "size-6 text-[9px] rounded",
  sm: "size-8 text-[10px] rounded-md",
  md: "size-10 text-xs rounded-md",
  lg: "size-14 text-sm rounded-lg",
};

function monogram(org: OrgLike): string {
  const s = org.shortName || org.code;
  if (s.length <= 4 && /^[A-Z]+$/.test(s)) return s;
  return s.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
}

/**
 * Organization emblem. Uses the configured logo when one exists; otherwise
 * renders a restrained monogram tile tinted with the organization colour.
 */
export function OrgEmblem({ org, size = "md", className }: { org: OrgLike; size?: keyof typeof SIZES; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  const color = org.color || "#8a8f98";

  if (org.logo && !failed) {
    return (
      <div className={cn("relative shrink-0 overflow-hidden border border-border-strong bg-[#0c0c0f]", SIZES[size], className)}>
        <img src={org.logo} alt="" className="size-full object-contain p-1" onError={() => setFailed(true)} />
      </div>
    );
  }

  return (
    <div
      className={cn("relative grid shrink-0 place-items-center overflow-hidden border font-mono font-semibold tracking-wider", SIZES[size], className)}
      style={{
        borderColor: `${color}55`,
        background: `linear-gradient(160deg, ${color}26, ${color}0d 60%, transparent)`,
        color: `color-mix(in oklab, ${color} 55%, white)`,
      }}
      aria-hidden="true"
    >
      <span className="relative">{monogram(org)}</span>
      <span className="absolute inset-x-0 top-0 h-px" style={{ background: `${color}88` }} />
    </div>
  );
}
