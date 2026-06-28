# Slice 2H.2-smoke - Fresh-run Text Height Witness Validation

Date: 2026-06-29 NZT

Result: PASS WITH WARNINGS

## Scope

This smoke checked whether Slice 2H.2 can recover opening height from nearby floor-plan text dimensions on a fresh current run and surface the result through the extracted quantity ledger read models.

No extraction logic, detector tuning, tolerance widening, pricing, correction UI, schema, `opening_schedule`, `visual_opening_audit`, `door_hits`, or correction-memory matching was changed.

Production `/version.json` served:

`8a0f108c6a5519e7e34d418f352d20da983b0974`

## Verdict

The matcher works on a real current-code fresh run when safe printed `W x H` evidence is present.

The deployed Codex production test job rerun completed and all migrated surfaces agreed, but it had no safe text-height witness matches. A production-persisted positive witness was not produced because there is no existing 15A/Codex production job with the matching plan fixture, and this smoke did not create a new production job.

Classification: PASS WITH WARNINGS.

## Runs Checked

| Run | Environment | Job reference | jobId | runId | Authority source | Result |
| --- | --- | --- | --- | --- | --- | --- |
| A | production UI and DB | `JM-CODEX-1782011310717 / Codex Fenner live` | `ced8ec8e-51b2-4da8-b191-506477d31bb8` | `bcac8ed8-4e9b-43e3-8e36-35b3d694ece6` | `persisted_current_run` | Fresh deployed rerun completed, no text witness matches |
| B | local current-code fresh run | `15A floorplan fixture p1` | `local-15a-floorplan-text-witness-smoke` | `local-15a-2h2-smoke-2026-06-29` | `takeoff_json_fallback_local_fresh_run` | 2 safe text witness matches, all surface models agreed |

JM-0060 was not mutated.

## Production Deployed Rerun

Target:

- job reference: `JM-CODEX-1782011310717 / Codex Fenner live`
- jobId: `ced8ec8e-51b2-4da8-b191-506477d31bb8`
- runId: `bcac8ed8-4e9b-43e3-8e36-35b3d694ece6`
- status: `completed`
- completed at: `2026-06-28T22:48:19.072+00:00`
- authority source: `persisted_current_run`

Ledger:

| Metric | Value |
| --- | ---: |
| Ledger rows | 66 |
| Clean extracted | 4 |
| Needs review | 18 |
| Missing evidence | 29 |
| Conflict | 15 |
| Ignored | 0 |
| Floor-gap rows | 24 |
| Text-height witness rows | 0 |
| Opening rows still height null | 32 |
| `assumed_height_rejected` rows | 3 |
| Forbidden evidence rows | 0 |

Surface agreement on production run:

| Surface | runId | Rows | Extracted | Needs review | Missing evidence | Conflict | Ignored | Overlay markers |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Extracted Quantities export model | `bcac8ed8-4e9b-43e3-8e36-35b3d694ece6` | 66 | 4 | 18 | 29 | 15 | 0 | n/a |
| Verification model | `bcac8ed8-4e9b-43e3-8e36-35b3d694ece6` | 66 | 4 | 18 | 29 | 15 | 0 | 24 marked / 42 unmarked |
| Review model | `bcac8ed8-4e9b-43e3-8e36-35b3d694ece6` | 66 | 4 | 18 | 29 | 15 | 0 | n/a |
| Overlay model | `bcac8ed8-4e9b-43e3-8e36-35b3d694ece6` | 66 | n/a | n/a | n/a | n/a | n/a | 24 marked / 42 unmarked |

Production finding:

- deployed fresh-run persistence works;
- active migrated surfaces agree;
- no legacy authority was used;
- assumed-height rows stayed quarantined;
- no text height witness was available for this target, so it is a no-match WARN case rather than the positive proof case.

## Local Positive Fresh-run Proof

Target:

- job reference: `15A floorplan fixture p1`
- source PDF: `tests/fixtures/15a/floorplan.pdf`
- jobId: `local-15a-floorplan-text-witness-smoke`
- runId: `local-15a-2h2-smoke-2026-06-29`
- authority source: `takeoff_json_fallback_local_fresh_run`
- mode: local current-code fresh run using the committed PDF fixture

Ledger:

| Metric | Value |
| --- | ---: |
| Ledger rows | 55 |
| Clean extracted | 16 |
| Needs review | 0 |
| Missing evidence | 39 |
| Conflict | 0 |
| Ignored | 0 |
| Floor-gap rows | 40 |
| Floor-gap rows with candidate `W x H` text nearby | 33 |
| Safe text-height witness matches | 2 |
| Ambiguous text matches rejected | 0 |
| Width mismatch rejected | 2 |
| Missing text rejected | 1 |
| Other ineligible gaps | 35 |
| Height newly filled from text | 2 |
| Area newly calculated from witnessed width and height | 2 |
| Rows still height null | 38 |
| Unknown dimension count | 42 |
| `assumed_height_rejected` rows | 0 |
| Runtime anchors | 40 |
| Unmarked rows | 15 |
| Forbidden evidence rows | 0 |

Clean totals:

| Category | Count | Length mm | Area m2 |
| --- | ---: | ---: | ---: |
| Interior door | 18 | 0 | 0 |
| Window | 13 | 0 | 20.18 |
| All clean extracted | 31 | 0 | 20.18 |

## Successful Witness Rows

### `opening-floorplan-gap-3`

