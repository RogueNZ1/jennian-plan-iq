# Jennian IQ Engine Audit

Date: 2026-06-14 NZT
Status: architecture cleanup first; no runtime logic changed in this pass

## Executive Summary

Jennian IQ already has some strong pieces: geometry measurement, vector annotations, AI concept extraction, schedule reading, deterministic door logic, enriched `takeoff_json`, and QS export. The problem is that these pieces are not yet governed by one enforced evidence contract. The app can still produce different answers depending on whether the user came through the upload wizard, automatic takeoff, vision takeoff, relational fallbacks, or QS export.

The architecture target is simple:

1. Every extraction pass emits evidence and candidates, not final truth.
2. One reconciliation engine decides the current value, confidence, and review state.
3. `takeoff_runs.takeoff_json` is the canonical source of record.
4. Relational rows and export sheets are projections of that record, not competing truth.
5. Disagreements continue the run, but they are carried forward as material review flags.

This is how IQ becomes QS-grade: not by pretending the engine is always right, and not by blindly trusting the printed plan, but by proving why each value was selected.

## Current Entry Points

| Path | Role today | Risk |
| --- | --- | --- |
| `src/lib/takeoff/run.ts` | Automatic saved-job pipeline. Reads uploaded files, classifies pages, extracts text quantities/openings/specs, populates module rows, then for concept jobs runs geometry plus concept AI and persists `takeoff_json`. | Closest to production canonical path, but still writes old relational rows and can continue with a missing or poisoned canonical result. |
| `src/routes/upload.tsx` | Interactive upload wizard. Runs page analysis, geometry, concept AI, schedule extraction, compose, direct XLSX export, and optional save/run. | Large mixed UI/orchestration/export path. It can use in-memory takeoff state or persist a job, so it remains a second pipeline surface. |
| `src/lib/takeoff/vision.functions.ts` | Vision Takeoff server function. Sends rendered pages to a model and writes `extracted_quantities`, `opening_schedule`, `plan_measurements`, `module_items`, and a `takeoff_runs` summary. | Parallel legacy-style writer. It does not emit the canonical enriched takeoff as its primary output. |
| `src/lib/takeoff/compose-takeoff.ts` | Shared pure seam combining AI, geometry, schedules, vector annotations, and door engine into `EnrichedTakeoff`. | Right idea, but it currently makes some hard-coded source choices, including blind geometry overrides. |
| `src/lib/iq-qs-export.ts` | Builds QS export data. Reads relational rows, then overlays latest usable `takeoff_json` where present. | Export can silently fall back to relational data, so a failed canonical run may be hidden unless surfaced as a blocking review condition. |

## Source Of Truth

The desired source of truth is:

`takeoff_runs.takeoff_json` = canonical enriched takeoff, including values, sources, confidence, discrepancy flags, flat openings, and review state.

Secondary stores should be treated as projections:

- `module_items`: review UI rows and legacy module values.
- `opening_schedule`: estimator-entered or legacy opening rows.
- `extracted_quantities`: text/OCR quantity evidence.
- `plan_measurements`: measurement evidence and diagnostics.
- `takeoff_runs.summary`: run log, not final pricing truth.

The current system partly follows this through `loadEnrichedTakeoffJson()` and `applyEnrichedTakeoff()`, but the fallback is still too permissive for QS-grade output.

## Live Benchmark Evidence

Two full live baselines were run against the local geometry API.

| Job | What worked | What failed |
| --- | --- | --- |
| Beddis | Floor area `165.4` matched QS. Perimeter `63.8` matched QS. Window count `13` matched QS. Garage door vector read was good. | Total area missed alfresco `1.7`. Total opening area was about `16.97` vs QS `43.92`. Glazed area was low by the same order. External wall area was about `136.15` vs QS `109.2`. Internal door count was `10` vs QS `13`. |
| Harrison | Vision/concept area saw the correct area around `170.8`. Perimeter `60.4` matched QS. Window/vector count found `14`. Garage door vector read was good. | Geometry/OCR misread `60.4` perimeter as floor area; compose then persisted floor area `60.4` instead of QS `170.79`. Opening area was about `6.96` vs QS `46.89`. External wall area was about `133.59` vs QS `98.07`. Window-by-room export collapsed badly. Internal doors were `9` vs QS `7`. |

