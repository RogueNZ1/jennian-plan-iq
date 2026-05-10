## Jennian IQ — Stabilisation Plan

This is a large, multi-part change. To keep it safe I'll execute in 5 sequential phases. Each phase compiles cleanly on its own. No visual redesign, no removal of working functionality.

### Phase 1 — Database foundation (one migration)

Create three new tables with RLS:

- `module_runs` — one row per (job, module). Tracks status, review_status, confidence_avg, item_count, last_run_at, approved_by, approved_at, required (bool).
- `module_items` — line items per run; stores extracted_value, approved_value, confidence, review_status, notes, basis, sort_order.
- `module_audit_logs` — append-only history of edits, approvals, exports, recalculations.

Also extend `export_logs` with `module_id text` (nullable) so per-module exports can be logged without breaking IQ Core CSV exports.

RLS pattern (mirrors `extracted_quantities`):
- READ: any reader of the parent job (creator, admin/owner, viewer when job approved/exported).
- INSERT/UPDATE: `can_write()` AND owns/admin parent job.
- DELETE: admin/owner only.
- Approvals are enforced in the application layer using `useRoles()` and `is_admin_or_owner()`/`can_write()`.

Trigger: `set_updated_at` on both data tables.

### Phase 2 — Module persistence refactor

Refactor `src/lib/iq-modules.ts` so all reads/writes go through Supabase. Keep the existing module catalogue (9 modules + dummy item generators) but move them into seed functions that INSERT to `module_runs`/`module_items` once per job.

New API (all async, all Supabase-backed):
- `seedAllModulesForJob(jobId)` — idempotent; inserts runs+items for any module missing for the job.
- `loadModuleRuns(jobId)` → all 9 run rows (for Job Detail overview).
- `loadModuleRun(jobId, moduleId)` → run + items.
- `updateModuleItem(itemId, patch, { reason? })` → updates row, writes `module_audit_logs`.
- `setItemReviewStatus(itemId, status)` → with audit log.
- `recalculateModule(jobId, moduleId)` → bumps `last_run_at`, regenerates dummy items where appropriate (deterministic), writes audit log.
- `approveModule(jobId, moduleId)` → sets status=`approved`, approved_by/at; audit log.
- `exportModuleCsv(jobId, moduleId)` → builds CSV from module_items + job header; logs to `export_logs`.
- `calculateJobModuleRollup(jobId)` → derives job-level state from runs (used to enable/disable "Approve Job").

The localStorage code path is removed. The `tick`/`storage` listener in `/review` goes away.

`upload.tsx` keeps calling `seedAllModulesForJob(jobId)` after persistence, but it now writes to Supabase.

IQ Core: keeps using `extracted_quantities` for the editable table. We additionally maintain a `module_runs` row for it (status mirrors `extracted_quantities` review state) so it appears in the module overview consistently.

### Phase 3 — Job Detail hub + IQ Core split + breadcrumbs

New route: `src/routes/jobs.$jobId.tsx` rendering:
- Header with job number, client, address, status, overall confidence, last updated.
- Job Summary card (house area, foundation area, perimeter, internal wall length, garage area, roof pitch — pulled from approved IQ Core items where present, otherwise em-dash).
- Plan Preview (existing `PlanThumbnail` + "View Plans" → opens `PlanViewer`, "Change Working Plan" → routes back to upload's plan-selection step for that job).
- Files list (from `uploaded_files`).
- Module Overview (9 cards reading from `module_runs`, with required/optional badge and "Open Module" link).
- Audit log (combined recent rows from `quantity_overrides`, `module_audit_logs`, `export_logs`).
- Actions: Open IQ Core, Export Approved Quantities, Approve Job (gated + disabled with tooltip if any required module is not Approved), Back to Jobs.

`/review?job=...` is trimmed to **IQ Core Review only**: removes `ModulesOverview`. Adds breadcrumb `Jobs / [Job #] / IQ Core Review` + Back-to-Job button.

`/jobs` table action now points to `/jobs/$jobId` (not `/review`).

`/modules/$moduleId?job=...` keeps working but gets:
- Breadcrumb `Jobs / [Job #] / [Module Name]`.
- Back-to-Job button.
- "Run Extraction" → "Recalculate Quantities".
- All actions wired through the new Supabase-backed API.
- Real per-module CSV export.
- Approve Module / Mark Reviewed / Export Module CSV all functional.

(I won't introduce a parallel `/jobs/$jobId/modules/$moduleId` route — it would double the route surface; the existing flat route covers the same workflow with breadcrumbs.)

### Phase 4 — Override dialog + role gating

- New `OverrideReasonDialog` component (shadcn `Dialog`), used by both `/review` and module item edits. Reason required when row confidence is `low` OR when the change exceeds 5%. Replaces every `window.prompt()`.
- `AppLayout` sidebar reads `useRoles()` and hides:
  - Users → admin/owner only
  - Settings → owner only
  - Templates → owner/admin/estimator
  - Specifications → owner/admin/estimator/project_manager
  - Reports → owner/admin (visible but Phase-2 placeholder)
  - Upload Plan → owner/admin/estimator
  - Modules global entry → **removed** (modules only exist within a job)
- Approval buttons disabled with tooltip when role lacks permission.

### Phase 5 — Honest placeholders + language cleanup

- `/reports` — replace fake stats with 4 "Coming in Phase 2" cards (Quantity accuracy, Module review progress, Export history, Margin review).
- `/templates` — keep template cards but remove fake "12 quantity rules · 4 specification ties" line; mark non-functional buttons "Phase 2".
- `/specifications` — replace static lists with linked-to-job placeholder copy; show real linked specs if any exist.
- `/settings` — disable non-functional buttons with "Available in Phase 2" label.
- Language sweep across visible copy: "Run Extraction" → "Recalculate Quantities", "AI Processing" → "Plan Review", "Extraction Accuracy" → "Quantity Accuracy", "Intelligence Dashboard" → "Project Overview". No "smart", "AI-assisted", "magic", "command centre", "intelligence platform" anywhere.

### Out of scope (deferred per your instruction)

- Real AI/OCR extraction.
- Procurement automation.
- Margin intelligence math.
- Plan Viewer pan/zoom + thumbnail strip (Part 12) — I'll keep it as a follow-up; touching pdf.js viewport math is high-risk this pass and the existing viewer is functional. Flag this as the immediate next prompt after this pass lands.
- Active-job indicator in the global sidebar (breadcrumbs cover it on job-scoped pages, which is the safer surface).

### Risk notes

- Existing jobs will have **no** `module_runs` rows. On first visit to Job Detail or Module Review I'll lazily call `seedAllModulesForJob(jobId)` so historical jobs heal automatically. Idempotency: skip insert if a run already exists for `(job_id, module_id)`.
- The `/review` page currently reads localStorage — switching to Supabase means a one-time visual change for any user mid-flow with unsynced local edits. There's no migration path for that data; it was demo-only.

### Execution order

1. Create migration (Phase 1) — wait for your approval before running.
2. After migration runs: refactor `iq-modules.ts` (Phase 2), build Job Detail + breadcrumbs + IQ Core split (Phase 3).
3. Override dialog + role gating (Phase 4).
4. Placeholder + copy sweep (Phase 5).

Approve this plan and I'll start with the migration.