| Field | Value |
| --- | --- |
| Category | `window` |
| Label | `Opening floorplan-gap-3 - MASTERBED` |
| Floor-gap width | 1820 mm |
| Matched text | `1300 x 1800` |
| Width match delta | 16 mm |
| Height selected | 1300 mm |
| Area calculated | 2.37 m2 |
| Evidence source | `vector_geometry` width + `pdf_text` height |
| Evidence page | 1 |
| Evidence bbox | `[899.2462500000006, 631.62, 902.2200000000005, 683.1]` |
| Text position | approximately `(908, 566)` |
| Status before | `missing_evidence` |
| Height before | null |
| Area before | null |
| Warnings before | `height_not_extracted`, `area_not_calculated` |
| Status after | `extracted` |
| Warnings after | none |

Evidence text included:

`height_source pdf_text_dimension; height_witness_text "1300 x 1800"; width_match_delta_mm 16`

### `opening-floorplan-gap-4`

| Field | Value |
| --- | --- |
| Category | `window` |
| Label | `Opening floorplan-gap-4 - DINING` |
| Floor-gap width | 1320 mm |
| Matched text | `1300 x 1500` |
| Width match delta | 21 mm |
| Height selected | 1500 mm |
| Area calculated | 1.98 m2 |
| Evidence source | `vector_geometry` width + `pdf_text` height |
| Evidence page | 1 |
| Evidence bbox | `[899.2462500000006, 205.74, 902.2200000000005, 243.17999999999995]` |
| Text position | approximately `(911, 280)` |
| Status before | `missing_evidence` |
| Height before | null |
| Area before | null |
| Warnings before | `height_not_extracted`, `area_not_calculated` |
| Status after | `extracted` |
| Warnings after | none |

Evidence text included:

`height_source pdf_text_dimension; height_witness_text "1300 x 1500"; width_match_delta_mm 21`

This row demonstrates the intended dimension orientation rule: the floor-gap width matched the first printed dimension, so the other dimension was selected as height.

## Rejected Witness Examples

### Width mismatch: `floorplan-gap-1`

- gap width: 1909 mm
- eligible exterior gap: yes
- nearby text count: 3
- nearby texts:
  - `1100 x 600`, closest width deltas 1309 mm / 809 mm
  - `1100 x 1200`, closest width deltas 709 mm / 809 mm
  - `1100 x 600`, closest width deltas 1309 mm / 809 mm
- reason: `width_mismatch`
- result: height stayed null and no area was calculated.

### Missing text: `floorplan-gap-2`

- gap width: 1816 mm
- eligible exterior gap: yes
- nearby text count: 0
- reason: `missing_text`
- result: height stayed null and no area was calculated.

### Not eligible: `floorplan-gap-6`

- gap width: 5872 mm
- envelope side: `interior`
- routing confidence: `low`
- routing ambiguous: true
- nearby text count: 1
- reason: `not_eligible`
- result: height stayed null and no area was calculated.

## Local Surface Agreement

All migrated surface model builders consumed the same active read model for `local-15a-2h2-smoke-2026-06-29`.

| Surface | runId | Rows | Extracted | Needs review | Missing evidence | Conflict | Ignored | Text witness rows | Overlay markers |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Extracted Quantities export model | `local-15a-2h2-smoke-2026-06-29` | 55 | 16 | 0 | 39 | 0 | 0 | 2 | n/a |
| Verification model | `local-15a-2h2-smoke-2026-06-29` | 55 | 16 | 0 | 39 | 0 | 0 | 2 | 40 marked / 15 unmarked |
| Review model | `local-15a-2h2-smoke-2026-06-29` | 55 | 16 | 0 | 39 | 0 | 0 | 2 | n/a |
| Overlay model | `local-15a-2h2-smoke-2026-06-29` | 55 | n/a | n/a | n/a | n/a | n/a | n/a | 40 marked / 15 unmarked |

The two text-witness rows showed the same height values, area values, evidence strings, status, and warnings across the read model used by Export, Verification, Review, and Overlay.

## Safety Checks

Held:

- height was filled only when nearby printed text matched the measured floor-gap width within tolerance;
- area was calculated only when both width and height were witnessed;
- rows with missing or mismatched text stayed height-null and area-null;
- ambiguous/ineligible floor gaps were not promoted;
- no assumed 2100/default height was used;
- no `opening_schedule`, `visual_opening_audit`, `door_hits`, or correction memory evidence was used as height proof;
- no pricing workbook behavior was changed;
- no legacy authority rows were selected as active authority;
- no JM-0060 production authority was rerun or mutated.

## Commands

Focused checks:

```powershell
npx vitest run tests/takeoff/floor-plan-text-height-witness.test.ts tests/takeoff/plan-text-compose.test.ts
npx vitest run tests/convergence/extracted-quantity-ledger.test.ts tests/convergence/extracted-quantity-read-model.test.ts tests/convergence/extracted-quantity-export.test.ts tests/convergence/extracted-quantity-review-model.test.ts src/lib/__tests__/plan-overlay.test.ts src/lib/__tests__/verification-model.test.ts
npx tsc --noEmit
npm run test
git diff --check
```

## Decision

PASS WITH WARNINGS.

Proceed to expand/validate text witness recovery across more jobs, ideally with one controlled Codex-labelled production test job that uses a known positive fixture such as 15A. If deployed positive fixtures remain unavailable, the next slice should audit schedule/code witness recovery instead of widening text matching.

Do not widen tolerance, use assumed heights, or promote ambiguous rows.
