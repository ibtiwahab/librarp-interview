# Libra RP Interview API (backend)

Express 5 + TypeScript + Mongoose REST API for the Libra RP staff interview system.
See the [root README](../README.md) for full setup, deployment and the permission model.

```bash
npm install
cp .env.example .env          # MONGODB_URI, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, FRONTEND_URL
npm run seed:executive        # first Executive Director (no default credentials exist)
npm run seed:dev              # optional sample question sets (development only)
npm run dev                   # http://localhost:4000/api/health
```

| Script | Purpose |
| --- | --- |
| `dev` | Watch mode via `tsx` (loads `.env`) |
| `build` / `start` | Compile to `dist/` and run it (Render) |
| `typecheck` / `lint` / `test` | Quality gates |
| `seed:executive` / `seed:executive:prod` | Secure bootstrap of the first Executive Director |
| `seed:dev` | Sample organizations, question sets and questions — refuses to run in production |

## Where things live

- `src/config/roles.ts` — the entire role → permission / assignable / manageable matrix
- `src/services/authorization.service.ts` — pure RBAC functions used by every route and service
- `src/services/import/` — file-type detection, DOCX/PDF/XLSX/CSV/TXT parsers and the deterministic question extractor
- `src/models/` — `AdminUser`, `Session`, `Organization`, `QuestionSet`, `Question`, `Interview`, `AuditLog`, `AppSettings`
- `tests/` — RBAC unit tests, API-level privilege-escalation tests (in-memory MongoDB), importer tests with real DOCX/PDF fixtures
