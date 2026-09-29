"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowRight, Building2, Check, Gavel, Library, PlayCircle, ShieldCheck, Skull } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useOrganizations, useQuestionSets, useSettings } from "@/hooks/queries";
import { interviewsService } from "@/services/interviews";
import { ApiError, errorMessage } from "@/lib/api-client";
import { CANDIDATE_FIELD_META, INTERVIEW_TYPE_META } from "@/lib/constants";
import { toDateInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { RequireCapability } from "@/components/layout/require-auth";
import { OrgEmblem } from "@/components/domain/org-emblem";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Notice, Skeleton } from "@/components/ui/feedback";
import type { CandidateFieldKey, InterviewType, Organization } from "@/types/api";

const TYPE_ICONS: Record<InterviewType, React.ComponentType<{ className?: string }>> = {
  STATE: Building2,
  CRIME: Skull,
  ADMIN: ShieldCheck,
};

function Steps({ step }: { step: number }) {
  const labels = ["Interview type", "Organization", "Candidate"];
  return (
    <ol className="flex items-center gap-2 text-xs">
      {labels.map((l, i) => (
        <li key={l} className="flex items-center gap-2">
          <span
            className={cn(
              "grid size-5 place-items-center rounded-full border font-mono text-[10px]",
              i < step && "border-primary bg-primary text-primary-foreground",
              i === step && "border-primary text-primary",
              i > step && "border-border-strong text-subtle-foreground",
            )}
          >
            {i < step ? <Check className="size-3" strokeWidth={3} /> : i + 1}
          </span>
          <span className={cn("hidden sm:inline", i === step ? "text-foreground" : "text-muted-foreground")}>{l}</span>
          {i < labels.length - 1 && <span className="h-px w-6 bg-border-strong" />}
        </li>
      ))}
    </ol>
  );
}

