"use client";

import * as React from "react";
import { ExternalLink, Film, Plus, Video, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const MAX_RECORDING_LINKS = 10;

const PROVIDERS: { match: RegExp; name: string; color: string }[] = [
  { match: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i, name: "YouTube", color: "#e5484d" },
  { match: /(^|\.)medal\.tv$/i, name: "Medal", color: "#d9a441" },
  { match: /(^|\.)drive\.google\.com$|(^|\.)docs\.google\.com$/i, name: "Google Drive", color: "#3fb37f" },
  { match: /(^|\.)twitch\.tv$/i, name: "Twitch", color: "#8c7cc9" },
  { match: /(^|\.)kick\.com$/i, name: "Kick", color: "#53fc18" },
  { match: /(^|\.)streamable\.com$/i, name: "Streamable", color: "#7c97d6" },
  { match: /(^|\.)outplayed\.tv$/i, name: "Outplayed", color: "#c46a5a" },
  { match: /(^|\.)dropbox\.com$/i, name: "Dropbox", color: "#6b8fd6" },
  { match: /(^|\.)onedrive\.live\.com$|(^|\.)1drv\.ms$|sharepoint\.com$/i, name: "OneDrive", color: "#6b8fd6" },
  { match: /(^|\.)discord(app)?\.com$|(^|\.)discord\.gg$/i, name: "Discord", color: "#8c9cf0" },
];

export function isValidRecordingLink(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function describeLink(url: string): { provider: string; color: string; host: string } {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const p = PROVIDERS.find((x) => x.match.test(host));
    return { provider: p?.name ?? host, color: p?.color ?? "#8b8b96", host };
  } catch {
    return { provider: "Link", color: "#8b8b96", host: "" };
  }
}

/** Trims, drops blanks and duplicates, and reports the first invalid entry. */
export function normalizeLinks(values: string[]): { links: string[]; error: string | null } {
  const links = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  const bad = links.find((l) => !isValidRecordingLink(l));
  if (bad) return { links, error: `“${bad.slice(0, 60)}” isn't a full link. Paste the complete address starting with https://` };
  if (links.length > MAX_RECORDING_LINKS) return { links, error: `At most ${MAX_RECORDING_LINKS} links per interview.` };
  return { links, error: null };
}

/** Editable list of recording links (YouTube, Medal, Google Drive…). */
export function RecordingLinksEditor({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string[];
  onChange: (links: string[]) => void;
  disabled?: boolean;
  className?: string;
}) {
  const rows = value.length ? value : [""];
  const set = (i: number, v: string) => onChange(rows.map((r, j) => (j === i ? v : r)));
  const remove = (i: number) => onChange(rows.filter((_, j) => j !== i));

  return (
    <div className={cn("space-y-2", className)}>
      {rows.map((link, i) => {
        const trimmed = link.trim();
        const invalid = trimmed !== "" && !isValidRecordingLink(trimmed);
        const info = trimmed && !invalid ? describeLink(trimmed) : null;
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Video className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" />
              <Input
                value={link}
                disabled={disabled}
                inputMode="url"
                placeholder="https://youtube.com/…  ·  medal.tv/…  ·  drive.google.com/…"
                aria-invalid={invalid}
                onChange={(e) => set(i, e.target.value)}
                className={cn("pl-9", info && "pr-28")}
              />
              {info && (
                <span
                  className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 truncate rounded border px-1.5 py-px text-[10px] font-medium"
                  style={{ color: info.color, borderColor: `${info.color}55`, background: `${info.color}14` }}
                >
                  {info.provider}
                </span>
              )}
            </div>
            {(rows.length > 1 || trimmed) && (
              <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} onClick={() => remove(i)} aria-label="Remove link">
                <X />
              </Button>
            )}
          </div>
        );
      })}
      {rows.some((r) => r.trim() && !isValidRecordingLink(r.trim())) && (
        <p className="text-xs text-destructive">Paste the full link, starting with https://</p>
      )}
      {rows.length < MAX_RECORDING_LINKS && rows[rows.length - 1]?.trim() !== "" && (
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange([...rows, ""])}>
          <Plus /> Add another link
        </Button>
      )}
    </div>
  );
}

/** Read-only list of recording links, opened in a new tab. */
export function RecordingLinksList({ links, emptyText = "No recording linked.", compact }: { links: string[]; emptyText?: string; compact?: boolean }) {
  if (!links.length) return <p className="text-[13px] text-subtle-foreground italic">{emptyText}</p>;
  return (
    <ul className="space-y-1.5">
      {links.map((url) => {
        const info = describeLink(url);
        return (
          <li key={url}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="group flex items-center gap-2.5 rounded-md border border-border bg-[#0c0c0f] px-3 py-2 transition-colors hover:border-border-strong hover:bg-[#111114]"
            >
              <Film className="size-4 shrink-0" style={{ color: info.color }} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">{info.provider}</span>
                {!compact && <span className="block truncate text-[11px] text-muted-foreground">{url}</span>}
              </span>
              <ExternalLink className="size-3.5 shrink-0 text-subtle-foreground group-hover:text-foreground" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
