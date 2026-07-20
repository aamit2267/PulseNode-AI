# CLAUDE.md — BuzzHealth.ai

This file is the standing brief for any work in this repository. Read it fully before starting a task. If a request conflicts with something here, ask rather than silently overriding it.

## What BuzzHealth.ai is

A corporate health-benefits platform. Companies offer their employees tiered health policies (sum insured, individual or family floater cover) and wallet-based annual allowances across three categories: doctor consultations, medicines, and lab tests. Employees describe symptoms and get matched to relevant doctors, then consult either **online (in-app chat)** or **offline (in-person visit)**, receive structured prescriptions, and spend from their wallets. Doctors run their own practice through a portal: managing availability, city/clinic details, consulting, prescribing, and tracking earnings. The backend is built decoupled from any specific client so the same API will serve a mobile app later — never assume the caller is a browser.

Four distinct product surfaces share one backend: the employee app, the doctor portal, the company-admin dashboard, and an internal platform-admin portal. Each has a different auth flow and a different data scope — never let one surface's assumptions leak into another's queries or components.

## Non-negotiable architectural rules

1. **Backend is client-agnostic.** No HTML in error messages, no web-only redirects, no assumptions about cookies/sessions in the API layer. Auth is token-based throughout.
2. **Layered architecture**: `routes → controller → service → repository`. Controllers parse/shape only. Business logic lives in services. All DB access goes through repositories.
3. **Config over code.** Any value a platform admin might reasonably need to change (cancellation window, fees, thresholds, wallet limits, notification copy) lives in `platform_config` or `policies` tables, not as a constant in source. Changeable without a redeploy.
4. **Ledger over mutable balance.** Wallets and doctor earnings are append-only transaction logs (`wallet_transactions`, `doctor_earnings_ledger`). A `current_balance`-style column is a cache derived from the ledger, never the sole source of truth.
5. **Snapshot facts at the moment they happen.** `consultation_fee_charged`, cancellation `fee_charged_percent`, and — for offline visits — the clinic address at time of booking, are all copied onto the record when the event occurs. Never recompute historical facts by joining against current config/profile data.
6. **Normalize one-to-many data.** Prescription line items, doctor education/languages/availability, employee dependents — child tables with proper foreign keys, not JSON arrays on the parent.
7. **Company-scoped queries stay company-scoped at the query layer, not the prompt layer.** Especially for the RAG assistant: filter by `company_id` in the database query, never rely on prompt instructions alone.
8. **Webhooks are the source of truth for payments**, not client-side success callbacks. Razorpay top-up confirmation must be verified server-side via webhook before crediting a wallet.
9. **Appointment mode (online/offline) changes downstream behavior.** Only `online` appointments get a `conversation_id` and a chat record. Only `offline` appointments carry a clinic-address snapshot. Don't build shared logic that assumes every appointment has a chat.

## Tech stack

- Backend: Node.js, TypeScript, Fastify
- Databases: PostgreSQL via Drizzle ORM (relational data), MongoDB via Mongoose (chat conversations only), pgvector (policy document embeddings), Redis via ioredis (caching)
- Auth: Firebase Admin SDK + firebase (client), otplib for self-hosted TOTP
- Validation: Zod, shared between frontend and backend where the schema overlaps
- Logging: Pino, structured JSON — every service method that can fail must log context on failure, not just throw
- Frontend: Next.js (App Router), TypeScript, TanStack Query, Tailwind CSS, react-hook-form
- **AI: `@google/genai` (Gemini) is the primary provider for every in-product AI workflow. Groq is the fallback provider, used with the same interface if Gemini is unavailable or rate-limited. Do not route production traffic through Anthropic's API — it has no ongoing free tier at this project's cost constraints; Claude is a development-time tool only, not a runtime dependency.**
- Testing: Vitest (unit/integration), Supertest (API), MSW (mocking), Playwright (E2E), k6 (load)

## Repository structure

