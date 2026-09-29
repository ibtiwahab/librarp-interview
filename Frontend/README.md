# Libra RP Staff Console (frontend)

Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + Radix-based UI components + TanStack Query.
See the [root README](../README.md) for full setup, deployment and the permission model.

```bash
npm install
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:4000
npm run dev                   # http://localhost:3000
```

| Script | Purpose |
| --- | --- |
| `dev` | Development server |
| `build` / `start` | Production build / serve |
| `typecheck` / `lint` | Quality gates |

## Notes

- The UI hides actions the signed-in administrator can't perform, using capabilities computed by the API.
  **This is only a convenience — the backend enforces every permission.**
- The access token lives in memory; the session is restored from an `httpOnly` refresh cookie. When the API is
  asleep (free hosting), the app shows *“Connecting to Libra RP services…”* and retries automatically.
- Live interviews autosave (debounced) and keep an unsaved-changes backup in `localStorage`, so a refresh or
  network blip never loses notes.
- Organization logos: put images in `public/orgs/` and set the path in **Settings → Organizations**.
