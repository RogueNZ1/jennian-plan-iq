# Pipeline Convergence — Investigation & Design

**Status:** design **LOCKED** (decisions ratified — see §8). No code, no branch yet. Resolves audit Critical **C1–C3** and Medium **M2**.
**Goal:** make the production path (`run.ts` → Supabase → `buildQSExportData` `.xlsx`) **produce and persist the same improved, honest `TakeoffData` as Pipeline B (`/upload`)** — including the confidence flags — so a real saved job matches the Beddis/Harrison ground-truth scorecard.

---

## 0. Executive summary

There are two parallel takeoff implementations. Pipeline B (`upload.tsx`) has all the session work but is **ephemeral** (in-memory `TakeoffData` + an ad-hoc `exportToExcel`). Pipeline A (`run.ts`) is the **persisted** path that the QS deliverable is built from, and it runs pre-session logic: it consumes only `floor_area_m2` + `perimeter_m` from geometry, **discards `vector_annotations`, does not pin the geometry page, and persists none of the improved fields or flags.**

**Recommendation: Architecture (B) — extract one shared `composeTakeoff` module** that both paths call, differing only in I/O (ephemeral vs persisted). One implementation cannot drift, so the divergence we just found becomes structurally impossible to recur. Pair it with a **canonical persisted `TakeoffData` JSON** as the QS source of record (lossless flag survival), while still writing the existing relational rows so the review UI keeps working. Ship in **6 independently-validatable slices**, proving Pipeline A in memory *before* touching the database.

---

## 1. The production path (Pipeline A) — what it computes, consumes, persists

### 1.1 `run.ts` flow
Text-only pipeline + a concept-mode geometry/AI tail:
`loadJobFiles → extractFile (pdf-text) → classifyPageWithType / pickWorkingPage → detectScaleFromText → extractQuantitiesFromFile + extractOpeningsFromFile + extractSpecRowsFromFile → populateModulesFromTakeoff`. In **concept mode** only, it additionally calls geometry + `recognisePlanFn` + `applyConceptAssumptions`.

### 1.2 What it consumes from geometry — **confirmed: floor + perimeter only**
`run.ts:537` → `measurePlanGeometry(fileData, fileName)` — **no page index** (C3: auto-detect, can measure the wrong sheet). It reads `m.floor_area_m2` and `m.perimeter_m` (lines 552–573) into `plan_measurements`. **`geoResult.vector_annotations` is fetched and discarded** — no garage/openings/schedule-datum/entrance.

### 1.3 What it persists (full set + shapes)

| Table | Writer | Key columns written | Notes |
|---|---|---|---|
| `extracted_quantities` | `persistQuantity` | `quantity_type`, `extracted_value` (num), `confidence`, `data_source`, `review_status` | text-regex quantities |
| `opening_schedule` | `persistOpening` | `opening_type`, `width_mm` (**NOT NULL**), `height_mm`?, `quantity`, `room_name`, `notes`, `confidence`, `source`, `plan_page_number`, `review_status` | all rows `review_required` |
| `module_items` | `populate-modules` | `module_id`, `label`, `extracted_value` (**text**), `unit`, `confidence`, `notes`, `value_source`, `source`, `run_id` | the QS-export source rows |
| `module_runs` | `populate-modules` | run bookkeeping | |
| `plan_measurements` | `run.ts` concept | `measurement_type` (floor_area/perimeter), `calculated_area_m2`/`_length_m`, `confidence`, `source="geometry_api"`, `plan_page_number` | **only** floor + perimeter |
| `jobs` | `run.ts` | `working_plan_file_id`, `working_plan_page_number`, `confidence_score`, `plan_context` (Json) | |
| `takeoff_runs` | `run.ts` | `summary` (Json = full `TakeoffSummary`), status, working-page meta | **already a JSON home**, but QS export never reads it |

### 1.4 `buildQSExportData` — what the persisted QS `.xlsx` actually reads
Reads `jobs(*)`, `module_items(*)`, `opening_schedule(*)`, `door_counts`. Maps:
- **Wall length** ← `getNum("external wall length")` from `module_items`.
- **Wall height** ← `module_items "wall height"/"stud height"` → `plan_context.studHeightMm` → **`2.4` default**.
- **Windows by room** ← `matchWindowOpening()` finds an `opening_schedule` window row by `room_name` keyword; height/width per row, **defaulting to 1.2 / 0.9 when null**.
- **Garage** ← `opening_schedule` `garage_door` rows (height/width, default 2.1 / 2.4).
- **Downpipes/heat pumps/extras** ← `module_items` label matches.

**Never reads:** `external_wall_area_m2`, `total_area_m2`, the vector garage width, the entrance, or **any flag/note as a confidence signal** (the `notes` columns exist but are not surfaced as honesty rails in the export).

---