```
buzzhealth/
├── apps/
│   ├── web/
│   │   ├── app/                          → routing only, no business logic
│   │   ├── features/                     → feature-based, mirrors backend modules
│   │   │   ├── benefits/ doctor-matching/ booking/ gamification/ recommendations/
│   │   │   ├── doctor-portal/
│   │   │   ├── company-admin-dashboard/
│   │   │   └── platform-admin/
│   │   ├── components/                   → shared UI primitives only (incl. DoctorCard)
│   │   ├── lib/ styles/ public/
│   └── mobile/                           → not yet built; do not assume it exists
├── packages/
│   ├── api/
│   │   └── src/
│   │       ├── modules/                  → one folder per domain, each with .routes.ts/.controller.ts/.service.ts/.repository.ts/.types.ts
│   │       ├── db/ (mongo/ postgres/ vector/)
│   │       ├── cache/
│   │       ├── ai/
│   │       │   ├── gemini-client.ts      → primary, tool-calling + structured output
│   │       │   ├── groq-client.ts        → fallback, same interface
│   │       │   ├── tools/                → e.g. search-policy-docs (used only by the RAG workflow)
│   │       │   └── workflows/            → one file per agent workflow, see docs/02-AI-Agent-Workflows.md
│   │       ├── middleware/ (auth, error handler, request logger)
│   │       └── lib/ (logger, config, external clients)
│   ├── shared-types/
│   └── shared-config/
├── tests/ (unit/ integration/ e2e/ load/)
└── docs/ (this file, 01-Features-and-Data-Specification.md, 02-AI-Agent-Workflows.md, 03-Project-Plan.md, architecture-decisions/)
```

## Design system

- Backgrounds: `#FFFFFF` primary, `#F7F9FC` for section separation — no gray-on-gray
- Royal Blue `#1E3A8A` — primary actions and trust-heavy surfaces (benefits, booking, records, "Book" button on doctor cards)
- Vibrant Orange `#F5701A` — engagement surfaces only (challenges, streaks, nudges), used sparingly
- Gold `#C9A227` — reserved for achievement/reward moments, never decorative
- If a screen uses all three accents at equal visual weight, that's wrong — flag it rather than shipping it
- Typography: clean modern sans, optimized for data-dense utility screens, not a marketing aesthetic
- Doctor cards: photo, name, specialty, education, languages, city, and mode badges (online/offline) should read clearly in a grid — city/mode as small badges, not competing visually with the doctor's core identity info

## Working conventions

- **Decompose before dispatching.** For any non-trivial feature, write out the sub-tasks first (data model → repository → service → controller/route → tests) rather than generating an entire module in one pass.
- **Every new endpoint needs**: input validation (Zod), a service-layer test, an integration test hitting the real route, and a log line on both success and failure paths.
- **Every new DB table needs a migration**, not a manually-run script. Migrations live in `packages/api/src/db/postgres/migrations` (Drizzle).
- **Do not silently swallow errors.** A caught exception must either be logged with context and re-thrown/handled meaningfully, or there must be a clear comment explaining why swallowing it is correct in that specific case.
- **Right-size the solution.** Don't introduce abstraction (factories, generic repository interfaces, plugin systems) for a single concrete use case.
- **Ask before assuming scope.** If a task is ambiguous, implement the smaller, clearly-specified version and flag what was left out, rather than guessing large.
- **PHI awareness.** Chat transcripts and prescription content are sensitive health data. Don't log message bodies or prescription contents above debug level, and never in shared/aggregated logs. No debug endpoints that bypass normal auth checks on this data.
- **Use structured output over tool-calling when the task doesn't need it.** Only the benefits RAG assistant genuinely needs the multi-turn tool loop. Doctor matching, prescription assist, cancellation triage, and notification copy are single-shot structured-output tasks — implement them that way, don't over-build an agent loop where a schema-constrained generation call is sufficient.

