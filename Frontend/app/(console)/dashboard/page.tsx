"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleSlash,
  History,
  Inbox,
  Layers,
  Library,
  PauseCircle,
  PlayCircle,
  ScrollText,
  Users,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDashboard } from "@/hooks/queries";
import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { RoleList } from "@/components/domain/badges";
import { InterviewRow, useOrgLookup } from "@/components/domain/interview-row";
import { OrgEmblem } from "@/components/domain/org-emblem";
import { greeting, formatRelative } from "@/lib/format";
import { INTERVIEW_TYPE_META } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Capabilities, InterviewType } from "@/types/api";

function Stat({
  label,
  value,
  icon: Icon,
  tone,
  index,
}: {
  label: string;
  value: number | undefined;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "success" | "danger" | "warning" | "gold";
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      className="relative overflow-hidden rounded-lg border border-border bg-card px-4 py-3.5"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon
          className={cn(
            "size-4",
            tone === "success" && "text-success",
            tone === "danger" && "text-destructive",
            tone === "warning" && "text-warning",
            tone === "gold" && "text-primary",
            !tone && "text-subtle-foreground",
          )}
        />
      </div>
      {value === undefined ? (
        <Skeleton className="mt-2 h-7 w-12" />
      ) : (
        <div className="tabular mt-1.5 font-mono text-2xl font-semibold tracking-tight">{value}</div>
      )}
    </motion.div>
  );
}

const QUICK_ACTIONS: { href: string; label: string; description: string; icon: React.ComponentType<{ className?: string }>; anyOf: (keyof Capabilities)[] }[] = [
  { href: "/interviews/new", label: "Start interview", description: "Begin a new candidate interview", icon: PlayCircle, anyOf: ["canInterviewState", "canInterviewCrime", "canInterviewAdmins"] },
  { href: "/history", label: "Interview history", description: "Search past interviews", icon: History, anyOf: [] },
  { href: "/questions", label: "Question bank", description: "Browse and manage question sets", icon: Library, anyOf: ["canManageQuestions", "canInterviewState", "canInterviewCrime", "canInterviewAdmins"] },
  { href: "/admins", label: "Admin management", description: "Staff accounts and roles", icon: Users, anyOf: ["canViewAdmins"] },
  { href: "/audit", label: "Audit log", description: "Review administrative activity", icon: ScrollText, anyOf: ["canViewAuditLogs"] },
];

export default function DashboardPage() {
  const { user, can } = useAuth();
  const { data, error, refetch, isLoading } = useDashboard();
  const orgOf = useOrgLookup();

  const allowedTypes = (Object.keys(INTERVIEW_TYPE_META) as InterviewType[]).filter((t) => can(INTERVIEW_TYPE_META[t].capability));
  const actions = QUICK_ACTIONS.filter((a) => a.anyOf.length === 0 || a.anyOf.some((c) => can(c)));
  const canStart = allowedTypes.length > 0;

  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title={`${greeting()}, ${user?.displayName.split(" ")[0]}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            Signed in with <RoleList roles={user?.roles ?? []} short />
          </span>
        }
        actions={
          canStart && (
            <Button asChild>
              <Link href="/interviews/new">
                <PlayCircle /> Start interview
              </Link>
            </Button>
          )
        }
      />
      <PageBody className="space-y-6">
        {error ? (
          <Card>
            <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load the dashboard" />
          </Card>
        ) : (
          <>
            {data && data.activeInterviews.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="overflow-hidden rounded-lg border border-info/30 bg-info-soft">
                <div className="flex items-center gap-2 border-b border-info/20 px-5 py-2.5 text-xs font-medium tracking-wide text-info uppercase">
                  <span className="size-1.5 animate-pulse rounded-full bg-info" /> Interviews in progress
                </div>
                {data.activeInterviews.map((i) => {
                  const org = orgOf(i.organization);
                  return (
                    <div key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <OrgEmblem org={org} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{i.candidate.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {org.shortName} · {i.progress.answered}/{i.progress.total} answered · last activity {formatRelative(i.updatedAt)}
                        </div>
                      </div>
                      <Button asChild size="sm">
                        <Link href={`/interviews/${i.id}/live`}>
                          Resume <ArrowRight />
                        </Link>
                      </Button>
                    </div>
                  );
                })}
              </motion.div>
            )}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Stat index={0} label="Interviews today" value={data?.stats.interviewsToday} icon={CalendarClock} tone="gold" />
              <Stat index={1} label="Completed" value={data?.stats.completed} icon={Layers} />
              <Stat index={2} label="Passed" value={data?.stats.passed} icon={CheckCircle2} tone="success" />
              <Stat index={3} label="Failed" value={data?.stats.failed} icon={XCircle} tone="danger" />
              <Stat index={4} label="On hold" value={data?.stats.onHold} icon={PauseCircle} tone="warning" />
              <Stat index={5} label="Question sets" value={data?.stats.availableQuestionSets} icon={Library} />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
              <Card className="overflow-hidden">
                <CardHeader className="border-b border-border">
                  <div>
                    <CardTitle>Recent interviews</CardTitle>
                    <CardDescription>
                      {can("canViewAllInterviews") ? "Across all organizations" : "Within the interview categories you can access"}
                    </CardDescription>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/history">
                      View all <ArrowRight />
                    </Link>
                  </Button>
                </CardHeader>
                {isLoading ? (
                  <div className="space-y-px">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-5 py-3">
                        <Skeleton className="size-8" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3.5 w-40" />
                          <Skeleton className="h-3 w-64" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : data && data.recentInterviews.length > 0 ? (
                  data.recentInterviews.map((i) => <InterviewRow key={i.id} interview={i} />)
                ) : (
                  <EmptyState
                    icon={Inbox}
                    title="No interviews yet"
                    description={canStart ? "Start your first interview to see it here." : "Interviews you can access will appear here."}
                  />
                )}
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Quick actions</CardTitle>
                      <CardDescription>Only what your roles allow</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-1.5">
                    {actions.map((a) => (
                      <Link
                        key={a.href}
                        href={a.href}
                        className="group flex items-center gap-3 rounded-md border border-transparent px-2.5 py-2 transition-colors hover:border-border hover:bg-[#121216]"
                      >
                        <a.icon className="size-4 text-primary" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium">{a.label}</div>
                          <div className="text-xs text-muted-foreground">{a.description}</div>
                        </div>
                        <ArrowRight className="size-3.5 text-subtle-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Your interview access</CardTitle>
                      <CardDescription>Granted by your current roles</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(Object.keys(INTERVIEW_TYPE_META) as InterviewType[]).map((t) => {
                      const ok = can(INTERVIEW_TYPE_META[t].capability);
                      return (
                        <div key={t} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                          <span className={cn("text-[13px]", ok ? "text-foreground" : "text-subtle-foreground")}>{INTERVIEW_TYPE_META[t].label}</span>
                          {ok ? (
                            <CheckCircle2 className="size-4 text-success" />
                          ) : (
                            <CircleSlash className="size-4 text-subtle-foreground" />
                          )}
                        </div>
                      );
                    })}
                    {!canStart && (
                      <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
                        Your account can&apos;t conduct interviews yet. A curator role must be assigned by a senior administrator.
                      </p>
                    )}
                    {data && (
                      <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                        {[
                          ["Yours", data.mine.total],
                          ["Passed", data.mine.passed],
                          ["Active", data.mine.inProgress],
                        ].map(([k, v]) => (
                          <div key={k as string}>
                            <div className="tabular font-mono text-lg font-semibold">{v}</div>
                            <div className="text-[11px] text-muted-foreground">{k}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
