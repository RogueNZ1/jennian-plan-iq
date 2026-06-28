# Opening/window evidence recovery triage - 2026-06-29

## Slice

Slice 2H - Opening/window evidence recovery triage.

Mode: read-only triage first. No detector tuning, pricing work, correction UI, overlay changes, AI prompt work, or legacy source promotion was performed.

Environment checked: local scripts against the live Supabase database.

## Decision

Result: **PASS WITH WARNINGS - report/design only, no code change recommended in this slice.**

The dominant missing/conflict class is not a single safe extraction bug. It is conservative ledger behaviour around openings that have partial evidence:

- floor-plan gap rows commonly provide a width and page/bbox, but no clean height witness;
- held/quarantined opening rows often have dimension text but remain excluded because the evidence is assumed, conflicted, or upstream marked as not clean;
- visual rows can carry dimensions, but they are still needs_review or missing_evidence and usually have no persisted bbox;
- JM-0060 remains unanchored because its active run predates the 2F-D bbox projection work.

Because these classes are uncertainty classes, not clean missing plumbing, the next safe move is not detector tuning. The next useful work should be a deliberate design or narrow source-specific rule, with tests, after deciding which witness class is allowed to graduate from review/missing to clean.

## Jobs inspected

### JM-0005 / Beddis

- Job id: `6f502da2-7eac-4b84-bc27-539f772a90fe`
- Active run id: `712c53a1-4e4b-4ede-ba5e-11eccef0e9e6`
- Authority source: `persisted_current_run`
- Ledger rows: 71
- Unsuperseded ledger run ids: `712c53a1-4e4b-4ede-ba5e-11eccef0e9e6`
- Bbox rows: 43
- Unmarked rows: 28
- Clean totals: count 20, length 63800 mm, area 0 m2

Status counts:

| Status | Count |
| --- | ---: |
| extracted | 4 |
| missing_evidence | 47 |
| needs_review | 12 |
| conflict | 8 |

Category/status matrix:

| Category/status | Count |
| --- | ---: |
| exterior_perimeter / extracted | 1 |
| interior_door / extracted | 3 |
| opening / missing_evidence | 43 |
| window / conflict | 8 |
| window / needs_review | 9 |
| window / missing_evidence | 2 |
| exterior_door / needs_review | 2 |
| exterior_door / missing_evidence | 1 |
| garage_door / needs_review | 1 |
| garage_door / missing_evidence | 1 |

Top warnings:

| Warning | Count |
| --- | ---: |
| area_not_calculated | 67 |
| height_not_extracted | 47 |
| source_conflict | 25 |
| assumed_height_rejected | 3 |
| width_not_extracted | 3 |

Bbox coverage:

| Category/status/bbox | Count |
| --- | ---: |
| opening / missing_evidence / with_bbox | 43 |
| all other rows / no_bbox | 28 |

Source coverage:

| Source class | Count |
| --- | ---: |
| floor_gap via vector_geometry | 43 |
| visual_detection | 13 |
| floorplan_symbol | 8 |
| vector_geometry | 4 |
| pdf_text | 3 |

Dominant cause classes:

| Cause | Count |
| --- | ---: |
| area_not_calculated | 67 |
| no_height_witness | 50 |
| visual_anchor_present | 43 |
| floor_gap_only_evidence | 43 |
| no_visual_anchor | 28 |
| source_conflict | 25 |
| visual_detection_without_authority_dimensions | 13 |
| no_schedule_or_text_witness | 5 |
| assumed_height_quarantined | 3 |
| no_width_witness | 3 |

Notes:

- The 43 floor-gap rows are visually anchorable, but remain `missing_evidence` because height is unknown.
- Three assumed-height rows stayed `needs_review`, with `heightMm` null and `areaM2` null.
- Exterior perimeter and interior doors remain clean extracted rows despite opening uncertainty.

### JM-0060

- Job id: `2d10ae44-f65a-4047-8d84-20bd345f84a1`
- Active run id: `4ba50d23-5764-41e4-bda5-0fdace588a6c`
- Authority source: `persisted_current_run`
- Ledger rows: 67
- Unsuperseded ledger run ids: `4ba50d23-5764-41e4-bda5-0fdace588a6c`
- Bbox rows: 0
- Unmarked rows: 67
- Clean totals: count 21, length 89100 mm, area 0 m2

Status counts:

| Status | Count |
| --- | ---: |
| extracted | 4 |
| missing_evidence | 30 |
| needs_review | 18 |
| conflict | 15 |

