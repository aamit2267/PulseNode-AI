# BuzzHealth.ai — Project Plan

A corporate health-benefits platform: policy-aware benefits assistant, symptom-based doctor matching, online and offline doctor consultations, prescriptions, category-scoped employee wallets, and doctor earnings — built decoupled so the same backend serves web today and mobile later.

---

## 1. Product surfaces (4 distinct apps, one backend)

1. **Employee app** — benefits assistant, doctor matching/discovery, booking (online/offline), consultations, prescriptions, wallet, gamification
2. **Doctor portal** — profile (incl. city, clinic address, modes offered), availability, appointment queue, consultation, prescription authoring, earnings, withdrawals
3. **Company admin dashboard** — bulk employee provisioning, policy configuration, MFA toggle (scoped to their own company)
4. **Platform admin portal** (internal) — company/doctor/policy management, global config, notification templates, full visibility

---

## 2. Architecture

**Pattern:** Layered (Controller → Service → Repository), monorepo, backend fully decoupled from any client.

```
buzzhealth/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── features/
│   │   │   ├── benefits/ doctor-matching/ booking/ gamification/ recommendations/   (employee)
│   │   │   ├── doctor-portal/
│   │   │   │   ├── appointments/ profile/ earnings/
│   │   │   ├── company-admin-dashboard/
│   │   │   │   ├── employee-upload/ policy-mapping/ mfa-settings/
│   │   │   └── platform-admin/
│   │   │       ├── config/ companies/ doctors/ notifications/
│   │   │   ├── components/ lib/ styles/ public/
│   └── mobile/                        → future React Native, same API
│
├── packages/
│   ├── api/
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/ companies/ employees/ ingestion/
│   │   │   │   ├── doctors/ appointments/ prescriptions/
│   │   │   │   ├── cancellations/ wallets/ doctor-earnings/
│   │   │   │   ├── notifications/ platform-config/
│   │   │   │   ├── benefits/ booking/ gamification/ recommendations/
│   │   │   │   └── rag/
│   │   │   ├── db/ (mongo/ postgres/ vector/)
│   │   │   ├── cache/ (redis)
│   │   │   ├── ai/                    → Gemini (primary) + Groq (fallback) clients, tools, workflows
│   │   │   ├── middleware/ lib/ server.ts
│   ├── shared-types/
│   └── shared-config/
│
├── tests/ (unit/ integration/ e2e/ load/)
├── docs/ (CLAUDE.md, architecture-decisions/)
├── turbo.json
└── package.json
```

---

## 3. Data layer

- **PostgreSQL** (Neon, free) — all relational/transactional data: companies, policies, employees, doctors (+ education/languages/availability child tables, **city**, **clinic address**), appointments (+ **mode**: online/offline), prescriptions (+ items), cancellations, wallets (+ transactions, topup_requests), doctor_earnings_ledger, doctor_withdrawals, notifications, notification_templates, platform_config
- **MongoDB** (Atlas M0, free) — chat conversation documents (online appointments only)
- **pgvector** — policy document embeddings for RAG, same Postgres instance
- **Redis** (Upstash, free) — cache-aside for: earnings aggregates, daily recommendation nudges, hot-reloadable `platform_config`, RAG query results (short TTL)

**Key doctor/appointment schema additions from this round of discussion:**
- `doctors.city` — first-class filter field, drives "consult locally" matching
- `doctors.consultation_modes` — `['online']` / `['offline']` / `['online','offline']`
- `doctors.clinic_address` — required if offline is offered
- `doctors.consultation_fee_online` / `consultation_fee_offline` — may differ by mode
- `appointments.mode` — `online` \| `offline`; only online gets a `conversation_id`; offline carries a snapshot of the clinic address at booking time (same "snapshot financial/factual state" principle used for fees)

**Design principles applied throughout:**
- Config over code — all fees, thresholds, limits editable via `platform_config`/`policies`, no redeploy
- Ledger over mutable balance — wallets and doctor earnings are append-only transaction logs with a derived, cached balance
- Normalize "multiple per parent" data — medicines, languages, education, availability, dependents are child tables, not JSON blobs
- Snapshot facts at the moment they occur — `consultation_fee_charged`, `fee_charged_percent`, offline visit address — never recompute historical records from current config/profile data

---

## 4. Authentication (three distinct flows)

