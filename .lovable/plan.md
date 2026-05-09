## Jennian IQ — Functional Build Plan

Turn the current mock UI into a working app backed by Lovable Cloud (auth, database, storage). Keep the existing premium design — only replace mock data with real flows.

### 1. Enable Lovable Cloud
Provision database, auth, and storage. No user action required.

### 2. Database schema (migration)

- `profiles` (id → auth.users, full_name, created_at) + trigger to auto-create on signup
- `jobs` (id, job_number, client_name, address, template, status, uploaded_at, created_by, updated_at)
  - `status` enum: `draft | uploaded | extracted | review_required | approved | exported`
- `uploaded_files` (id, job_id, file_type[`plan|specification`], file_name, storage_url, uploaded_at)
- `extracted_quantities` (id, job_id, quantity_type, unit, extracted_value, approved_value, confidence[`high|mid|low`], notes, created_at)
- `quantity_overrides` (id, quantity_id, original_value, new_value, edited_by, reason, timestamp)
- `export_logs` (id, job_id, exported_by, export_type[`csv|excel`], timestamp)

RLS: every table scoped to `created_by = auth.uid()` (or via job ownership for child tables). Storage bucket `job-files` (private) with policies allowing owners to read/write their own job folders.

### 3. Authentication
- `/login` and `/signup` routes (email + password, Lovable Cloud defaults; auto-confirm enabled for dev speed)
- `_authenticated` layout route guarding all app pages, redirecting to `/login`
- Session listener (`onAuthStateChange` + `getSession`) in a small auth hook
- Top-right header: user initials avatar with dropdown → Sign out
- Logout clears session and redirects to `/login`

### 4. Upload Plan workflow (`/upload`)
Form fields: Job Number, Client Name, Address, Template select. Two required dropzones: Plan PDF, Specification PDF.

Buttons:
- **Save Draft** — inserts `jobs` row with status `draft`, uploads any provided files to storage, links rows in `uploaded_files`.
- **Run Jennian IQ Extraction** — same as draft, then sets status `uploaded`, inserts the 8 mock Russell Street quantities into `extracted_quantities` with status `extracted`, then navigates to `/review/$jobId`.

### 5. Quantity Review (`/review/$jobId`)
Editable table loading real rows for the job. Columns: Quantity Type, Unit, Extracted Value, **Final Value** (editable), Confidence, Notes, Override action.

On edit: insert `quantity_overrides` row (original, new, user, timestamp, reason via small prompt) and update `approved_value` + bump confidence to high. Sidebar shows confidence summary + audit log fed from `quantity_overrides`.

Approve button → set job status `approved`.

### 6. Export
On review page: **Export CSV** and **Export Excel** (xlsx via `xlsx` npm). Columns per spec. Each export inserts an `export_logs` row and sets job status `exported`.

### 7. Confidence system
Reuse existing `ConfidencePill` (high/mid/low). Surface badges on Dashboard, Jobs list, and Review.

### 8. Job status badges
Add a `StatusBadge` component with colour-coded pills for the 6 statuses; render on Dashboard recent jobs and `/jobs` table.

### 9. Dashboard + Jobs
Replace mock data with live Supabase queries (server functions). Stats: total jobs, jobs needing review, exported this month. Recent jobs table from `jobs` table.

### 10. Design
No visual changes. All work is wiring real data into the existing premium charcoal/white/red layout.

### Technical notes
- Server functions (`*.functions.ts`) under `src/lib/` for all DB writes/reads requiring auth, using `requireSupabaseAuth` middleware.
- File uploads done client-side with the browser Supabase client to the `job-files` bucket (path: `${user_id}/${job_id}/${file_type}-${filename}`), then a server fn records the row.
- Add `xlsx` package for Excel export.
- Future phases (AI extraction, rules engine, POs, margin) plug into the existing `extracted_quantities` table — schema is already shaped for it.

### Out of scope (this step)
- Real AI extraction (kept as mock data per request)
- Rules engine, POs, margin intelligence (Phases 3–5)
- Specifications/Templates/Reports/Users/Settings page wiring beyond what's needed for upload→review→export
