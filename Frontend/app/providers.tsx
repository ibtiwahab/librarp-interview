"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ApiError } from "@/lib/api-client";
import { AuthProvider } from "@/hooks/use-auth";
import { TooltipProvider } from "@/components/ui/controls";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (count, err) => {
          // Retry network hiccups / cold starts, never permission or validation errors.
          if (err instanceof ApiError && !err.isNetwork && err.status < 500) return false;
          return count < 2;
        },
        retryDelay: (n) => Math.min(1500 * 2 ** n, 8000),
      },
      mutations: { retry: false },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(makeQueryClient);
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <TooltipProvider>
          {children}
          <Toaster
            theme="dark"
            position="bottom-right"
            closeButton
            toastOptions={{
              classNames: {
                toast: "!bg-[#141418] !border-[#2d2d36] !text-[#ececef] !rounded-lg !shadow-2xl",
                description: "!text-[#8b8b96]",
              },
            }}
          />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
