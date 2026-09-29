"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ConnectingScreen } from "./connecting-screen";
import { EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import type { Capabilities } from "@/types/api";
import Link from "next/link";

/**
 * Client-side gate for console pages. This is a UX convenience only —
 * the API independently authorizes every request.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status, user, retryConnection } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (status === "unauthenticated") {
      const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${next}`);
    } else if (status === "authenticated" && user?.mustChangePassword && pathname !== "/change-password") {
      router.replace("/change-password");
    }
  }, [status, user?.mustChangePassword, pathname, router]);

  if (status === "restoring" || status === "connecting" || status === "unreachable") {
    return <ConnectingScreen state={status} onRetry={retryConnection} />;
  }
  if (status !== "authenticated" || !user || user.mustChangePassword) {
    return <ConnectingScreen state="restoring" />;
  }
  return <>{children}</>;
}

/** Renders a clear "no access" state when the signed-in user lacks a capability. */
export function RequireCapability({
  capability,
  anyOf,
  children,
  message = "Your roles don't include access to this area. Ask a senior administrator if you believe this is a mistake.",
}: {
  capability?: keyof Capabilities;
  anyOf?: (keyof Capabilities)[];
  children: React.ReactNode;
  message?: string;
}) {
  const { can } = useAuth();
  const allowed = capability ? can(capability) : anyOf ? anyOf.some((c) => can(c)) : true;
  if (!allowed) {
    return (
      <EmptyState
        className="py-24"
        icon={ShieldAlert}
        title="You don't have access to this page"
        description={message}
        action={
          <Button asChild variant="secondary">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        }
      />
    );
  }
  return <>{children}</>;
}
