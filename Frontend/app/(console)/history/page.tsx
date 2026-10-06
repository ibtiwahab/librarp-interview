"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { FilterX, History, Search, SlidersHorizontal, Video } from "lucide-react";
import { useInterviewers, useInterviews, useOrganizations } from "@/hooks/queries";
import { useUrlState } from "@/hooks/use-url-state";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { INTERVIEW_TYPE_META, STATUS_META } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { OrgEmblem } from "@/components/domain/org-emblem";
import { StatusBadge } from "@/components/domain/badges";
import { ScorePill } from "@/components/interviews/score";
import { useOrgLookup } from "@/components/domain/interview-row";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Pagination, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import type { InterviewStatus, InterviewType, OrganizationCode } from "@/types/api";

const DEFAULTS = {
  q: "",
  organization: "",
  type: "",
  status: "",
  interviewer: "",
  from: "",
  to: "",
  discordId: "",
  inGameId: "",
  mine: "",
  page: "1",
};

function HistoryView() {
  const router = useRouter();
  const [f, setF] = useUrlState(DEFAULTS);
  const [search, setSearch] = React.useState(f.q);
  const debounced = useDebouncedValue(search, 350);
  const [moreOpen, setMoreOpen] = React.useState(!!(f.discordId || f.inGameId || f.from || f.to));
  const orgs = useOrganizations(true);
  const interviewers = useInterviewers();
  const orgOf = useOrgLookup();

  React.useEffect(() => {
    if (debounced !== f.q) setF({ q: debounced, page: "1" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const page = Math.max(1, Number(f.page) || 1);
  const { data, error, isLoading, isFetching, refetch } = useInterviews({
    search: f.q || undefined,
    organization: (f.organization || undefined) as OrganizationCode | undefined,
    interviewType: (f.type || undefined) as InterviewType | undefined,
    status: (f.status || undefined) as InterviewStatus | undefined,
    interviewer: f.interviewer || undefined,
    from: f.from || undefined,
    to: f.to || undefined,
    discordId: f.discordId || undefined,
    inGameId: f.inGameId || undefined,
    mine: f.mine === "1",
    page,
    limit: 25,
  });

  const filtered = Object.entries(f).some(([k, v]) => k !== "page" && v !== "");
  const clear = () => {
    setSearch("");
    setF({ ...DEFAULTS });
  };

  const visibleOrgs = (orgs.data?.organizations ?? []).filter((o) => !f.type || o.category === f.type);

  return (
    <>
      <PageHeader
        eyebrow="Records"
        title="Interview history"
        description="Every interview you're permitted to see. Deleted interviews are hidden."
      />
      <PageBody className="space-y-4">
        <Card className="p-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search candidate, Discord, in-game name or interviewer…"
                className="pl-9"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex">
              <NativeSelect value={f.type} onChange={(e) => setF({ type: e.target.value, organization: "", page: "1" })} className="lg:w-36">
                <option value="">All types</option>
                {(Object.keys(INTERVIEW_TYPE_META) as InterviewType[]).map((t) => (
                  <option key={t} value={t}>
                    {INTERVIEW_TYPE_META[t].label}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect value={f.organization} onChange={(e) => setF({ organization: e.target.value, page: "1" })} className="lg:w-40">
                <option value="">All organizations</option>
                {visibleOrgs.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.shortName}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect value={f.status} onChange={(e) => setF({ status: e.target.value, page: "1" })} className="lg:w-36">
                <option value="">Any result</option>
                {(Object.keys(STATUS_META) as InterviewStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect value={f.interviewer} onChange={(e) => setF({ interviewer: e.target.value, page: "1" })} className="lg:w-44">
                <option value="">Any interviewer</option>
                {(interviewers.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex gap-2">
              <Button variant={moreOpen ? "secondary" : "ghost"} size="sm" onClick={() => setMoreOpen((o) => !o)}>
                <SlidersHorizontal /> More
              </Button>
              {filtered && (
                <Button variant="ghost" size="sm" onClick={clear}>
                  <FilterX /> Clear
                </Button>
              )}
            </div>
          </div>
          {moreOpen && (
            <div className="mt-2 grid gap-2 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-5">
              <Input placeholder="Discord ID" className="font-mono" value={f.discordId} onChange={(e) => setF({ discordId: e.target.value.trim(), page: "1" })} />
              <Input placeholder="In-game ID" className="font-mono" value={f.inGameId} onChange={(e) => setF({ inGameId: e.target.value.trim(), page: "1" })} />
              <Input type="date" aria-label="From date" value={f.from} onChange={(e) => setF({ from: e.target.value, page: "1" })} />
              <Input type="date" aria-label="To date" value={f.to} onChange={(e) => setF({ to: e.target.value, page: "1" })} />
              <label className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-[13px] text-muted-foreground">
                <input type="checkbox" className="accent-[#c9a45c]" checked={f.mine === "1"} onChange={(e) => setF({ mine: e.target.checked ? "1" : "", page: "1" })} />
                Only my interviews
              </label>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          {error ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : isLoading ? (
            <div className="space-y-px p-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !data || data.items.length === 0 ? (
            <EmptyState
              icon={History}
              title={filtered ? "No interviews match these filters" : "No interviews yet"}
              description={filtered ? "Try widening the search or clearing filters." : "Completed and in-progress interviews will appear here."}
              action={filtered ? <Button variant="secondary" onClick={clear}>Clear filters</Button> : undefined}
            />
          ) : (
            <div className={isFetching ? "opacity-70 transition-opacity" : "transition-opacity"}>
              <Table>
                <THead>
                  <TR>
                    <TH>Candidate</TH>
                    <TH>Organization</TH>
                    <TH className="hidden md:table-cell">Type</TH>
                    <TH>Result</TH>
                    <TH className="hidden sm:table-cell">Score</TH>
                    <TH className="hidden lg:table-cell">Interviewer</TH>
                    <TH className="text-right">Date</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.items.map((i) => {
                    const org = orgOf(i.organization);
                    return (
                      <TR
                        key={i.id}
                        className="cursor-pointer hover:bg-[#121216]"
                        onClick={() => router.push(i.status === "IN_PROGRESS" ? `/interviews/${i.id}` : `/interviews/${i.id}`)}
                      >
                        <TD>
                          <div className="flex items-center gap-1.5 font-medium">
                            {i.candidate.name}
                            {i.recordingLinks?.length > 0 && <Video className="size-3.5 text-primary" aria-label="Recording linked" />}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {[i.candidate.discordUsername, i.candidate.inGameName].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </TD>
                        <TD>
                          <div className="flex items-center gap-2.5">
                            <OrgEmblem org={org} size="xs" />
                            <span>
                              {org.shortName} {i.interviewType === "ADMIN" ? "" : "Leadership"}
                            </span>
                          </div>
                        </TD>
                        <TD className="hidden text-muted-foreground md:table-cell">{INTERVIEW_TYPE_META[i.interviewType].short}</TD>
                        <TD>
                          <StatusBadge status={i.status} />
                        </TD>
                        <TD className="hidden sm:table-cell">
                          <ScorePill progress={i.progress} />
                        </TD>
                        <TD className="hidden text-muted-foreground lg:table-cell">{i.interviewer.displayName}</TD>
                        <TD className="text-right whitespace-nowrap text-muted-foreground">{formatDate(i.interviewDate, "MMM d, yyyy")}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
              <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={(p) => setF({ page: String(p) })} label="interviews" />
            </div>
          )}
        </Card>
      </PageBody>
    </>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<Skeleton className="m-8 h-64" />}>
      <HistoryView />
    </Suspense>
  );
}