function SelectCard({
  selected,
  onClick,
  children,
  className,
}: {
  selected?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative rounded-lg border bg-card p-5 text-left transition-all duration-150 outline-none hover:border-border-strong hover:bg-[#121216] focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary/60 bg-[#14130f]" : "border-border",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────── Candidate step ─────────────────────────── */

const OPTIONAL_KEYS: CandidateFieldKey[] = ["discordUsername", "discordId", "inGameName", "inGameId", "age", "timezone"];

function CandidateStep({ org, onBack }: { org: Organization; onBack: () => void }) {
  const router = useRouter();
  const settings = useSettings();
  const sets = useQuestionSets({ organization: org.code });
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const fields = settings.data?.candidateFields;
  const schema = React.useMemo(() => {
    const req = (k: CandidateFieldKey) => !!fields?.[k]?.enabled && !!fields?.[k]?.required;
    const text = (k: CandidateFieldKey, max: number) =>
      req(k) ? z.string().trim().min(1, `${CANDIDATE_FIELD_META[k].label} is required.`).max(max) : z.string().trim().max(max);
    return z.object({
      name: z.string().trim().min(2, "Enter the candidate's name."),
      discordUsername: text("discordUsername", 64),
      discordId: text("discordId", 32).refine((v) => v === "" || /^\d{15,21}$/.test(v), "Discord IDs are 15–21 digits."),
      inGameName: text("inGameName", 100),
      inGameId: text("inGameId", 32),
      age: text("age", 3).refine((v) => v === "" || (/^\d+$/.test(v) && +v >= 10 && +v <= 100), "Enter a valid age."),
      timezone: text("timezone", 64),
      positionAppliedFor: text("positionAppliedFor", 100),
      interviewDate: z.string().min(1, "Choose a date."),
      additionalNotes: text("additionalNotes", 5000),
      questionSet: z.string().min(1, "Choose a question set."),
    });
  }, [fields]);
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      discordUsername: "",
      discordId: "",
      inGameName: "",
      inGameId: "",
      age: "",
      timezone: "",
      positionAppliedFor: org.defaultPosition,
      interviewDate: toDateInput(),
      additionalNotes: "",
      questionSet: "",
    },
  });

  // Preselect the default set once loaded.
  const setId = useWatch({ control: form.control, name: "questionSet" });
  React.useEffect(() => {
    if (!setId && sets.data?.length) {
      const def = sets.data.find((s) => s.isDefault) ?? sets.data[0]!;
      form.setValue("questionSet", def.id);
    }
  }, [sets.data, setId, form]);

  const selectedSet = sets.data?.find((s) => s.id === setId);

  const onSubmit = form.handleSubmit(async (v) => {
    setSubmitError(null);
    try {
      const interview = await interviewsService.start({
        organization: org.code,
        questionSet: v.questionSet,
        candidate: {
          name: v.name,
          discordUsername: v.discordUsername,
          discordId: v.discordId,
          inGameName: v.inGameName,
          inGameId: v.inGameId,
          age: v.age ? Number(v.age) : null,
          timezone: v.timezone,
        },
        positionAppliedFor: v.positionAppliedFor,
        interviewDate: v.interviewDate,
        additionalNotes: v.additionalNotes,
      });
      toast.success("Interview started", { description: `${v.name} · ${org.shortName}` });
      router.push(`/interviews/${interview.id}/live`);
    } catch (err) {
      if (err instanceof ApiError && err.details?.fieldErrors) {
        for (const [k, msgs] of Object.entries(err.details.fieldErrors)) {
          const key = k.replace(/^candidate\./, "") as keyof Values;
          if (key in form.getValues()) form.setError(key, { message: msgs[0] });
        }
      }
      setSubmitError(errorMessage(err));
    }
  });

  if (settings.isLoading) return <Skeleton className="h-96 w-full" />;
  if (settings.error) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />;

  const e = form.formState.errors;
  const show = (k: CandidateFieldKey) => fields?.[k]?.enabled !== false;
  const isReq = (k: CandidateFieldKey) => !!fields?.[k]?.enabled && !!fields?.[k]?.required;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 xl:grid-cols-[1fr_20rem]">
      <Card className="p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <OrgEmblem org={org} />
          <div>
            <div className="text-sm font-semibold">{org.name}</div>
            <div className="text-xs text-muted-foreground">{INTERVIEW_TYPE_META[org.category].label} interview</div>
          </div>
        </div>
        {submitError && (
          <Notice tone="danger" icon={AlertTriangle} className="mb-5">
            {submitError}
          </Notice>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Candidate name" htmlFor="name" required error={e.name?.message} className="sm:col-span-2">
            <Input id="name" autoFocus placeholder="Full name or preferred name" aria-invalid={!!e.name} {...form.register("name")} />
          </Field>
          {OPTIONAL_KEYS.filter(show).map((k) => (
            <Field
              key={k}
              label={CANDIDATE_FIELD_META[k].label}
              htmlFor={k}
              required={isReq(k)}
              error={e[k]?.message}
              hint={CANDIDATE_FIELD_META[k].hint}
            >
              <Input
                id={k}
                inputMode={k === "age" || k === "discordId" ? "numeric" : undefined}
                placeholder={CANDIDATE_FIELD_META[k].placeholder}
                aria-invalid={!!e[k]}
                className={k === "discordId" || k === "inGameId" ? "font-mono" : undefined}
                {...form.register(k)}
              />
            </Field>
          ))}
          {show("positionAppliedFor") && (
            <Field label="Position applied for" htmlFor="positionAppliedFor" required={isReq("positionAppliedFor")} error={e.positionAppliedFor?.message}>
              <Input id="positionAppliedFor" placeholder={CANDIDATE_FIELD_META.positionAppliedFor.placeholder} {...form.register("positionAppliedFor")} />
            </Field>
          )}
          <Field label="Interview date" htmlFor="interviewDate" required error={e.interviewDate?.message}>
            <Input id="interviewDate" type="date" {...form.register("interviewDate")} />
          </Field>
          {show("additionalNotes") && (
            <Field label="Additional notes" htmlFor="additionalNotes" required={isReq("additionalNotes")} error={e.additionalNotes?.message} className="sm:col-span-2">
              <Textarea id="additionalNotes" rows={3} placeholder={CANDIDATE_FIELD_META.additionalNotes.placeholder} {...form.register("additionalNotes")} />
            </Field>
          )}
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Library className="size-4 text-primary" /> Question set
          </div>
          {sets.isLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : sets.error ? (
            <p className="text-sm text-destructive">{errorMessage(sets.error)}</p>
          ) : !sets.data?.length ? (
            <Notice tone="warning" icon={AlertTriangle}>
              No question set exists for {org.shortName} yet. Ask a question bank manager to create or import one.
            </Notice>
          ) : (
            <Field error={e.questionSet?.message}>
              <NativeSelect {...form.register("questionSet")}>
                {sets.data.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.isDefault ? " (default)" : ""} — {s.activeQuestionCount} questions
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          {selectedSet && (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {selectedSet.activeQuestionCount} active questions will be snapshotted when the interview starts. Later edits to the
              question bank will not change this interview.
            </p>
          )}
        </Card>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onBack}>
            <ArrowLeft /> Back
          </Button>
          <Button
            type="submit"
            className="flex-1"
            loading={form.formState.isSubmitting}
            disabled={!sets.data?.length || (selectedSet?.activeQuestionCount ?? 0) === 0}
          >
            <PlayCircle /> Start interview
          </Button>
        </div>
        {selectedSet && selectedSet.activeQuestionCount === 0 && (
          <p className="text-xs text-warning">This set has no active questions.</p>
        )}
      </div>
    </form>
  );
}

/* ─────────────────────────── Page ─────────────────────────── */

function NewInterview() {
  const { can } = useAuth();
  const params = useSearchParams();
  const orgs = useOrganizations();
  // `undefined` = the user hasn't chosen yet, so fall back to a derived default.
  const [typeChoice, setType] = React.useState<InterviewType | null | undefined>(undefined);
  const [orgChoice, setOrgCode] = React.useState<string | null | undefined>(undefined);

  const types = (Object.keys(INTERVIEW_TYPE_META) as InterviewType[]).filter((t) => can(INTERVIEW_TYPE_META[t].capability));

  // Deep-link support (/interviews/new?org=FIB) and skipping step one when only one type is allowed.
  const preset = orgs.data?.organizations.find((o) => o.code === params.get("org") && o.canConduct);
  const type = typeChoice !== undefined ? typeChoice : (preset?.category ?? (types.length === 1 ? types[0]! : null));
  const orgCode = orgChoice !== undefined ? orgChoice : preset && preset.category === type ? preset.code : null;

  const step = !type ? 0 : !orgCode ? 1 : 2;
  const orgsForType = (orgs.data?.organizations ?? []).filter((o) => o.category === type && o.canConduct);
  const org = orgs.data?.organizations.find((o) => o.code === orgCode);

  return (
    <>
      <PageHeader
        eyebrow="New interview"
        title={step === 0 ? "What kind of interview?" : step === 1 ? `Choose the ${INTERVIEW_TYPE_META[type!].short.toLowerCase()} organization` : "Candidate details"}
        description={
          step === 0
            ? "Only interview types your roles allow are shown."
            : step === 1
              ? "Pick the organization the candidate is applying to lead."
              : "Record who you're interviewing. Required fields are configured by senior administration."
        }
        actions={<Steps step={step} />}
      />
      <PageBody>
        {orgs.error ? (
          <ErrorState error={orgs.error} onRetry={() => orgs.refetch()} />
        ) : (
          <>
            {step === 0 && (
              <motion.div key="type" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="grid gap-4 md:grid-cols-3">
                {types.map((t) => {
                  const Icon = TYPE_ICONS[t];
                  return (
                    <SelectCard key={t} onClick={() => setType(t)} className="p-6">
                      <Icon className="size-6 text-primary" />
                      <div className="mt-6 text-base font-semibold">{INTERVIEW_TYPE_META[t].label}</div>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{INTERVIEW_TYPE_META[t].description}</p>
                      <ArrowRight className="absolute top-6 right-6 size-4 text-subtle-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    </SelectCard>
                  );
                })}
              </motion.div>
            )}
            {step === 1 && (
              <motion.div key="org" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}>
                {orgs.isLoading ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-40" />
                    ))}
                  </div>
                ) : orgsForType.length === 0 ? (
                  <EmptyState icon={Gavel} title="No organizations available" description="There are no active organizations in this category." />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    {orgsForType.map((o, i) => (
                      <motion.div key={o.code} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                        <SelectCard onClick={() => setOrgCode(o.code)} className="flex h-full w-full flex-col">
                          <div
                            className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-70"
                            style={{ background: `linear-gradient(90deg, transparent, ${o.color}, transparent)` }}
                          />
                          <OrgEmblem org={o} size="lg" />
                          <div className="mt-5 text-sm font-semibold">{o.shortName}</div>
                          <div className="text-xs text-muted-foreground">{o.name}</div>
                          <div className="mt-auto pt-4 text-[11px] text-subtle-foreground">
                            {o.defaultQuestionSet ? `${o.defaultQuestionSet.questionCount} questions · ${o.defaultQuestionSet.name}` : "No question set yet"}
                          </div>
                        </SelectCard>
                      </motion.div>
                    ))}
                  </div>
                )}
                {types.length > 1 && (
                  <Button
                    variant="ghost"
                    className="mt-6"
                    onClick={() => {
                      setType(null);
                      setOrgCode(null);
                    }}
                  >
                    <ArrowLeft /> Change interview type
                  </Button>
                )}
              </motion.div>
            )}
            {step === 2 && org && (
              <motion.div key="cand" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}>
                <CandidateStep org={org} onBack={() => setOrgCode(null)} />
              </motion.div>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}

export default function NewInterviewPage() {
  return (
    <RequireCapability
      anyOf={["canInterviewState", "canInterviewCrime", "canInterviewAdmins"]}
      message="Your roles don't allow you to conduct interviews. A curator role must be assigned first."
    >
      <Suspense fallback={<Skeleton className="m-8 h-64" />}>
        <NewInterview />
      </Suspense>
    </RequireCapability>
  );
}
