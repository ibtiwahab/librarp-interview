import { RequireAuth } from "@/components/layout/require-auth";

/** Distraction-free layout for the live interview screen (no sidebar). */
export default function FocusLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