Category/status matrix:

| Category/status | Count |
| --- | ---: |
| exterior_perimeter / extracted | 1 |
| interior_door / extracted | 3 |
| opening / missing_evidence | 25 |
| window / conflict | 15 |
| window / needs_review | 15 |
| window / missing_evidence | 3 |
| exterior_door / needs_review | 2 |
| exterior_door / missing_evidence | 1 |
| garage_door / needs_review | 1 |
| garage_door / missing_evidence | 1 |

Top warnings:

| Warning | Count |
| --- | ---: |
| area_not_calculated | 63 |
| height_not_extracted | 30 |
| source_conflict | 28 |
| width_not_extracted | 6 |
| assumed_height_rejected | 3 |

Bbox coverage:

| Category/status/bbox | Count |
| --- | ---: |
| all rows / no_bbox | 67 |

Source coverage:

| Source class | Count |
| --- | ---: |
| floor_gap via vector_geometry | 24 |
| visual_detection | 20 |
| floorplan_symbol | 16 |
| vector_geometry | 4 |
| pdf_text | 3 |

Dominant cause classes:

| Cause | Count |
| --- | ---: |
| no_visual_anchor | 67 |
| area_not_calculated | 63 |
| no_height_witness | 33 |
| source_conflict | 28 |
| floor_gap_only_evidence | 24 |
| visual_detection_without_authority_dimensions | 20 |
| no_width_witness | 6 |
| no_schedule_or_text_witness | 4 |
| assumed_height_quarantined | 3 |

Notes:

- JM-0060 is structurally consistent with the ledger doctrine, but its active rows predate the bbox-enriched source projection.
- This is not evidence that overlay is broken; it is a stale-active-run coverage limitation.
- Unknown dimensions remain null. Assumed-height rows remain `needs_review`, `heightMm` null, `areaM2` null, with `assumed_height_rejected`.

### JM-CODEX / Fenner live regression

- Job id: `ced8ec8e-51b2-4da8-b191-506477d31bb8`
- Active run id: `50f98928-b065-49b8-b4b1-045a6372e0c5`
- Authority source: `persisted_current_run`
- Ledger rows: 65
- Unsuperseded ledger run ids: `50f98928-b065-49b8-b4b1-045a6372e0c5`
- Bbox rows: 24
- Unmarked rows: 41
- Clean totals: count 21, length 89100 mm, area 0 m2

Status counts:

| Status | Count |
| --- | ---: |
| extracted | 4 |
| missing_evidence | 29 |
| needs_review | 17 |
| conflict | 15 |

Category/status matrix:

| Category/status | Count |
| --- | ---: |
| exterior_perimeter / extracted | 1 |
| interior_door / extracted | 3 |
| opening / missing_evidence | 25 |
| window / conflict | 15 |
| window / needs_review | 14 |
| window / missing_evidence | 2 |
| exterior_door / needs_review | 2 |
| exterior_door / missing_evidence | 1 |
| garage_door / needs_review | 1 |
| garage_door / missing_evidence | 1 |

Top warnings:

| Warning | Count |
| --- | ---: |
| area_not_calculated | 61 |
| height_not_extracted | 29 |
| source_conflict | 28 |
| width_not_extracted | 4 |
| assumed_height_rejected | 3 |

Bbox coverage:

| Category/status/bbox | Count |
| --- | ---: |
| opening / missing_evidence / with_bbox | 24 |
| opening / missing_evidence / no_bbox | 1 |
| all non-opening rows / no_bbox | 40 |

Source coverage:

| Source class | Count |
| --- | ---: |
| floor_gap via vector_geometry | 24 |
| visual_detection | 18 |
| floorplan_symbol | 16 |
| vector_geometry | 4 |
| pdf_text | 3 |

Dominant cause classes:

| Cause | Count |
| --- | ---: |
| area_not_calculated | 61 |
| no_visual_anchor | 41 |
| no_height_witness | 32 |
| source_conflict | 28 |
| visual_anchor_present | 24 |
| floor_gap_only_evidence | 24 |
| visual_detection_without_authority_dimensions | 18 |
| no_width_witness | 4 |
| no_schedule_or_text_witness | 4 |
| assumed_height_quarantined | 3 |

Notes:

- This is the strongest current proof that floor-gap bbox projection persists into the active ledger on a fresh deployed/live run.
- The anchored rows remain `missing_evidence`; bbox presence did not promote dimensions, statuses, or totals.

