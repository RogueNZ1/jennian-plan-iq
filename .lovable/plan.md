
# Automatic PDF Takeoff Engine — Phase A

The full spec (Parts 1–15) is roughly 3–4 weeks of real engineering: vector PDF linework parsing, raster fallback, dimension-line OCR, wall detection, opening detection, validation engine, audit, re-run. I cannot deliver all of that honestly in one pass.

What I **can** deliver in this pass — fully wired, no fake data, honest confidence — is a real working pipeline that uses what the project already has (`pdfjs-dist` for text + page sizes) and creates draft rows for everything it can genuinely extract from text. Anything it can't reliably do is left blank or marked `Manual Calibration Required` / `Review Required`. No fabricated numbers.

Anything beyond that I'd need to defer to Phase B with a clear "not yet" surfaced in the UI, rather than ship a fake "auto-detect" that silently invents wall lengths.

## Phase A — what ships in this pass

### 1. Pipeline + UI (Parts 1, 10, 13)
- New `Run Automatic Takeoff` button on the Job Detail page (only visible when at least one plan PDF is uploaded; hidden once approved values exist on IQ Core unless re-run dialog is used).
- `AutomaticTakeoffDialog` with the 6 progress steps from the spec, driven by real promise stages.
- `TakeoffSummary` panel on the job page: Working Plan Selected · Scale Status · IQ Core Drafts · Measurements · Openings · Module Items · Review Required / High / Low counts. Wording: "Draft quantities prepared for review."
- `Re-run Automatic Takeoff` confirm dialog. Re-run never overwrites `approved_value` or confirmed overrides; >2% drift on existing rows → `review_required` + audit log.

### 2. Page classification (Part 2) — text-heuristic
For each PDF page, I extract text via `pdfjs-dist` (already in deps) and classify by keyword density + page size:
- "FLOOR PLAN" / "GROUND FLOOR" + dimension strings → `Dimension Floorplan`
- "FLOOR PLAN" without dim strings → `Floorplan`
- "ELEVATION" → `Elevations`, "SECTION" → `Sections`, "SITE PLAN" → `Site Plan`, "ROOF PLAN" → `Roof Plan`, "ELECTRICAL" → `Electrical Plan`, etc.
- "SPECIFICATION" / "M3 SCHEDULE" → `Specification` / `Schedule`
- Otherwise `Unknown`.

Stored on the existing `jobs.working_plan_file_id` / `working_plan_page_number` columns plus a small new `takeoff_runs` table (see §6) that records `selected_page_type`, `classification_confidence`, `reason`. User can still override.

I will be honest: this is **text-keyword classification, not visual analysis**. Confidence will rarely be `high`.

### 3. Scale detection (Part 3) — text only
- Regex for `1:50`, `1:100`, `1:200`, `SCALE 1:nnn`, optional `@A3/@A2/@A1`.
- Read PDF page size from pdfjs viewport.
- If `scale_text` + page size both present → compute `pixels_per_mm` deterministically and write a `plan_calibrations` row with `confidence='mid'`, `review_status='review_required'`, `calibration_method='auto_text'`.
- If scale text alone is present but page size unknown → `Auto-Calibrated — Needs Review`, `confidence='low'`.
- If neither → no calibration row; status = `Manual Calibration Required`.

I will **not** attempt to derive `pixels_per_mm` by matching dimension numbers to dimension lines in this pass. That's vector-geometry work and unreliable without it.

### 4. Text quantity extraction (Part 4) — real, regex-based
Per page, scan extracted text for explicit labelled quantities. Conservative patterns only — anything ambiguous is skipped:
- `Area Over Frame`, `Total Floor Area`, `Coverage Area`, `Cladding Area`, `Porch Area`, `Garage Area`, `Living Area` (followed by number + m² / sqm)
- `External Perimeter` / `Perimeter`
- `Roof Pitch` (e.g. `25°`, `25 deg`)
- `Stud Height` (e.g. `2.4m`, `2400mm`)
- `Garage Door` size (e.g. `4800 x 2100`)

Each match → `extracted_quantities` row with the schema's existing fields (`data_source = 'Uploaded Plan Text'` or `'Uploaded Specification Text'`, `source_evidence = "<PageType> page N — '<matched snippet>'"`, `plan_page_number`, `confidence_label`, `review_status='review_required'`).

Different concepts stay in separate rows — never merged.

### 5. Opening extraction (Part 8) — real, regex-based
Scan plan text for `WIDTH x HEIGHT` patterns (`1300 x 1500`, `4800 x 2100`) and bare door widths (`810`, `760`, `710`) **only when adjacent to a door/window keyword**. Anything else is skipped.
- Pattern matched near "GARAGE DOOR" → `opening_type = 'garage_door'`, confidence mid.
- Bare `810/760/710` near "DOOR" → `opening_type = 'internal_door'`, confidence low, `review_required`.
- `W x H` near window keyword → `opening_type = 'window'`, confidence low.
- Anything else → `unknown_opening`, low, `review_required`.

Writes to existing `opening_schedule` table.

