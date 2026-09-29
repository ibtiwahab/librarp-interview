"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "motion/react";
import { ArrowRight, Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ApiError, errorMessage } from "@/lib/api-client";
import { LibraMark } from "@/components/brand/libra-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Notice } from "@/components/ui/feedback";
import { ConnectingScreen } from "@/components/layout/connecting-screen";

const schema = z.object({
  identifier: z.string().trim().min(1, "Enter your username."),
  password: z.string().min(1, "Enter your password."),
});
type FormValues = z.infer<typeof schema>;

function safeNext(next: string | null): string {
  // Only allow in-app relative paths.
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

function LoginForm() {
  const { login, status, retryConnection } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [showPassword, setShowPassword] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [slow, setSlow] = React.useState(false);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { identifier: "", password: "" } });

  React.useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, router, next]);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const slowTimer = setTimeout(() => setSlow(true), 2500);
    try {
      const user = await login(values.identifier, values.password);
      router.replace(user.mustChangePassword ? "/change-password" : next);
    } catch (err) {
      form.setValue("password", "");
      setFormError(err instanceof ApiError ? err.message : errorMessage(err));
    } finally {
      clearTimeout(slowTimer);
      setSlow(false);
    }
  });

  if (status === "restoring" || status === "connecting" || status === "unreachable") {
    return <ConnectingScreen state={status} onRetry={retryConnection} />;
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.15fr_1fr]">
      {/* Cinematic panel */}
      <section className="bg-grid relative hidden overflow-hidden border-r border-border lg:block">
        <div className="bg-noise absolute inset-0 opacity-60" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_30%_40%,rgb(201_164_92/0.09),transparent_60%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_60%,var(--background))]" />
        <LibraMark className="absolute -right-24 -bottom-24 size-[34rem] text-primary/[0.045]" strokeWidth={0.6} />

        <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="h-px w-10 bg-primary/60" />
            <span className="text-[11px] font-medium tracking-[0.3em] uppercase">Restricted staff system</span>
          </div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: "easeOut" }}>
            <div className="mb-8 grid size-16 place-items-center rounded-xl border border-primary/30 bg-primary-soft text-primary">
              <LibraMark className="size-10" />
            </div>
            <h1 className="text-6xl leading-[0.95] font-semibold tracking-[0.12em] xl:text-7xl">
              LIBRA <span className="text-primary">RP</span>
            </h1>
            <p className="mt-6 text-lg font-medium tracking-wide text-secondary-foreground">Leadership &amp; Administration</p>
            <p className="mt-1 text-sm tracking-[0.2em] text-muted-foreground uppercase">Staff Interview Management</p>
          </motion.div>

          <div className="grid max-w-lg grid-cols-3 gap-6 text-xs text-muted-foreground">
            {[
              ["State", "LSPD · SAHP · GOV · EMS · FIB"],
              ["Crime", "Families · Ballas · Vagos · Bloods · Marabunta"],
              ["Admin", "Server administration team"],
            ].map(([k, v]) => (
              <div key={k} className="border-t border-border-strong pt-3">
                <div className="mb-1 font-medium tracking-wider text-secondary-foreground uppercase">{k}</div>
                <div className="leading-relaxed">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease: "easeOut" }}
          className="w-full max-w-sm"
        >
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="grid size-10 place-items-center rounded-lg border border-primary/30 bg-primary-soft text-primary">
              <LibraMark className="size-6" />
            </div>
            <div>
              <div className="text-base font-semibold tracking-[0.2em]">LIBRA RP</div>
              <div className="text-xs text-muted-foreground">Staff Interview Management</div>
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Use the credentials issued to you by Libra RP administration.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
            {formError && (
              <Notice tone="danger" icon={Lock}>
                {formError}
              </Notice>
            )}
            <Field label="Username" htmlFor="identifier" error={form.formState.errors.identifier?.message}>
              <Input
                id="identifier"
                autoComplete="username"
                autoFocus
                spellCheck={false}
                autoCapitalize="none"
                className="h-10"
                aria-invalid={!!form.formState.errors.identifier}
                {...form.register("identifier")}
              />
            </Field>
            <Field label="Password" htmlFor="password" error={form.formState.errors.password?.message}>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="h-10 pr-10"
                  aria-invalid={!!form.formState.errors.password}
                  {...form.register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? (slow ? "Waking up services…" : "Signing in…") : "Sign in"}
              {!form.formState.isSubmitting && <ArrowRight />}
            </Button>
          </form>

          <div className="mt-10 flex items-start gap-2.5 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-subtle-foreground" />
            <p>
              Access is limited to authorized Libra RP staff. Accounts are issued by senior administration — there is no public
              registration. All actions are logged.
            </p>
          </div>
        </motion.div>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<ConnectingScreen state="restoring" />}>
      <LoginForm />
    </Suspense>
  );
}