### JM-0059 / Fenner old job

- Job id: `425f41b9-010a-47e5-8e46-34b7eefb4d2d`
- Active run id: `807a52fb-10e1-463a-84b9-73d38dcdf8cb`
- Authority source observed in app resolution terms: `takeoff_json_fallback_or_no_persisted_rows`
- Persisted active ledger rows: 0

This job was not useful for persisted-ledger class triage because no active `extracted_quantity_rows` were present for the current run.

### JM-0058 / old AI run

- Job id: `48c10d37-5961-431a-9c5a-9b4c36a9b3ca`
- Active run id: `46000acd-360d-4591-87cd-89d2c40740cb`
- Authority source observed in app resolution terms: `takeoff_json_fallback_or_no_persisted_rows`
- Persisted active ledger rows: 0

This job was not useful for persisted-ledger class triage because no active `extracted_quantity_rows` were present for the current run.

## Local fresh-run anchor reference

The Slice 2F-D.1 local fresh-run validation remains a useful reference:

| Run | Ledger rows | Runtime anchors | Unmarked rows | Anchor status/category |
| --- | ---: | ---: | ---: | --- |
| Beddis page 3 | 29 | 10 | 19 | opening / missing_evidence |
| Harrison page 5 | 9 | 8 | 1 | opening / missing_evidence |
| O'Neil page 1 | 38 | 26 | 12 | opening / missing_evidence |
| 15A page 1 | 55 | 40 | 15 | opening / missing_evidence |

These runs support the same finding as the live triage: the first safe bbox-producing source is floor-gap evidence, and its anchors usually mark review/missing rows rather than clean extracted openings.

## Cause classification

### No dimension witness

Seen as `width_not_extracted`, `height_not_extracted`, and `area_not_calculated`.

Dominant class:

- floor-gap rows often know width only;
- visual rows can see an object or printed label but are not yet clean authority;
- area remains null unless the row is `status === "extracted"`.

### No height witness

This is the largest recurring missing-evidence cause.

- Beddis: 50 rows
- JM-0060: 33 rows
- JM-CODEX Fenner: 32 rows

This should not be fixed by assuming standard heights. The ledger already rejects that by nulling height/area and keeping the row under review.

### No width witness

Less common, but still present:

- Beddis: 3 rows
- JM-0060: 6 rows
- JM-CODEX Fenner: 4 rows

These are mostly visual/drafting issue rows and should stay unresolved unless another witness is added.

### No visual anchor

This splits into two cases:

- JM-0060 has 0 bbox rows because the active authority predates 2F-D.
- Fresh or rerun jobs can persist floor-gap bbox rows, but visual/text/held rows still mostly lack bbox.

This is a coverage issue, not a reason to make legacy visual sources active.

### Source conflict

Commonly appears on held/quarantined windows and ambiguous floor-gap rows.

- Beddis: 25 rows
- JM-0060: 28 rows
- JM-CODEX Fenner: 28 rows

This is not a safe class to auto-promote without a stricter cross-witness rule.

### Legacy evidence quarantined

No legacy `visual_opening_audit`, `opening_schedule`, `door_hits`, or correction-memory source was used as active authority in this triage.

### Floor-gap-only evidence

This is now the dominant active bbox source:

- Beddis: 43 rows
- JM-0060: 24 rows, but no bbox on its stale active run
- JM-CODEX Fenner: 24 rows

Floor-gap-only evidence is useful for visual context and correction workflow design, but it is not enough to create clean opening area because height remains unknown.

## Safety checks

- Unknown dimensions remained null.
- Assumed heights remained `needs_review`, with `heightMm` null, `areaM2` null, and `assumed_height_rejected`.
- Bbox evidence did not change status, dimensions, totals, or clean area.
- Clean totals came only from `status === "extracted"`.
- Exterior perimeter and interior doors survived opening uncertainty.
- Only the active persisted run was inspected per job where persisted rows existed.

## Recommended next action

Proceed with **B: report/design, no code change in Slice 2H**.

Recommended next design slice:

1. Define a safe witness-pair rule for openings/windows, if any, before promotion.
2. Keep floor-gap rows visible and anchorable as review context.
3. Do not infer height from defaults.
4. Do not reactivate legacy `visual_opening_audit`, `opening_schedule`, `door_hits`, or correction memory as authority.
5. Use the correction-workflow design to let a human resolve review/missing rows against the active ledger row id, run id, warning, and bbox where available.

No narrow automatic improvement is recommended from this triage alone.