## 2. Pipeline B (`upload.tsx`) — the improved seam

Order of operations (all on an in-memory `TakeoffData`):
1. **Page-pin (C3 fix):** `resolveGeometryPageIndex(selectedIndex, …)` → `measurePlanGeometry(plan, name, geometryPageIndex)`; `reconcileGeometryPage(...)` flags divergence.
2. **AI + geometry in parallel:** `extractConceptTakeoffs` (vision) + geometry (floor/perimeter/rooms/garage/alfresco/stud) merged; geometry wins measurement fields.
3. **Vector garage (Slice 1):** capture `visionGarageSize`, then `preferVectorGarage(merged, vector_annotations)`.
4. **Schedule + head-datum safeguard:** `extractWindowScheduleFn` → `safeguardScheduleHeights(schedule, vector)` (rejects heights read AS the datum → null + flag) → `aggregateWindows` → `applyWindowAggregate`.
5. **Vector openings (Slice 2):** `preferVectorOpenings` (W-code count + firmed widths).
6. **Entrance (Slice 3):** `preferVectorEntrance` (assert 2.1 height; fold only when width known) + `entranceAssumptionNote`.
7. **F-022:** `reconcileVectorVision(visionGarageSize, visionWindowCount, vector, visionEntranceWidthMm)` → flags appended to `notes`.
8. **Derived:** `computeOpeningAreaM2`, `computeExternalWallAreaM2`, `computeTotalAreaM2` (ext-wall stays *gated* on per-window heights — not recomputed when incomplete).
9. **Cross-ref:** elevations/site plan.
10. **Output:** rich `TakeoffData` (incl. `windows_by_room` with entrance folded, `external_wall_area_m2`, `total_area_m2`, `garage_door_size` string, all flags in `notes`) → **state only** → `exportToExcel()` writes its own `.xlsx` (cells D14/D21 etc.). **No DB write.**

---

## 3. The gap — field by field

| Field (Pipeline B) | In persisted A today? | Needs new persisted field? | `buildQSExportData` change? | Schema change? |
|---|---|---|---|---|
| Floor area (page-pinned) | partial — value yes, **page unpinned (C3)** | no | no | no |
| Perimeter / ext-wall lm | yes (geometry) | no | no | no |
| **Vector garage width** (4800; F-022 agree/flag) | ❌ vision only | yes | prefer persisted vector width | reuse `opening_schedule` |
| **Window count** (vector W-codes) | ❌ text/vision | yes | already counts rows | no |
| **Window heights + head-datum safeguard** (null + flag) | ❌ | yes (+ flag) | read null honestly, not 1.2 default | `opening_schedule.notes`/confidence |
| **Entrance door** (2.1 asserted; width vector-or-unresolved) | ❌ absent | yes | new mapping | ⚠️ `opening_schedule.width_mm` is **NOT NULL** — unresolved width has no home (see §5) |
| **External wall AREA** (derived, gated) | ❌ not computed | yes | new read | `module_items` row OR JSON |
| **Total area** (derived) | ❌ | yes | new read | `module_items` row OR JSON |
| **All confidence flags/notes** (ext-wall incomplete, entrance unresolved, F-022 disagreement, page divergence) | ❌ **die ephemerally (M2)** | yes | surface in export | needs a flag home that the export reads |

---

## 4. Architecture recommendation — **(B) shared module**, with a JSON source of record

### Option (A) — upgrade `run.ts` in place
Make `run.ts` consume `vector_annotations`, run the same prefer/reconcile/derive/entrance/flag seam, pin the page, persist richer output.
- **Pro:** smaller blast radius; no refactor of `upload.tsx`.
- **Con (fatal):** it **re-implements** the Pipeline B seam in a second place. The exact divergence the audit found is guaranteed to recur the next time either path changes. Solves the symptom, not the cause.

### Option (B) — extract ONE shared takeoff module ✅ recommended
Pull the pure compute seam into `src/lib/takeoff/compose-takeoff.ts`:

```
composeTakeoff(input: {
  visionTakeoff, geometry (incl. vector_annotations), schedule, planContext, geometryPageIndex
}) → { takeoff: TakeoffData, reconciliation, flags: string[], diagnostics }
```

Both callers invoke it; they differ **only in I/O**:
- `upload.tsx` → render + `exportToExcel` (ephemeral), handles toasts.
- `run.ts` → persist (relational rows + canonical JSON), QS export reads it.

**Feasibility — confirmed extractable (not assumed):** the seam is already a chain of near-pure module functions (`preferVectorGarage/Openings/Entrance`, `safeguardScheduleHeights`, `aggregateWindows`, `reconcileVectorVision`, `compute*`) operating on `TakeoffData` + `vector_annotations`. The only impure inputs are the AI calls (`extractConceptTakeoffs`, `extractWindowScheduleFn`, `recognisePlanFn`) and the geometry fetch — and **`run.ts` already calls `recognisePlanFn` and `measurePlanGeometry` server-side**, so the same calls work there. The one discipline required: `composeTakeoff` must be **pure compute** — no `setState`/`toast`. UI side-effects stay in `upload.tsx`; persistence stays in `run.ts`.