### 6. IQ Core + module draft population (Parts 6, 7) — only from extracted text
- Per IQ Core row in the spec list, pick the highest-priority source available (Plan Text > Spec Text). If neither exists, the row is **not created** (no fabricated value). No `Measured From Plan` IQ Core rows in Phase A because there's no measured geometry yet.
- Module population (Framing/Linings/Cladding/Roofing/Plumbing) is driven from those same IQ Core values via `pushMeasurementToModule`-equivalent inserts, all with `review_status='review_required'`. No template allowances unless a real template config exists (none does today, so Electrical / template rows are **skipped** in Phase A — surfaced as "No template configured" in summary, not faked).

### 7. Validation engine (Part 9) — real
For each IQ Core concept that has more than one source (e.g. Plan Text + Spec Text), the existing `ValidationTab` already shows side-by-side. I'll extend it to compute Match (≤2%) / Minor (2–6%) / Review Required (>6% or conflicting types) and surface the badge. Different concepts are kept separate.

### 8. Audit (Part 12)
New `takeoff_runs` table (job_id, run_id, started_by, started_at, completed_at, status, summary_json) + audit rows in existing `module_audit_logs` / `plan_measurement_audit_logs` / `audit_logs` for:
`automatic_takeoff_started`, `working_plan_selected`, `scale_detected`, `auto_calibration_created`, `quantity_created`, `opening_created`, `module_item_created`, `automatic_takeoff_completed`, `automatic_takeoff_failed`.

### 9. Safety (Part 14)
- Hard rule in `runAutomaticTakeoff`: never write `approved_value`, never set `review_status='confirmed'`, never silently overwrite an existing row with a different `data_source`. Conflicts always go to `review_required`.
- No hardcoded job, address, or quantity values. The only literals are regex patterns and field labels from the spec.

## Phase B — explicitly deferred (NOT in this pass)

I'll surface these as "Not auto-detected — review on plan" rows in the summary, not as fake values:

- **Geometry-based extraction (Part 5)** — external perimeter, garage footprint, internal wall lines from vector linework or rendered images. This is real CV work and needs either `pdfjs` graphics-state walking or a raster pipeline neither of which I can implement honestly in one pass.
- **OCR-based dimension reading** — non-text PDFs (scans). Tesseract.js works in the browser but adds ~10 MB and 20–60 s per page; I'd want to discuss runtime trade-offs first.
- **Cross-validation of pixels_per_mm against dimension strings** — depends on geometry detection.
- **Window/door positions on the plan** — depends on geometry detection.
- **Cladding area opening deductions** — depends on opening positions.
- **Roof footprint from plan** — depends on geometry detection.

In the takeoff summary these will appear as "Not yet auto-detected — measure on plan" with a link to the existing `PlanCanvas` manual workflow, which already exists and continues to work unchanged.

## Files / schema

**New migration**
- `takeoff_runs` table (job_id, run_id, started_by, started_at, completed_at, status, working_file_id, working_page_number, working_page_type, classification_confidence, scale_text, calibration_id, summary jsonb) with RLS matching existing pattern.

**New code**
- `src/lib/takeoff/pdf-text.ts` — pdfjs page-text + page-size extraction.
- `src/lib/takeoff/classify.ts` — page classification.
- `src/lib/takeoff/scale.ts` — scale-text regex + calibration writer.
- `src/lib/takeoff/extract-quantities.ts` — labelled quantity regexes + writes to `extracted_quantities`.
- `src/lib/takeoff/extract-openings.ts` — opening regexes + writes to `opening_schedule`.
- `src/lib/takeoff/populate-modules.ts` — IQ Core + module draft population, conflict → `review_required`.
- `src/lib/takeoff/run.ts` — orchestrator with progress callbacks + audit + re-run safety.
- `src/components/jennian/AutomaticTakeoffDialog.tsx` — progress UI.
- `src/components/jennian/TakeoffSummary.tsx` — summary cards + Review buttons.

**Edited**
- `src/routes/jobs.$jobId.tsx` — `Run Automatic Takeoff` / `Re-run Automatic Takeoff` buttons + summary panel.
- `src/components/jennian/ValidationTab.tsx` — match/minor/review badge using existing `extracted_quantities` rows.

No changes to branding, sidebar, typography, layout, or existing manual workflows. `PlanCanvas`, `OpeningScheduleTab`, `PushToModuleDialog`, `JobAuditTimeline` all stay as-is.

## Acceptance against your 25 criteria

Met by Phase A: 1, 2, 3, 4, 5, 6, 10 (text-based candidates only), 11 (IQ Core from text), 12 (modules from IQ Core), 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25.

**Not met by Phase A** (deferred to Phase B): 7 (external perimeter measurement), 8 (internal wall measurement), 9 (area measurement). Each will show as "Not yet auto-detected — measure manually" in the summary, never as a fabricated row.

## Decision needed

Approve this Phase A scope as the first automatic-takeoff pass, or tell me to rescope (e.g. add Tesseract OCR, or only ship the workflow scaffolding and no extraction yet). I will not silently expand scope — if it's not in the approved plan, it doesn't ship.
