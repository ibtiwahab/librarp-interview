"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { OrgEmblem } from "./org-emblem";
import { StatusBadge } from "./badges";
import { useOrganizations } from "@/hooks/queries";
import { INTERVIEW_TYPE_META } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { InterviewSummary, Organization } from "@/types/api";

export function useOrgLookup() {
  const { data } = useOrganizations(true);
  const map = new Map<string, Organization>((data?.organizations ?? []).map((o) => [o.code, o]));
  return (code: string) =>
    map.get(code) ?? ({ code, name: code, shortName: code, color: "#8a8f98", logo: "", category: "STATE" } as unknown as Organization);
}

/** Compact interview card used on the dashboard and in lists. */
export function InterviewRow({ interview, href }: { interview: InterviewSummary; href?: string }) {
  const org = useOrgLookup()(interview.organization);
  const link = href ?? (interview.status === "IN_PROGRESS" ? `/interviews/${interview.id}` : `/interviews/${interview.id}`);
  return (
    <Link
      href={link}
      className="group flex items-center gap-3 border-b border-border px-5 py-3 transition-colors last:border-b-0 hover:bg-[#121216]"
    >
      <OrgEmblem org={org} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium">{interview.candidate.name}</span>
          <StatusBadge status={interview.status} />
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {org.shortName} {interview.interviewType === "ADMIN" ? "Admin" : "Leadership"} · {INTERVIEW_TYPE_META[interview.interviewType].short} ·
          Interviewed by {interview.interviewer.displayName}
        </div>
      </div>
      <div className="hidden text-right text-xs text-muted-foreground sm:block">{formatDate(interview.interviewDate, "MMM d, yyyy")}</div>
      <ChevronRight className="size-4 text-subtle-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