**Why (B):** durable — one implementation can't drift. It is the long-stated "single detailed flow" intent, and it makes C1 structurally non-recurring rather than patched.

### Source of record for QS — canonical `TakeoffData` JSON  *(LOCKED)*
Persist the whole composed `TakeoffData` (with provenance/flags intact) as a **canonical JSON** in a **dedicated nullable column `takeoff_runs.takeoff_json`** — **not** overloaded into the existing `summary` column (summary stays the run-status object; the takeoff of record gets its own typed home). `buildQSExportData` reads `takeoff_json` **additively** as the primary source for the new fields + flags, falling back to relational rows when it is null (old jobs). Still write the relational rows (`opening_schedule`/`module_items`) so the **review UI and existing QS mappings keep working**. This guarantees **lossless flag survival (M2)** — flags ride in the JSON, not scattered/lost across `notes` columns.

### Enriched `TakeoffData` shape — per-field provenance  *(LOCKED)*
`TakeoffData` moves from bare scalars to a **structured per-QS-field record**, not a bare number:

```ts
type FieldValue<T> = {
  value: T | null;
  source: "geometry" | "vector" | "vision" | "schedule" | "derived" | "asserted" | "manual";
  confidence: "high" | "mid" | "low" | null;
  discrepancy_flags: string[];   // honesty rails for THIS field (e.g. "ext-wall incomplete: 8/13 heights unresolved")
};
```

One shape serves three needs at once: **flag survival (M2)** (flags travel with the value into the persisted JSON and the export), the **audit trail** (every value carries where it came from and how sure we are), and a **future consistency layer** (cross-checks read provenance to know which paths to compare). This is the decision that must land **now**, because it defines `composeTakeoff`'s return type and the `takeoff_json` schema in later slices — building against the bare-number shape would follow a stale spec.

### `composeTakeoff` reconciliation stage  *(LOCKED)*
`composeTakeoff` gains an explicit **reconciliation stage that runs after extraction**, producing the `discrepancy_flags` on each `FieldValue` plus a run-level flag list. It is **seeded with the checks we already have** — the geometry 190% scale-mismatch sanity check and F-022 (vector-vs-vision garage width / window count / entrance width) — and is **built to grow**: adding a check means adding a function to this stage, not threading new logic through the seam. This is the structural home for everything in the future-phase below.

### FUTURE phase (design-only, do NOT build now) — Consistency / Plausibility Engine
A later, documented phase extends the reconciliation stage with **cross-derivation checks** that catch internally-inconsistent plans:
- floor area computed **two ways** — geometry outline vs summed room dimensions — must agree;
- summed opening widths on a wall **≤** that wall's length;
- window-schedule count/sizes vs floor-plan W-code callouts;
- room dimensions vs the building footprint (outlier detection).

**PRINCIPLE — detect-and-FLAG only, never silently auto-correct a plan number.** The tool surfaces inconsistencies for human review; it does **not** decide which number is the drafter's error. Auto-correction is explicitly out of scope — a flag is the deliverable, not a "fix." **Design only — not in this convergence build.**

---

## 5. The hard parts (where the risk lives)

1. **Schema / persistence (highest risk).**
   - **`opening_schedule.width_mm` is NOT NULL — and stays that way (LOCKED).** An unresolved-width entrance (Beddis) has no valid relational row. **Decision: carry unknown-width openings in the canonical `takeoff_json` ONLY and skip the `opening_schedule` row when the width is unknown** — do **not** weaken the constraint to nullable. The entrance is fully represented (value `null`, source `asserted`/`unresolved`, flag) in the JSON of record; the relational schema is left untouched.
   - Migrations must be **additive & non-breaking**: new nullable columns / new JSON column only; **existing saved jobs must still open** (every new read must null-coalesce). No column renames, no type narrowing, no backfill required for correctness.

2. **Flag survival (M2).** The honesty rails MUST reach a reviewer opening a *saved* job. Design: flags live in `TakeoffData.notes` (already how Pipeline B carries them) → persisted verbatim in the canonical JSON → `buildQSExportData` emits them into a dedicated **"Confidence / review notes"** block in the `.xlsx` and the review UI renders them. Acceptance: "external_wall_area incomplete", "entrance width unresolved", and any F-022 disagreement are **visible in the persisted deliverable**, not just the live demo.

3. **Page-pin (C3).** `run.ts` must compute `geometryPageIndex` from the AI/classified floor-plan page and pass it to `measurePlanGeometry` (it auto-detects today). Fold the `reconcileGeometryPage` divergence flag in too. Small, isolated, high-value.

