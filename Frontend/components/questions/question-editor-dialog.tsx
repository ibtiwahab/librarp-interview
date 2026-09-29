"use client";

import * as React from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CornerDownRight, Plus, X } from "lucide-react";
import { questionsService } from "@/services/questions";
import { errorMessage } from "@/lib/api-client";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field, Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/controls";
import { Notice } from "@/components/ui/feedback";
import type { Question } from "@/types/api";

const schema = z.object({
  questionText: z.string().trim().min(3, "Enter the question (at least 3 characters).").max(2000),
  followUpPrompts: z.array(z.object({ value: z.string().trim().max(1000) })).max(20),
  expectedAnswer: z.string().trim().max(4000),
  interviewerNotes: z.string().trim().max(4000),
  category: z.string().trim().max(80),
  required: z.boolean(),
  active: z.boolean(),
});
type Values = z.infer<typeof schema>;

interface EditorProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  questionSetId: string;
  question?: Question | null;
  categories: string[];
}

export function QuestionEditorDialog(props: EditorProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="lg">{props.open && <QuestionEditorForm key={props.question?.id ?? "new"} {...props} />}</DialogContent>
    </Dialog>
  );
}

/** Mounted each time the dialog opens, so defaults come straight from the question. */
function QuestionEditorForm({ onOpenChange, questionSetId, question, categories }: EditorProps) {
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      questionText: question?.questionText ?? "",
      followUpPrompts: (question?.followUpPrompts ?? []).map((value) => ({ value })),
      expectedAnswer: question?.expectedAnswer ?? "",
      interviewerNotes: question?.interviewerNotes ?? "",
      category: question?.category ?? "",
      required: question?.required ?? true,
      active: question?.active ?? true,
    },
  });
  const followUps = useFieldArray({ control: form.control, name: "followUpPrompts" });
  const [required, active] = useWatch({ control: form.control, name: ["required", "active"] });

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    const payload = {
      ...v,
      followUpPrompts: v.followUpPrompts.map((f) => f.value.trim()).filter(Boolean),
    };
    try {
      if (question) await questionsService.update(question.id, payload);
      else await questionsService.create({ ...payload, questionSet: questionSetId });
      await queryClient.invalidateQueries({ queryKey: ["questions"] });
      await queryClient.invalidateQueries({ queryKey: ["question-sets"] });
      toast.success(question ? "Question updated" : "Question added");
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  const e = form.formState.errors;
  const listId = React.useId();

  return (
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader>
            <DialogTitle>{question ? "Edit question" : "Add question"}</DialogTitle>
            <DialogDescription>
              {question
                ? "Changes apply to future interviews only — past interviews keep the wording they used."
                : "The question is added at the end of the set."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {error && (
              <Notice tone="danger" icon={AlertTriangle}>
                {error}
              </Notice>
            )}
            <Field label="Question" htmlFor="qt" required error={e.questionText?.message}>
              <Textarea id="qt" rows={3} autoFocus aria-invalid={!!e.questionText} {...form.register("questionText")} className="text-[14px]" />
            </Field>

            <div className="space-y-2">
              <Label>Follow-up prompts</Label>
              {followUps.fields.map((f, i) => (
                <div key={f.id} className="flex items-center gap-2">
                  <CornerDownRight className="size-4 shrink-0 text-primary/70" />
                  <Input placeholder="e.g. If they say 30 minutes, ask about exceptions." {...form.register(`followUpPrompts.${i}.value`)} />
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => followUps.remove(i)} aria-label="Remove follow-up">
                    <X />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => followUps.append({ value: "" })} disabled={followUps.fields.length >= 20}>
                <Plus /> Add follow-up
              </Button>
            </div>

            <Field label="Expected answer / reference" htmlFor="ea" hint="Only visible to interviewers.">
              <Textarea id="ea" rows={2} {...form.register("expectedAnswer")} />
            </Field>
            <Field label="Interviewer guidance" htmlFor="gn" hint="Private instructions shown with the question.">
              <Textarea id="gn" rows={2} {...form.register("interviewerNotes")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <Field label="Category" htmlFor="cat" hint="e.g. Leadership, Server Rules">
                <Input id="cat" list={listId} {...form.register("category")} />
                <datalist id={listId}>
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
              <label className="flex h-9 items-center gap-2 text-[13px]">
                <Switch checked={required} onCheckedChange={(v) => form.setValue("required", v)} /> Required
              </label>
              <label className="flex h-9 items-center gap-2 text-[13px]">
                <Switch checked={active} onCheckedChange={(v) => form.setValue("active", v)} /> Active
              </label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {question ? "Save changes" : "Add question"}
            </Button>
          </DialogFooter>
        </form>
  );
}