The Harrison floor-area issue is the clearest architecture failure: the engine had a better candidate from vision, but a later source-selection rule overwrote it with a bad geometry/OCR value. That must become impossible.

## Dangerous Or Legacy Overlap

These are the cleanup targets before another narrow accuracy patch:

1. `composeTakeoff()` currently says geometry overrides AI for measurement fields. That is not QS-grade. Geometry, printed summary, OCR, and vision must become competing candidates with confidence and materiality rules.
2. The geometry API can return a reconciled scalar even when its notes say there is a huge mismatch. The app must consume the notes/confidence before allowing that value to win.
3. `/upload` still contains wizard state, direct export logic, persistence logic, concept orchestration, and UI in one file. It should call the same canonical engine used by saved jobs.
4. `vision.functions.ts` writes relational rows directly and only adds a summary `takeoff_runs` row. It needs to become either a candidate-producing pass inside the canonical engine or a quarantined legacy feature.
5. QS export still has a relational fallback. Useful for old jobs, dangerous for new jobs unless the workbook clearly says the canonical record is missing or stale.
6. Opening area is not yet evidence-complete. Null schedule heights, collapsed room slots, and missing external door/slider typing can produce confident-looking but materially wrong external wall area.
7. Tests still include some assertions about current implementation choices rather than QS-grade outcomes. Harrison expecting one reconciliation flag when two real disagreements exist is a stale test smell.
8. Builder-specific assumptions are still mostly Jennian-shaped. Multi-company plans need profiles, not scattered conditional logic.

## Canonical Architecture

The target engine should be built as a pipeline of evidence passes followed by one decision stage:

1. Intake and document classification
   Identify builder, revision, sheet type, scale, page role, and whether a sheet is plan, dimensions, schedule, elevation, spec, or site plan.

2. Builder profile
   Load a profile for dimension convention, title-block patterns, schedule formats, standard heights, terminology, QS export mapping, and allowed defaults. Jennian becomes one profile, not the whole engine.

3. Evidence extraction passes
   Vector annotations, geometry measurement, OCR/title-block reading, AI vision extraction, schedule extraction, deterministic doors, elevations, site plan, and specs all emit candidates with evidence.

4. Candidate ledger
   A value like floor area is stored as multiple candidates:
   `170.8 from printed/vision`, `60.4 from OCR`, `175.37 from geometry measurement`, each with source, page, evidence text, confidence, and warnings.

5. Reconciliation engine
   One pure decision layer selects the current value, carries rejected alternatives, and marks review severity. It does not hide disagreement.

6. Canonical takeoff
   The selected values and evidence ledger are persisted in `takeoff_runs.takeoff_json`.

7. Projections
   Review UI, module rows, opening schedule rows, and QS XLSX are generated from the canonical takeoff. They do not re-decide quantities.

8. Export gate
   A QS export can proceed with warnings for minor issues, but critical unresolved fields must be visible and explicit: floor area, perimeter, total opening area, external wall area, garage doors, internal doors, and cladding/stud assumptions.

## Reconciliation Rules

The engine must not use one blanket rule like "printed always wins" or "geometry always wins".

Recommended precedence:

- If two independent high-confidence sources agree within tolerance, accept and mark high confidence.
- If printed summary and measured geometry materially disagree, continue the run but flag it. Pick the value whose evidence is stronger for that field.
- If geometry notes show a mismatch, geometry cannot blindly override another source.
- If a schedule gives window dimensions, it is the opening dimension authority, but floor-plan symbols still supply missing sliders, garage doors, entrance doors, and room placement.
- If a height or width is assumed, the area can still be calculated, but the field must carry the assumption flag.
- If QS truth later disagrees with a plan cue, keep both: QS is the pricing truth; plan cue is evidence that may need human review.