4. **Don't break live jobs.** Additive only. The relational write path stays; the JSON + new reads are layered on with fallback. Old jobs (no JSON) render exactly as today.

---

## 6. Proposed sliced build plan

Each slice is independently validatable and safe on its own; the DB is touched only after Pipeline A is proven in memory. **Concept-first** (§8) — the slices below target concept mode end-to-end, then extend to all modes (an explicit later step, not optional — see §8).

- **Slice 1 — Extract `composeTakeoff` as a PURE refactor (no behaviour change, CURRENT shape).** Move the `upload.tsx` seam into the shared pure module returning the **existing bare `TakeoffData` shape** — *no* enrichment yet. `upload.tsx` calls it. **Proof (the safety gate):** full offline suite + both live baselines (Beddis/Harrison) **byte-identical** — this is the proof that extraction changed zero behaviour. Keeping Slice 1 pure is deliberate: it isolates "did the refactor move logic safely" from "did the new shape change anything."
- **Slice 2 — Enrich `TakeoffData` to the `FieldValue` shape (value + source + confidence + discrepancy_flags).** Additive, behind the shared module; route the existing flags/provenance into the new per-field records; reconciliation stage emits `discrepancy_flags`. Still in memory, both paths. **Proof:** baselines green with the enriched shape; flags now attached per-field rather than only in `notes`.
- **Slice 3 — `run.ts` calls `composeTakeoff` IN MEMORY (concept mode), page-pinned (C3).** No persistence yet — log the composed enriched `TakeoffData` and diff vs the scorecard. **Proof:** Pipeline A produces the *same* `TakeoffData` as Pipeline B for Beddis/Harrison.
- **Slice 4 — Additive schema migration.** Dedicated nullable `takeoff_runs.takeoff_json` home (no `opening_schedule.width_mm` constraint change). **Proof:** migration applies; existing jobs still open; round-trip JSON test.
- **Slice 5 — Persistence adapter.** Write composed output to relational tables (windows → `opening_schedule`; derived scalars → `module_items`; unknown-width entrance → JSON only) **and** the canonical `takeoff_json`. **Proof:** a run persists; rows + JSON match the in-memory object.
- **Slice 6 — `buildQSExportData` reads new fields + surfaces flags.** Primary = `takeoff_json`, fallback = relational. Add the confidence-notes block to the `.xlsx` and review UI. `exportToExcel` is **kept** (§8). **Proof:** export unit tests incl. flag presence.
- **Slice 7 — End-to-end validation (concept).** Real concept job through `run.ts` → persisted → official QS export. **Proof = DoD below.**
- **Slice 8 — Extend to all modes.** Bring the remaining modes onto `composeTakeoff` so no mode runs the old seam. Required, not optional (§8).

---

## 7. Definition of done (eventual build) / validation target

A real job run through the **production** path (`run.ts`), **persisted**, then opened via the official QS export (`buildQSExportData` `.xlsx`), **matches the Beddis/Harrison ground-truth scorecard — the same numbers Pipeline B gets — with the confidence flags present in the saved deliverable** (ext-wall incomplete, entrance width unresolved, F-022 disagreements). At that point the two QS exporters are reconciled: `upload.tsx`'s `exportToExcel` is **kept** (§8) and points at the same composed output, so both entry points emit the same numbers and flags. Convergence then extends to all modes (Slice 8) so no mode runs the old seam.

---

## 8. Locked decisions (ratified)

1. **JSON home:** `takeoff_runs` — a **dedicated nullable `takeoff_json` column**, not overloaded into `summary`. Keeps per-run history; `summary` stays the run-status object.
2. **Unknown-width entrance:** **JSON only.** Keep `opening_schedule.width_mm` **NOT NULL** — do not weaken the constraint. The entrance is fully represented in `takeoff_json`; no relational row when width is unknown.
3. **`exportToExcel`:** **KEEP.** Not retired now or later. After convergence it points at the same composed output, but the export entry point stays.
4. **Modes:** **concept-first** to prove end-to-end (Slices 1–7), **then extend to all modes** (Slice 8). Explicitly: **"concept converged, other modes still old" is NOT an acceptable final state** — it would re-create divergence by mode, the exact failure we are removing. Slice 8 is required, not optional.

### Architecture decisions also locked (detail in §4)
5. **Enriched `TakeoffData`:** per-QS-field `{ value, source, confidence, discrepancy_flags }` — not a bare number. Defines `composeTakeoff`'s return type and the `takeoff_json` schema, so it is locked **before** building.
6. **`composeTakeoff` reconciliation stage:** explicit post-extraction stage, seeded with the 190% scale check + F-022, built to grow.
7. **Consistency / Plausibility Engine:** documented FUTURE phase, **detect-and-flag only, never auto-correct.** Design only — not in this build.