| Actor | Method | Gate |
|---|---|---|
| Employee | Firebase custom token, backend-issued | Pre-provisioned corporate email check happens **before** Firebase involvement |
| Doctor | Firebase Google Auth or email/password | Self-signup, then `status: pending` until platform-admin approval |
| Company/Platform admin | Firebase email/password | Manually provisioned by platform owner |

2FA: self-hosted TOTP (`otplib`) when `company.mfa_required = true`. Standard email OTP otherwise.

---

## 5. Money flows

1. **Wallet debit** — appointment booked (online or offline) → ledger debit (category-scoped) → cached balance updated in same DB transaction
2. **Wallet top-up** — Razorpay test-mode order → checkout → **webhook** confirms payment → ledger credit
3. **Cancellation refund/fee** — split logic (full refund outside window, 90/10 split inside window), doctor's 10% "apology" credit written to `doctor_earnings_ledger` separately
4. **Doctor withdrawal** — validated against `doctor_earnings_ledger` available balance, mirrors wallet ledger pattern

---

## 6. AI agent workflows

Six bounded, independently buildable workflows — see `02-AI-Agent-Workflows.md` for full trigger/output/guardrail spec:
1. Benefits RAG assistant
2. **Doctor-matching agent** (symptom → specialty → filtered doctor cards, city- and mode-aware)
3. Prescription structuring assist (doctor-reviewed, never auto-submits)
4. Cancellation reason triage
5. Notification template copy generation
6. Recommendation/nudge engine

**Provider strategy:** Gemini 2.5/3.1 Flash as primary (genuine ongoing free tier, comfortably covers current volume of ~150-200 calls/day), Groq as fallback (also ongoing free tier), Claude reserved for development/prompt-tuning only — not routed in production, since Anthropic has no sustained free API tier.

---

## 7. Design system

White background (`#FFFFFF` / `#F7F9FC`), Royal Blue `#1E3A8A` (trust surfaces), Vibrant Orange `#F5701A` (engagement, sparing use), Gold `#C9A227` (achievement moments only). Clean modern sans-serif. Restraint rule: no screen should carry all three accents at equal weight.

**Doctor card component** (new): photo, name, specialty, education (MBBS, MD etc.), languages, city, mode badges (online/offline), fee — should read cleanly in a grid, Royal Blue for the primary "Book" action, city/mode as small badges rather than competing visually with the doctor's core info.

---

## 8. Stack summary

**Backend:** Fastify, TypeScript, Mongoose, Drizzle ORM (Postgres), pgvector, ioredis, `@google/genai` (Gemini), Groq SDK, firebase-admin, otplib, googleapis, papaparse, Zod, Pino
**Frontend:** Next.js (App Router), TanStack Query, Tailwind, react-hook-form + Zod
**Testing:** Vitest, Supertest, MSW, Playwright, k6
**Deployment (all free tier, no card):** Vercel (web), Render + Docker (api), Neon (Postgres), Atlas M0 (Mongo), Upstash (Redis), Firebase Spark (auth), Razorpay test mode (payments), Resend (transactional email), Gemini API + Groq API (AI)

---

## 9. Build sequencing (suggested)

1. Core data layer: companies, policies, employees, ingestion
2. Auth (all three flows) + role-scoped access control
3. Doctors module (incl. city, modes, clinic address) + doctor portal shell (profile, availability)
4. Appointments + booking (online/offline) + double-booking prevention
5. Chat (Mongo, online only) + prescriptions (+ items)
6. Wallets + ledger + top-up (Razorpay test mode)
7. Cancellations (config-driven rules)
8. Doctor earnings + withdrawals
9. Notifications (in-app + Resend email)
10. AI agent workflows (parallelizable once their data dependencies exist — doctor-matching needs doctors module; RAG needs policy doc ingestion)
11. Gamification + recommendations
12. Platform-admin config UI (can move earlier if config-driven rules are needed sooner for testing)

---

## 10. Open items to settle before/during build

- Google Sheets ingestion: one-time import (recommended) vs. live sync
- Lab test wallet category flow — not yet scoped beyond having a wallet bucket for it
- Dark mode — defer to post-MVP
- Offline visit confirmation flow — does the platform need any check-in/completion confirmation for offline visits (since there's no chat log to mark completion), or does the doctor manually mark `completed` after the fact? (Recommend: doctor manually marks completed, same as they would end a chat)
