# BuzzHealth.ai — Features & Data Specification

## 1. Feature list by module

### Employee-facing
- Corporate email login (pre-provisioned only), OTP or company-mandated 2FA
- Benefits RAG assistant — natural-language Q&A grounded in company policy documents
- **Symptom-based doctor matching** — describe symptoms, get a ranked, filterable set of doctor cards (photo, name, specialty, education, languages, city)
- Doctor discovery — browse/filter by specialty, language, city, availability, consultation mode
- Appointment booking — **online (chat)** or **offline (in-person, city-matched)** visit
- In-chat consultation with assigned doctor (online mode only)
- Prescription view (multi-medicine, per-item dosage/frequency/duration/instructions)
- Wallet — three category-scoped balances (consultation, medicine, lab test), transaction history
- Wallet top-up (Razorpay test-mode payment)
- Cancellation (with refund or fee split depending on timing)
- Gamification — challenges, streaks, leaderboard
- Personalized recommendation feed
- In-app + email notifications

### Doctor-facing
- Signup/login — Firebase Google Auth or email/password
- Approval-gated onboarding (platform admin must approve before bookable)
- Profile management — name, photo, education (multi-entry), languages (multi-entry), **city**, **consultation modes offered (online/offline/both)**, **clinic address (if offline)**, weekly availability, consultation fee, currency
- Appointment queue — upcoming / completed tabs, filterable by mode (online/offline)
- In-chat consultation (online only)
- Prescription authoring — multi-medicine form (add/remove line items)
- Cancellation with mandatory reason
- Earnings dashboard — Today / This Week / This Month / This Year / Overall, cached aggregates
- Withdrawal requests

### Company-admin-facing
- Bulk employee provisioning (Google Sheets or CSV, one-time import)
- Policy tier configuration per company (sum insured, floater/individual, coverage basis, CTC bands)
- MFA requirement toggle for their organization

### Platform-admin-facing (internal)
- Company onboarding & policy management
- Doctor approval/suspension, including verifying offline clinic address
- Config editor — cancellation window, late-fee %, low-balance threshold, wallet category limits per policy tier (all hot-reloadable, no redeploy)
- Notification template editor
- Full visibility across all appointments, wallets, cancellations, withdrawals

---

## 2. Data manually collected

### From company admin (at onboarding / bulk import)
- Company name, corporate email domain
- MFA requirement (yes/no)
- Policy tiers offered: name, sum insured, individual vs. family floater, lump sum vs. per-illness basis, CTC band range, room rent limit, co-pay %, waiting period, wallet category limits (consultation/medicine/lab test annual amounts)
- Employee list: corporate email, name, mobile number, CTC (for auto policy-tier mapping), dependents (if floater)

### From employee
- Login credential verification only (no self-entered profile — identity is pre-provisioned)
- Symptom description (free text, at booking)
- Preferred consultation mode (online/offline) and, for offline, willingness to travel vs. same-city only
- Wallet top-up amount, payment confirmation
- Consultation chat messages (online mode)
- Cancellation choice (refund vs. rebook, when applicable) and reason if cancelling
- Challenge/activity data for gamification (steps, health-check completion — manual entry or future device sync)

### From doctor (self-entered, at signup and ongoing)
- Name, email/Google account, profile photo
- Education: degree, institution, year (multiple entries)
- Languages spoken (multiple entries)
- **City** (primary practice location)
- **Consultation modes offered**: online, offline, or both
- **Clinic address** (required if offline is offered)
- Weekly availability: day + start/end time (multiple entries)
- Consultation fee + currency (may differ between online/offline if desired — see schema note)
- Per-appointment: symptoms summary, prescribed medicines — each with medicine name, dosage, frequency, duration (days), instructions
- Cancellation reason (mandatory when doctor-initiated)
- Withdrawal request amount

### From platform admin (ongoing config)
- Cancellation window (hours), late-cancellation fee %
- Low-balance top-up threshold
- Notification templates (subject/body per notification type)
- Company/policy/doctor approvals

---

## 3. Cross-cutting data notes

- All monetary rule values (fees, thresholds, limits) live in `platform_config` / `policies`, not code — editable without redeploy
- All "multiple per parent" data (medicines per prescription, languages/education/availability per doctor, dependents per employee) is normalized into child tables, not JSON blobs, to keep it queryable
- Financial movements (wallet, doctor earnings) are ledger-based (append-only `*_transactions` tables) with a derived balance cache — never a single mutable balance as the only source of truth
- Chat transcripts stored in MongoDB (variable-shaped, high-volume); everything else in PostgreSQL (relational, transactional)
- Doctor `city` is a first-class filter field, not buried in the address blob — it drives both the "consult locally" discovery flow and offline-visit eligibility
- Appointment `mode` (online/offline) determines which downstream flows apply: only online appointments get a `conversation_id`; only offline appointments carry a physical location snapshot
