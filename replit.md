# MedschoolProffs

MedschoolProffs is a multi-institution medical study platform with a focused student portal and an admin workspace for memberships, payments, students, and learning content.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM (the workspace template's supported ORM)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/medschoolproffs/src/App.tsx` — routed student and admin experience
- `artifacts/medschoolproffs/src/index.css` — application theme and responsive styling
- `artifacts/api-server/src/routes/medschool.ts` — API handlers and database-backed dashboard aggregates
- `lib/api-spec/openapi.yaml` — source of truth for generated API hooks and Zod contracts
- `lib/db/src/schema/medschool.ts` — PostgreSQL schema for the learning platform

## Architecture decisions

- The shared API server is mounted under `/api`; the web artifact uses the generated client hooks and the shared proxy.
- Academic content, plans, payments, and dashboard counts are loaded from PostgreSQL seed data so the UI is not the source of truth.
- The initial payment flow is manual-review-first: submissions remain pending until an admin approves them.
- The frontend has resilient empty/loading/error states so new environments can boot before all seed data is present.

## Product

Students can see progress, browse modules, practice MCQs, review flashcards, access resources, view membership status, and submit payment proof. Admins can monitor students and payments, review membership plans, and manage modules and MCQ drafts.

## Gotchas

- The Vite config expects workflow-provided `PORT` and `BASE_PATH`; use the managed web workflow for the preview.
- Run API codegen after changing `lib/api-spec/openapi.yaml`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
