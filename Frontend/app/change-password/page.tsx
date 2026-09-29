"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ConnectingScreen } from "@/components/layout/connecting-screen";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { Wordmark } from "@/components/brand/libra-mark";
import { Button } from "@/components/ui/button";

export default function ChangePasswordPage() {
  const { status, user, logout, retryConnection } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated" || !user) {
    return <ConnectingScreen state={status === "unreachable" ? "unreachable" : status === "connecting" ? "connecting" : "restoring"} onRetry={retryConnection} />;
  }

  return (
    <div className="bg-grid flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-xl border border-border-strong bg-card p-8 shadow-2xl">
        <Wordmark />
        <div className="mt-8 flex items-center gap-2 text-primary">
          <KeyRound className="size-4" />
          <span className="text-[11px] font-semibold tracking-[0.14em] uppercase">{user.mustChangePassword ? "Action required" : "Security"}</span>
        </div>
        <h1 className="mt-2 text-xl font-semibold">Set a new password</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {user.mustChangePassword
            ? "Your account was issued a temporary password. Choose a personal password before continuing."
            : "Choose a strong password you don't use anywhere else."}
        </p>
        <div className="mt-6">
          <ChangePasswordForm onDone={() => router.replace("/dashboard")} />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-6"
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
        >
          <LogOut /> Sign out instead
        </Button>
      </div>
    </div>
  );
}
