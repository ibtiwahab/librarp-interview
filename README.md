# Libra RP — Leadership & Administration Interview System

Internal staff platform for the **Libra RP** GTA V roleplay server. Senior staff use it to conduct
leadership interviews for **State** organizations (LSPD, SAHP, GOV, EMS, FIB), **Crime** organizations
(Families, Ballas, Marabunta, Vagos, Bloods) and **Server Admin** candidates; manage a question bank
(including importing questions from Word/PDF/Excel documents); and administer staff accounts and roles.

It is designed to run entirely on **free tiers** — Vercel Hobby, Render Free, MongoDB Atlas M0 — and uses
**no paid APIs**. Document question extraction is deterministic and runs in memory on the server.

---

## Contents

1. [Architecture](#architecture)
2. [Requirements](#requirements)
3. [Local setup](#local-setup)
4. [MongoDB Atlas setup](#mongodb-atlas-setup)
5. [Environment variables](#environment-variables)
6. [Creating the first Executive Director](#creating-the-first-executive-director)
7. [Frontend development](#frontend-development)
8. [Backend development](#backend-development)
9. [Roles & permissions](#roles--permissions)
10. [Document import](#document-import)
11. [Free deployment: Render (API)](#free-deployment-render-api)
12. [Free deployment: Vercel (frontend)](#free-deployment-vercel-frontend)
13. [CORS & cookies](#cors--cookies)
14. [Troubleshooting](#troubleshooting)

---

## Architecture

```text
/
├── Frontend/          Next.js 16 (App Router) · TypeScript · Tailwind v4 · Radix/shadcn-style UI
│   ├── app/           Routes: /login, /dashboard, /interviews/new, /interviews/[id](/live),
│   │                  /history, /questions, /admins(/[id]), /audit, /settings
│   ├── components/    ui/ (primitives) · layout/ · domain/ · interviews/ · questions/ · admins/
│   ├── hooks/         use-auth, TanStack Query hooks, autosave, URL state
│   ├── services/      Typed API clients (one per resource)
│   ├── lib/           api-client (tokens, refresh, errors), constants, formatting
│   └── types/         API types
│
├── backend/           Express 5 · TypeScript · Mongoose 9 · Zod · JWT
│   ├── src/config/    env, db, roles.ts (THE permission matrix), organizations.ts
│   ├── src/models/    AdminUser, Session, Organization, QuestionSet, Question, Interview, AuditLog, AppSettings
│   ├── src/services/  authorization (pure RBAC engine), auth, admin, question(Set), interview,
│   │                  audit, dashboard, import/ (file detection, parsers, extractors)
│   ├── src/controllers/ thin HTTP handlers
│   ├── src/routes/    route map under /api
│   ├── src/middleware/ requireAuth, requirePermission, rate limits, upload, errors
│   ├── src/validators/ Zod schemas
│   ├── src/scripts/   seed:executive (production bootstrap), seed:dev (sample data)
│   └── tests/         RBAC unit tests, API-level escalation tests, importer tests (+ fixtures)
│
├── render.yaml        Render blueprint for the API
└── README.md
```

**Request flow.** The browser talks to the API with a short-lived JWT access token (kept in memory only) and a
rotating refresh token in an `httpOnly` cookie. Every API request reloads the administrator from MongoDB, so role
changes, disables and deletions take effect immediately. **All authorization is enforced by the backend** — the
frontend only uses the server-computed capabilities to decide what to show.

**Key design decisions**

| Concern | Approach |
| --- | --- |
| Multiple roles per admin | `roles: Role[]`; permissions are the union of every role's permissions |
| Hierarchy | Numeric authority levels + per-role *assignable* and *manageable* role lists in `backend/src/config/roles.ts` |
| Historical accuracy | Interviews snapshot every question (text, follow-ups, expected answer) when they start |
| Deletions | Interviews and admin accounts are soft-deleted (`deletedAt`, `deletedBy`) and audited |
| Documents | Parsed in memory (Multer memory storage), never written to disk/DB; only approved questions are stored |
| Autosave | Debounced PATCH of changed answers only + localStorage draft backup + unload/visibility flush |
| Cold starts | Frontend shows *“Connecting to Libra RP services…”* and retries with backoff; no keep-alive pinging |

---

## Requirements

- **Node.js 20.11+** (22 LTS recommended)
- **npm 10+**
- A **MongoDB** database — MongoDB Atlas M0 (free) for production; Atlas or a local `mongod` for development

---

## Local setup

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env        # then fill in MONGODB_URI and two JWT secrets (see below)
npm run seed:executive      # create the first Executive Director (interactive, hidden password input)
npm run seed:dev            # OPTIONAL: sample question sets for every organization
npm run dev                 # API on http://localhost:4000

# 2. Frontend (new terminal)
cd Frontend
npm install
cp .env.example .env.local  # NEXT_PUBLIC_API_URL=http://localhost:4000
npm run dev                 # app on http://localhost:3000
```

Open http://localhost:3000 and sign in with the Executive Director you created.

Generate JWT secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## MongoDB Atlas setup

1. Create a free account at https://cloud.mongodb.com and create an **M0 (Free)** cluster.
2. **Database Access** → *Add New Database User* → username + strong password, role **Read and write to any database**.
3. **Network Access** → *Add IP Address*:
   - for local development, add your current IP;
   - for Render Free (no static outbound IPs), add `0.0.0.0/0`. The database is still protected by the user/password.
4. **Connect** → *Drivers* → copy the connection string and set the database name, e.g.
   `mongodb+srv://librarp:<password>@cluster0.xxxxx.mongodb.net/librarp?retryWrites=true&w=majority`
5. Put it in `backend/.env` as `MONGODB_URI` (and later in Render).

Indexes are created automatically on startup. The app's data is small (text only — documents are never stored),
so it fits comfortably within the M0 512 MB limit.

---

## Environment variables

### `backend/.env`

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | – | `development` / `production` / `test` |
| `PORT` | – | Port to listen on (Render injects this). Default `4000` |
| `MONGODB_URI` | ✔ | MongoDB connection string |
| `JWT_ACCESS_SECRET` | ✔ | ≥ 32 chars, signs 15-minute access tokens |
| `JWT_REFRESH_SECRET` | ✔ | ≥ 32 chars, different from the access secret |
| `ACCESS_TOKEN_TTL` | – | Default `15m` |
| `REFRESH_TOKEN_TTL_DAYS` | – | Default `14` |
| `FRONTEND_URL` | ✔ | Comma-separated allowed origins, e.g. `https://librarp-staff.vercel.app` |
| `COOKIE_SAMESITE` | – | `lax` (same site / proxy mode) or `none` (cross-site). Defaults: `lax` dev, `none` prod |
| `TRUST_PROXY` | – | Proxy hops in front of the API: `1` for Render (default in production), `2` in Vercel proxy mode |
| `BOOTSTRAP_EXEC_*` | – | Only for `seed:executive`. Remove after use |

The server validates its environment on boot and exits with a clear message if anything is missing.

### `Frontend/.env.local`

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | API origin without `/api`, e.g. `http://localhost:4000` or `https://librarp-interview-api.onrender.com`. Leave **empty** in proxy mode |
| `API_PROXY_TARGET` | Optional. When set, Next.js proxies `/api/*` to this origin (see [CORS & cookies](#cors--cookies)) |

Never commit `.env` files — both projects' `.gitignore` files exclude them (only `.env.example` is tracked).

---

## Creating the first Executive Director

There is **no public registration** and **no default account**. The first Executive Director is created with a
one-off bootstrap script:

```bash
cd backend
npm run seed:executive
```

- **Interactive** (recommended): prompts for a username and a hidden password.
- **Non-interactive**: set `BOOTSTRAP_EXEC_USERNAME` and `BOOTSTRAP_EXEC_PASSWORD` (optionally
  `BOOTSTRAP_EXEC_DISPLAY_NAME`) in the environment, run the command, then **remove the variables**.
- Administrator accounts are **username + password only** (no email). Usernames are case-insensitive; the display
  name defaults to the username as typed.
- Passwords must be ≥ 8 characters with a letter and a number, and not a common password. Change the bootstrap
  password after first sign-in if it was shared or is short.
- The script **refuses to run if an Executive Director already exists** (use `--allow-additional` only for
  deliberate access recovery).
- For production, run it **from your own machine** with `MONGODB_URI` pointing at the production Atlas database
  (Render's free plan has no Shell). The script only needs database access, not the deployed server.

The Executive Director role can never be granted through the application — only through this script.

---

## Frontend development

```bash
cd Frontend
npm run dev         # dev server with Turbopack
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint (Next + React Compiler rules)
npm run build       # production build
```

- UI primitives live in `components/ui` (hand-built on Radix, shadcn-style) with a dark, brass-accented token
  palette in `app/globals.css`.
- All server state goes through TanStack Query (`hooks/queries.ts`) and typed services in `services/`.
- `lib/api-client.ts` holds the access token in memory, refreshes once on 401 (single-flight across requests),
  normalises backend errors into `ApiError`, and uses long timeouts to tolerate cold starts.
- Organization logos: drop images into `Frontend/public/orgs/` and set the path (e.g. `/orgs/fib.png`) in
  **Settings → Organizations**. Without a logo a tinted monogram emblem is rendered.

## Backend development

```bash
cd backend
npm run dev         # tsx watch
npm run typecheck
npm run lint
npm test            # vitest: RBAC unit tests, API-level escalation tests, importer tests
npm run build       # tsc → dist/
```

The API-level tests start a throwaway in-memory MongoDB (`mongodb-memory-server-core`), which downloads a MongoDB
binary on first run. No external database is touched.

### API overview (all under `/api`)

| Area | Endpoints |
| --- | --- |
| Health | `GET /health` |
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` |
| Roles | `GET /roles` (catalogue + what *you* may assign) |
| Admins | `GET/POST /admins`, `GET/PATCH/DELETE /admins/:id`, `PUT /admins/:id/roles`, `POST /admins/:id/roles`, `DELETE /admins/:id/roles/:role`, `POST /admins/:id/disable`, `/enable`, `/reset-password` |
| Organizations | `GET /organizations`, `PATCH /organizations/:code` |
| Question sets | `GET/POST /question-sets`, `GET/PATCH/DELETE /question-sets/:id`, `POST /question-sets/:id/duplicate`, `GET /question-sets/:id/categories` |
| Questions | `GET/POST /questions`, `PATCH/DELETE /questions/:id`, `POST /questions/:id/duplicate`, `POST /questions/reorder`, `POST /questions/bulk-action`, `POST /questions/import/preview`, `POST /questions/import/map`, `POST /questions/import/check-duplicates`, `POST /questions/bulk` |
| Interviews | `GET/POST /interviews`, `GET /interviews/active`, `GET /interviews/interviewers`, `GET/PATCH/DELETE /interviews/:id`, `POST /interviews/:id/complete` |
| Other | `GET /dashboard`, `GET/PATCH /settings`, `GET /audit-logs`, `GET /audit-logs/meta` |

Errors always use one shape:

```json
{ "success": false, "error": { "code": "FORBIDDEN", "message": "You do not have permission to conduct FIB interviews." } }
```

---

## Roles & permissions

Defined once in [`backend/src/config/roles.ts`](backend/src/config/roles.ts) and evaluated by the pure functions in
[`backend/src/services/authorization.service.ts`](backend/src/services/authorization.service.ts)
(`hasRole`, `hasPermission`, `canInterviewOrganization`, `canManageUser`, `canAssignRole`, …). Controllers never
compare role names.

| Role | Level | State | Crime | Admin | Can assign |
| --- | --- | --- | --- | --- | --- |
| Executive Director | 100 | ✔ | ✔ | ✔ | every role except Executive Director |
| Head Admin | 80 | ✔ | ✔ | ✔ | every role below Head Admin |
| Chief Curator of State | 60 | ✔ | – | – | State Curator |
| Chief Curator of Crime | 60 | – | ✔ | – | Crime Curator |
| State Curator | 40 | ✔ | – | – | – |
| Crime Curator | 40 | – | ✔ | – | – |
| Support Curator | 40 | – | – | ✔ | – |
| Server Admin | 10 | – | – | – | – |

Rules enforced server-side:

- Permissions are the **union** of all roles (e.g. `SERVER_ADMIN + STATE_CURATOR + SUPPORT_CURATOR` can run State
  and Admin interviews, but not Crime ones).
- You can only change roles of accounts **strictly below** your authority level, and only roles in your assignable list.
- Destructive actions (edit, disable, delete, reset password) additionally require every one of the target's roles
  to be inside your *manageable* set — e.g. a Chief Curator of State can delete a State Curator but not a Crime Curator.
- Nobody can modify their own roles, delete/disable themselves, or touch an Executive Director account.
- **Design choice:** Head Admins cannot grant `HEAD_ADMIN` (no minting peers). To allow it, add `HEAD_ADMIN` to the
  Head Admin `assignableRoles` in `roles.ts`.
- Interviews are visible to the interviewer and to anyone who can conduct that interview type; Executive Director
  and Head Admin see all. Only they can delete interviews.
- Audit log: Executive Director sees everything; Head Admin sees administrative/question/interview activity
  (not sign-in events).
- Question bank management: Executive Director & Head Admin (all), Chief Curators (their category). Anyone who can
  conduct a category can read its questions.

---

## Document import

`POST /api/questions/import/preview` accepts `.xlsx .xls .csv .docx .pdf .txt` up to **10 MB**.

- Uploads use Multer **memory storage** — nothing is written to disk — and the buffer is released after parsing.
- The real file type is detected from **magic bytes**; executables and mismatched extensions are rejected.
- **DOCX** (Mammoth → HTML) keeps Word/Google Docs *auto-numbered* lists, headings (→ categories) and nested list
  items (→ follow-ups). **PDF** (unpdf/pdf.js) rebuilds visual lines, joins wrapped lines and drops page numbers;
  image-only PDFs return *“No machine-readable text was detected in this PDF…”*. **Excel/CSV** (SheetJS) detects
  `Question / Answer / Follow Up / Category / Required / Order` headers or guesses the question column, with a
  column-mapping UI for manual correction.
- Numbering like `1.` `1-` `1)` `Q1:` `(1)` is recognised; trailing instructions such as
  `(if he says 30 mins ask is there any exception for this)` become **follow-up prompts**, while answers such as
  `(No, org cars can't be used for personal reasons)` become the **expected answer**.
- Numbering gaps, in-document duplicates and low-confidence lines are flagged for review.
- The admin reviews/edits/reorders/deselects rows, then `POST /api/questions/bulk` stores only the approved
  structured questions. Duplicates against the destination set (exact and ≥ 90 % similar) are re-checked
  server-side and skipped unless “Import anyway” is chosen.

Tests in `backend/tests` cover the real EMS (28 questions) and FIB (55 questions) document formats, plus
generated DOCX/PDF fixtures.

---

## Free deployment: Render (API)

1. Push this repository to GitHub.
2. In Render: **New → Blueprint**, pick the repo — `render.yaml` configures the service
   (`rootDir: backend`, build `npm ci --include=dev && npm run build`, start `npm start`, health check `/api/health`).
   Or create a **Web Service** manually with the same settings.
3. Set the secret env vars in the dashboard: `MONGODB_URI`, `FRONTEND_URL` (your Vercel URL). The JWT secrets are
   generated by the blueprint (or set your own).
4. Deploy, then open `https://<service>.onrender.com/api/health` → `{"status":"ok", ...}`.
5. Create the first Executive Director by running `npm run seed:executive` **locally** with `MONGODB_URI` set to
   the same Atlas database (Render's free plan has no Shell).

The server listens on `0.0.0.0:$PORT`. Free instances sleep after ~15 minutes idle; the first request can take
30–60 s — the frontend shows a *Connecting…* state and retries rather than failing.

## Free deployment: Vercel (frontend)

1. **New Project** → import the repo → set **Root Directory** to `Frontend`. Framework preset: Next.js.
2. Environment variables — choose one mode:
   - **Proxy mode (recommended, `render.yaml` default):** `API_PROXY_TARGET=https://<service>.onrender.com`, leave
     `NEXT_PUBLIC_API_URL` unset. Render uses `COOKIE_SAMESITE=lax` and `TRUST_PROXY=2` (so rate limiting sees each
     user's real IP, not Vercel's). The refresh cookie becomes first-party, which works in every browser including
     Safari. Very large document uploads may hit Vercel's request-size limit (~4.5 MB) in this mode.
   - **Direct mode:** `NEXT_PUBLIC_API_URL=https://<service>.onrender.com`; on Render set `COOKIE_SAMESITE=none` and
     `TRUST_PROXY=1`. Browsers that block third-party cookies (Safari by default) will need to sign in again after
     each page reload.
3. Deploy, then put the Vercel URL in Render's `FRONTEND_URL` (comma-separate multiple origins, e.g. preview URLs).

---

## CORS & cookies

- CORS allows only the origins in `FRONTEND_URL` (credentials enabled). Requests from other origins are rejected.
- The refresh token cookie (`lrp_rt`) is `httpOnly`, scoped to `/api/auth`, `Secure` in production, and rotated on
  every refresh (reuse of an old token revokes the session).
- Cookie-authenticated endpoints (`/auth/refresh`, `/auth/logout`) require an `X-Requested-With: librarp` header,
  which a cross-site form or image cannot send without passing CORS — this blocks CSRF.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Backend exits with *Invalid environment configuration* | A required variable is missing/too short — the message lists which |
| *This origin is not allowed…* / CORS errors | `FRONTEND_URL` must exactly match the browser origin (scheme + host, no trailing slash) |
| Signed out after every refresh in production | Third-party cookies blocked → use proxy mode (`API_PROXY_TARGET`) and `COOKIE_SAMESITE=lax` |
| *Connecting to Libra RP services…* for ~1 minute | Render Free instance waking up — expected on the first visit |
| `MongoServerSelectionError` | Atlas Network Access doesn't allow the server's IP, or the URI/password is wrong (URL-encode special characters) |
| *No machine-readable text was detected in this PDF* | The PDF is a scan — export a text PDF/DOCX or add questions manually |
| *No questions were detected* | Number the questions (`1.` / `1-`) or end them with `?`; for spreadsheets, map the question column |
| *Too many sign-in attempts* | 10 attempts / 15 min per IP+username; accounts lock for 15 min after 5 bad passwords |
| Render build fails with `tsc: not found` | Build command must be `npm ci --include=dev && npm run build` |
| Forgot the only Executive Director password | Run `npm run seed:executive -- --allow-additional` against the database to create a recovery account |
