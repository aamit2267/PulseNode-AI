# BuzzHealth.ai — AI Agent Workflows

These are workflows within the *product itself* where an AI agent performs a bounded task with a clear trigger, output contract, and guardrails. **Gemini (2.5/3.1 Flash) is the primary model for all workflows below** — genuine ongoing free tier at BuzzHealth.ai's current volume (~150–200 calls/day). **Groq** (free, ongoing) is the fallback if Gemini is unavailable or rate-limited. Claude is reserved for development/prompt-tuning only, not routed in production, since Anthropic has no ongoing free API tier.

Each workflow is independently buildable so several can be developed in parallel.

---

## 1. Benefits RAG Assistant

**Trigger:** Employee submits a natural-language question in the benefits chat UI.

**Workflow:**
1. Query embedded (same embedding model used at ingestion)
2. Vector similarity search against that employee's **company-scoped** policy documents in pgvector — never cross-company
3. Top-k chunks + employee's specific policy tier metadata injected into context
4. Gemini generates an answer grounded only in retrieved content, using function calling (tool: `search_policy_documents`) so the model decides when it needs to fetch more context vs. answer directly

**Output contract:** Plain-language answer + citation to which policy document/section it came from.

**Guardrails:**
- Retrieval must filter by `company_id` at the query layer, not rely on the prompt to enforce scoping
- If retrieval returns no relevant chunks, respond "I don't have that information" rather than letting the model guess
- No medical advice — redirect symptom-related questions to the doctor-matching flow (Workflow 2), don't answer clinically
- Log every query + retrieved chunks for audit

---

## 2. Doctor-Matching Agent (symptom → specialty → doctor cards)

**Trigger:** Employee describes symptoms in free text at the start of booking, before selecting a doctor.

**Workflow:**
1. Symptom text sent to Gemini with a **closed, fixed list** of the platform's actual onboarded specialties (e.g. Dermatology, General Physician, ENT, Orthopedics, Gynecology)
2. Structured output (JSON schema, not tool-calling) returns one specialty from that list + a short plain-language reason ("skin rash and itching → Dermatology")
3. Backend validates the returned specialty is actually in the closed list — reject and default to General Physician if not
4. Backend queries `doctors` filtered by: specialty match, `status = approved`, and availability — optionally further filtered by the employee's city (see below) and preferred mode (online/offline)
5. Results rendered to the employee as **doctor cards**

**Doctor card contents (each result):**
- Photo
- Name
- Specialty/doctor type
- Education history (e.g. MBBS, MD — pulled from `doctor_education`)
- Languages spoken (from `doctor_languages`)
- City
- Consultation modes available (online / offline / both), with fee shown per mode if they differ
- "Consult locally" indicator when the doctor's city matches the employee's registered city

**Output contract:** Specialty classification (closed-set, validated) + ranked doctor list matching the card fields above, returned as structured JSON the frontend renders directly into cards — no free-text formatting from the model.

**Guardrails:**
- **This is routing, not diagnosis.** The model selects a specialty category only; it never names a condition or suggests treatment. Prompt explicitly forbids diagnostic language.
- **Closed-set output only**, validated server-side before use.
- **Emergency/red-flag symptoms bypass the model entirely.** Keywords like chest pain, difficulty breathing, severe bleeding trigger a hardcoded rule *before* any LLM call, showing an urgent-care message immediately — no model latency or judgment between a serious symptom and appropriate guidance.
- **User can always override** — the suggested specialty pre-filters the doctor list but never hides the full directory or forces a path.
- City-matching is a *ranking signal and a filter option*, not a hard restriction — an employee can still book any doctor regardless of city if they choose online consultation.
- Log every classification + returned doctor set for review.

---

## 3. Prescription Structuring Assist (doctor-side)

**Trigger:** Doctor finishes typing free-text consultation notes and clicks "generate prescription draft" (optional assist).

**Workflow:**
1. Doctor's free-text notes sent to Gemini with structured-output schema matching `prescription_items`
2. Model proposes structured line items (medicine name, dosage, frequency, duration, instructions)
3. Draft returned to the doctor's form, **pre-filled but fully editable**

**Output contract:** Structured JSON matching `prescription_items` — never written directly to the database.

**Guardrails:**
- **The doctor must explicitly review and confirm every field before submission.** No auto-submit path should exist, ever.
- Flag (don't silently correct) anything resembling a known drug-interaction concern or unusual dosage — model surfaces a warning, doesn't block or alter.
- Easy to disable per-doctor or platform-wide via `platform_config`.

---

## 4. Cancellation Reason Triage

**Trigger:** Cancellation submitted (doctor or user) with free-text reason.

**Workflow:**
1. Reason text classified into a fixed category set (`doctor_unavailable`, `patient_no_longer_needed`, `technical_issue`, `dissatisfaction`, `other`) via Gemini structured output
2. Category stored alongside raw text for platform-admin reporting

**Output contract:** One category label + confidence.

**Guardrails:**
- Classification runs async and never blocks the cancellation action itself
- Low-confidence classifications default to `other` rather than forcing a guess
- Raw text always retained regardless of classification

---

## 5. Notification Copy Generation (template authoring aid)

**Trigger:** Platform admin creates/edits a `notification_templates` entry.

**Workflow:**
1. Admin describes the notification intent in plain language
2. Gemini drafts subject + body text with template variables marked (`{{doctor_name}}`, `{{appointment_time}}`)

**Output contract:** Draft template text; admin edits and saves explicitly — never auto-published.

**Guardrails:**
- No auto-deployment of generated copy
- Validate all required template variables for that `notification.type` are present before allowing save

---

## 6. Personalized Recommendation / Nudge Engine

**Trigger:** Scheduled daily job per employee, or on-demand when employee opens the app.

**Workflow:**
1. Pull employee's recent activity signals (last health-check date, wallet usage, challenge participation, login recency)
2. Rule-based scoring first (cheap, deterministic)
3. For borderline/ambiguous cases only, Gemini ranks or phrases the nudge in natural language

**Output contract:** A short ranked list (1-3) of nudges with plain-language messages.

**Guardrails:**
- Rules decide *whether* to nudge; the model only phrases/ranks, never decides medical relevance
- Daily nudges cached in Redis so repeated app opens don't regenerate them
- No nudge references other employees' data, even anonymized, without explicit review

---

## Provider architecture

```
packages/api/src/ai/
├── gemini-client.ts       → primary, tool-calling + structured output helpers
├── groq-client.ts          → fallback, same interface
├── tools/
│   └── search-policy-docs.ts     (used by Workflow 1 only)
└── workflows/
    ├── benefits-assistant.ts      (tool-calling)
    ├── doctor-matcher.ts           (structured output)
    ├── prescription-assist.ts      (structured output)
    ├── cancellation-triage.ts       (structured output)
    ├── notification-copy.ts
    └── recommendation-engine.ts
```

Only Workflow 1 (Benefits RAG Assistant) needs the full tool-calling loop, since it's the one case where the model must decide *when* to fetch more context. Workflows 2–5 are structured input/output tasks — simpler, cheaper, and don't need multi-turn tool orchestration.

## Parallelization notes

Workflows 1, 2, 3, 4, and 5 have no runtime dependency on each other and can be built/tested as fully separate workstreams. Workflow 6 depends on core appointment/wallet/gamification data existing first, so sequence it last.
