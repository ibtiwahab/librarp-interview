"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { ConnectingScreen } from "@/components/layout/connecting-screen";

export default function Home() {
  const { status, retryConnection } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
    else if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  return (
    <ConnectingScreen
      state={status === "unreachable" ? "unreachable" : status === "connecting" ? "connecting" : "restoring"}
      onRetry={retryConnection}
    />
  );
}
