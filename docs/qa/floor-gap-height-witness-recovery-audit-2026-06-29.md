# Floor-gap height witness recovery audit - 2026-06-29

## Slice

Slice 2H.1 - Height witness recovery audit for floor-gap opening rows.

Mode: read-only audit. No extraction code, detector tuning, pricing work, correction UI, AI prompt work, overlay change, schema change, or legacy authority promotion was performed.

## Goal

Find the safest current-run source of height evidence for rows that already have floor-plan gap width/location evidence but remain `missing_evidence` or `needs_review`.

## Decision

Result: **PASS WITH WARNINGS - no automatic height recovery implementation recommended yet.**

The audited active rows do not currently contain a `SAFE_DIRECT` or `SAFE_WITH_SMALL_LINK` height source that is strong enough to promote floor-gap rows.

The only existing safe automatic machine proof in the codebase is:

`floor-plan gap width + same-candidate elevation_measurement + matched face + width confirmed within 50mm + unambiguous exterior routing`

That path is already implemented and tested in:

- `src/lib/takeoff/elevation-gap-match.ts`
- `src/lib/takeoff/floor-plan-gap-promotion.ts`
- `tests/takeoff/elevation-gap-match.test.ts`
- `tests/takeoff/floor-plan-gap-promotion.test.ts`

However, none of the audited current-run persisted floor-gap ledger rows carried same-candidate `elevation_measurement` height evidence.

## Source Classification

| Candidate height source | Classification | Current audit result | Decision |
| --- | --- | --- | --- |
| Same floor-gap `OpeningEvidenceCandidate` with `elevation_measurement` evidence | `SAFE_DIRECT` for height evidence; promotion only if existing face/width gates pass | 0 rows found across audited persisted runs | Safe path exists, but no current persisted rows use it |
| Same floor-gap candidate with direct floorplan text/schedule/vector height evidence | `SAFE_DIRECT` as row evidence only, unless assumed | 0 rows found for floor-gap rows | No implementation target found |
| Current-run `plan_text.windowCodes` matching the gap width | `NEEDS_DESIGN` | Present on some rows, but persisted `plan_text.windowCodes` has no row id, room route, page, or bbox link to the floor-gap row | Do not promote from width-only match |
| Current-run `windows_schedule` matching width | `NEEDS_DESIGN` | 0 useful matches in audited rows | Even if present, no row id/location link from schedule to gap row |
| Current-run `windows_by_room` matching room/width | `NEEDS_DESIGN` | Rare match; aggregate room bucket only | Not row-level proof |
| Other `opening_evidence` rows in the same room | `UNSAFE` without row link | Common, but often many same-room candidates and mixed widths/statuses | Too ambiguous for automatic height borrowing |
| `visual_opening_audit` or visual opening evidence | `REVIEW_ONLY` | Occasional width/room proximity | Vision dimensions are not measurement-grade authority |
| Assumed heights / building standard heights | `DO_NOT_USE` | Existing doctrine rejects them | Must stay null/review |
| Legacy `opening_schedule`, `door_hits`, `visual_opening_audit` markers, correction memory | `DO_NOT_USE` as authority | Not used | Must remain quarantined |

## Jobs Audited

### JM-0005 / Beddis

- Job id: `6f502da2-7eac-4b84-bc27-539f772a90fe`
- Run id: `712c53a1-4e4b-4ede-ba5e-11eccef0e9e6`
- Ledger rows: 71
- Floor-gap rows audited: 43
- Floor-gap rows with bbox: 43
- Status: 43 `missing_evidence`
- Envelope split from review text: 13 exterior, 30 interior

Candidate height-source counts:

| Source class | Count |
| --- | ---: |
| same-room opening evidence, any width | 27 |
| no candidate height source | 13 |
| plan-text near-width, no location link | 7 |
| same-room opening evidence, exact width | 1 |
| same-room opening evidence, near width | 2 |
| plan-text exact width, no location link | 1 |
| windows-by-room near room/width aggregate | 1 |
| same-candidate elevation measurement | 0 |

Safety classification:

| Safety class | Rows |
| --- | ---: |
| `UNSAFE_same_room_only` | 23 |
| `NO_HEIGHT_SOURCE_FOUND` | 13 |
| `NEEDS_DESIGN_plan_text_no_location_link` | 6 |
| `NEEDS_DESIGN_current_run_same_room_width_no_row_link` | 1 |
| `SAFE_DIRECT_present` | 0 |

