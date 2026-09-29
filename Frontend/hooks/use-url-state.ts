"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Keeps a flat filter object in the URL query string so filtered views are
 * shareable and survive refreshes.
 */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const state = React.useMemo(() => {
    const out = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      const v = params.get(key as string);
      if (v !== null) out[key] = v as T[keyof T];
    }
    return out;
    // defaults is expected to be a stable literal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const set = React.useCallback(
    (patch: Partial<T>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "" || v === defaults[k]) next.delete(k);
        else next.set(k, String(v));
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params, pathname, router],
  );

  return [state, set] as const;
}