Example of the level required: a plan may print `172.5 m2`, but measured closed polygon geometry and room schedules support `174.5 m2`. IQ should not crash or silently choose one. It should report `174.5 m2 selected from measured geometry`, carry `172.5 m2 printed on title block` as a material discrepancy, and ask the QS to confirm whether the drafter typo or the measurement is wrong.

Similar real-world example: a floor plan may show `60.4` beside "External Perimeter", while OCR/AI incorrectly labels that as floor area. The correct response is not to persist floor area `60.4`; it is to keep `60.4` as a perimeter candidate, reject it as a floor-area candidate, and flag the extraction mismatch.

## Multi-Company Strategy

Different companies must plug into the same evidence model.

Create builder profiles with:

- Builder identification signals from title blocks and logos.
- Dimension convention, such as NZ `height x width` joinery labels.
- Schedule parsing rules and expected columns.
- Default stud heights and when defaults are allowed.
- Sheet naming patterns and revision semantics.
- Garage/door/window product naming.
- QS export mapping.

Jennian should be the first profile. Other builders should be onboarded by adding fixtures and profile rules, not by branching the core engine.

## Scorecard Gates

Before claiming another accuracy fix, run the engine against permanent fixtures:

- Beddis
- Harrison
- Young
- 15A / Russell
- O'Neil
- At least one non-Jennian plan set

Required scorecard fields:

- Floor area
- Total area including alfresco
- External perimeter
- Stud height
- Flat opening list count
- Total opening area
- Glazed area
- External wall area
- Garage door sizes/counts
- Internal door breakdown
- Window/opening placement by room
- QS export cells for the above fields

Tests should report deltas against QS truth and fail on regressions. They should also assert that material discrepancies are flagged, not that the current number of flags is frozen forever.

## Cleanup Plan

Phase 0: protect the current state

- Decide what to do with the existing unrelated lint edits in the working tree.
- Keep benchmark JSON outputs available locally, but do not treat generated render files as source truth.

Phase 1: lock the canonical boundary

- Introduce an explicit engine entry point used by both `run.ts` and `/upload`.
- Make `takeoff_json` the required output for new concept takeoffs.
- Add a visible export warning when a new job falls back to relational rows.

Phase 2: replace blind source selection

- Convert floor area, perimeter, alfresco, stud height, garage area, and opening totals into candidate-led decisions.
- Block geometry overrides when geometry confidence notes contradict the selected field.
- Fix the Harrison `60.4` floor-area poisoning case first.

Phase 3: rebuild openings as first-class evidence

- Use a flat opening ledger as canonical.
- Preserve sliders, garage windows, sectional doors, PA doors, entrance doors, and room labels.
- Allow assumptions with flags instead of zero-area phantom openings.
- Derive total opening area, glazed area, and external wall area from the same ledger.

Phase 4: quarantine legacy writers

- Move `vision.functions.ts` behind the canonical candidate interface or mark it legacy-only.
- Remove direct wizard XLSX export as a separate truth path, or make it call the same export adapter as saved jobs.
- Stop projections from re-deciding values.

Phase 5: builder profiles

- Extract Jennian assumptions into a profile.
- Add a non-Jennian fixture before broadening hosted support.
- Require profile detection to be visible in the review UI and export notes.

## Immediate Recommendation

Do not keep patching single symptoms. The next engineering move should be Phase 1 plus the first part of Phase 2:

1. Create the canonical engine entry point.
2. Route `/upload` and `run.ts` through it.
3. Change floor-area reconciliation so Harrison cannot persist `60.4` as floor area when better evidence exists.
4. Add a scorecard test that proves Beddis and Harrison both still run end to end.

That gives us a clean spine. Then we can attack openings and multi-company support without breaking the rest of the tool every time we improve one pass.