## AI agent workflows (in-product, not the build process)

Six bounded workflows exist inside the product — full specs in `docs/02-AI-Agent-Workflows.md`. Key constraints to hold in code:
- **Doctor matching** classifies symptoms into a *closed set* of onboarded specialties only — validate the model's output against that list server-side, reject anything outside it. This routes to a specialty; it never diagnoses. Emergency/red-flag symptom keywords bypass the model entirely via a hardcoded check before any LLM call.
- The **prescription structuring assist** never writes directly to the database — it returns a draft the doctor must explicitly confirm.
- The **RAG assistant** never answers from general model knowledge when retrieval returns nothing relevant — it says so, and is company-scoped at the query layer.
- **Cancellation triage** runs asynchronously and never blocks the cancellation action itself.

## Testing expectations

- Unit tests for service-layer logic, especially anything touching money (wallet debits/credits, cancellation fee splits, earnings aggregation)
- Integration tests for every route, run against a real (test) database, not mocks
- E2E coverage for core user journeys: symptom → matched doctors → book (online and offline) → chat/visit → prescription, wallet top-up, cancellation with refund/rebook choice
- Load tests (k6) for the RAG query endpoint, the doctor-matching endpoint, and the booking endpoint specifically, since these are the most concurrency-sensitive paths

## Policy assignment (employees module) — employer-explicit, no CTC

Employee CTC is never collected or stored anywhere in this system —
privacy-sensitive and not needed for the product to function. Policy
assignment is always an explicit choice made by the company admin, not
inferred by the platform:
- `employees.position_grade` (e.g. L1, L2, IC1, IC2) is a free-form,
  employer-defined field used only as a filter/grouping convenience in the
  admin UI (search + multi-select employees by grade, then bulk-assign a
  policy). It is never used to auto-select a policy tier.
- `employees.policy_id` is always set explicitly, by single assignment or
  bulk multi-select assignment, never inferred from any employee attribute.
- If an employee has no policy assigned yet, that's a valid, visible state
  (not an error) — the admin dashboard should surface unassigned employees
  clearly so the company admin can act on it.

## Policy expiry and unclaimed benefits

- `employees.policy_expiry_date` is set at enrollment (typically the
  assigned policy version's `effective_to`) and stored on the employee
  record directly, since a mid-year hire's expiry may differ from the
  company's standard cycle.
- At policy-year-end, a scheduled job snapshots each active wallet's
  remaining balance per category into `wallet_expiry_snapshots`
  (employee_id, wallet_id, category, unclaimed_amount, policy_year_end)
  before the wallet lapses or resets. This preserves an unclaimed-benefits
  record without rewriting wallet ledger history — consistent with the
  ledger-over-mutable-balance principle above.

## Company maintainers (role-based access)

Companies can provision multiple maintainers with different access levels:

1. **admin** — full control. Can add/remove other maintainers, manage employees, assign policies, and perform all write operations.
2. **maintainer** — read-write access to employees and policies. Cannot manage other maintainers.
3. **read-only** — read-only access to employee and policy data. Cannot modify anything.

**Rules:**
- Only `admin` maintainers can call `/companies/:companyId/maintainers` endpoints.
- Maintainers are identified by email per company (unique constraint on `company_maintainers.company_id, email`).
- A company must always have at least one `admin` maintainer — the last admin cannot be removed or demoted.
- Maintainer lists are not visible to non-admin maintainers.
- The initial admin is created when the company is provisioned (platform admin action, not covered by this API).

**Schema additions:**
- `roles` table — seeded with `admin`, `read-only`, `maintainer`.
- `company_maintainers` table — (id, company_id, email, role_id, created_at, updated_at). Unique index on (company_id, email).

## What to do when something breaks or looks wrong

Say so directly, with your reasoning, rather than quietly working around it. If you generate something and are not confident it's correct — a library API, a query, a piece of business logic — say what you're unsure about rather than presenting it with full confidence.