### JM-0060

- Job id: `2d10ae44-f65a-4047-8d84-20bd345f84a1`
- Run id: `4ba50d23-5764-41e4-bda5-0fdace588a6c`
- Ledger rows: 67
- Floor-gap rows audited: 24
- Floor-gap rows with bbox: 0
- Status: 24 `missing_evidence`
- Envelope split from review text: 9 exterior, 15 interior

Candidate height-source counts:

| Source class | Count |
| --- | ---: |
| same-room opening evidence, any width | 19 |
| no candidate height source | 3 |
| plan-text near-width, no location link | 3 |
| same-room opening evidence, near width | 1 |
| visual-audit near room/width, review only | 1 |
| plan-text exact width, no location link | 2 |
| same-candidate elevation measurement | 0 |

Safety classification:

| Safety class | Rows |
| --- | ---: |
| `UNSAFE_same_room_only` | 17 |
| `NO_HEIGHT_SOURCE_FOUND` | 3 |
| `NEEDS_DESIGN_plan_text_no_location_link` | 3 |
| `REVIEW_ONLY_visual_not_measurement_grade` | 1 |
| `SAFE_DIRECT_present` | 0 |

### JM-CODEX Fenner live regression

- Job id: `ced8ec8e-51b2-4da8-b191-506477d31bb8`
- Run id: `50f98928-b065-49b8-b4b1-045a6372e0c5`
- Ledger rows: 65
- Floor-gap rows audited: 24
- Floor-gap rows with bbox: 24
- Status: 24 `missing_evidence`
- Envelope split from review text: 9 exterior, 15 interior

Candidate height-source counts:

| Source class | Count |
| --- | ---: |
| same-room opening evidence, any width | 19 |
| plan-text near-width, no location link | 3 |
| no candidate height source | 3 |
| same-room opening evidence, near width | 1 |
| visual-audit near room/width, review only | 1 |
| plan-text exact width, no location link | 2 |
| same-candidate elevation measurement | 0 |

Safety classification:

| Safety class | Rows |
| --- | ---: |
| `UNSAFE_same_room_only` | 17 |
| `NEEDS_DESIGN_plan_text_no_location_link` | 3 |
| `NO_HEIGHT_SOURCE_FOUND` | 3 |
| `REVIEW_ONLY_visual_not_measurement_grade` | 1 |
| `SAFE_DIRECT_present` | 0 |

## Key Finding

The active persisted floor-gap rows already carry useful width/location evidence, especially on Beddis and the JM-CODEX Fenner live regression run. They do not carry a row-level height witness.

The tempting matches are mostly:

- a height-bearing row in the same room;
- a plan-text width/height code with similar width;
- a visual row with similar room/width;
- an aggregate `windows_by_room` bucket.

Those are clues for review, not automatic authority. They do not prove that the height belongs to the same physical opening as the floor-gap row.

## Safety Checks

- No assumed heights were accepted.
- No unknown heights were filled.
- No area was recalculated.
- No status was promoted.
- No legacy `opening_schedule`, `door_hits`, visual marker store, or correction memory was treated as authority.
- JM-0060 remains a stale-active-run bbox coverage warning, not a height-proof source.

## Recommendation

Machine proof is not available from the current persisted rows.

Proceed with a narrow ledger-backed correction workflow slice rather than automatic height recovery:

**Slice 2H.2 - Review height correction for active floor-gap ledger rows**

Recommended scope:

- Use the existing active/effective extracted quantity authority.
- In Review, allow a human to correct `heightMm` for an active floor-gap row via append-only ledger correction event.
- Require a reason and preserve original row/evidence snapshot.
- Do not mutate `extracted_quantity_rows` directly.
- Do not auto-promote status when height is entered.
- If the human marks the row `extracted`, record a separate explicit status correction.
- Export, Verification, Review, and Overlay should read the same effective corrected authority.
- Keep legacy write paths quarantined.

If a future machine slice is still wanted, it should be design-first:

**Machine design candidate:** persist a row-level link from `plan_text.windowCodes` or elevation openings to the specific floor-gap candidate, including page, bbox/point, room route, face, width delta, and ambiguity reason. Without that row-level link, height borrowing should stay out of clean totals.
