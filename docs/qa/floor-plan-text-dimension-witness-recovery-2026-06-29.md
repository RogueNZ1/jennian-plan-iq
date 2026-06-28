# Floor-plan text dimension witness recovery - 2026-06-29

## Slice

Slice 2H.2 - Floor-plan text dimension witness recovery for glass area.

Result: **PASS WITH WARNINGS**

Scope:

- Use current-run floor-plan text dimensions such as `1300 x 1500` as height witnesses for floor-gap extracted quantity rows.
- Do not use assumed heights.
- Do not use old `opening_schedule`, `visual_opening_audit`, `door_hits`, correction memory, or pricing stores as authority.
- Do not change QS/pricing workbook behaviour.
- Do not mutate production rows during smoke.

## Source Audit

| Source/module/function | Contains W x H text? | Page? | x/y or bbox? | Nearby room/wall/context? | Width can match floor gap? | Link without broad fuzzy matching? | Enough to fill height? | Classification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `parsePlanText` / `planText.windowCodes` during compose | Yes, parsed as `heightMm` + `widthMm` | Same door-engine page during current run | Yes, x/y point | Yes, via point proximity; room routing exists separately | Yes, either dimension can match within 50mm | Yes, when same page, near gap bbox, exactly one width match, no nearby conflict | Yes | `SAFE_WITH_WIDTH_MATCH` |
| Persisted `enriched.plan_text.windowCodes` | Yes | No | No, persisted projection drops x/y | No | Yes by width only | No | No | `NEEDS_DESIGN` |
| `OpeningEvidenceItem` projected into ledger | Yes when current-run match is attached | Yes | Floor-gap bbox plus text point in note | Yes | Already linked | Yes | Yes | `SAFE_DIRECT` |
| `floorPlanGaps` | Width only | Yes after 2F-D | Yes, bbox | Yes, wall/room/envelope/routing | N/A | Direct row identity | Needs height source | `SAFE_DIRECT_WIDTH_ONLY` |
| `windows_schedule` | Yes | Not row-local to floor gap | No active row-local bbox | Weak/no floor row link | Possible by width | No | No | `NEEDS_DESIGN` |
| `windows_by_room` | Aggregate H x W by room | No row page | No | Room bucket only | Possible | No | No | `NEEDS_DESIGN` |
| `visual_opening_audit` | Sometimes | Legacy/current mixed | Point only, no row-local bbox | Visual marker context only | Possible | No | No | `DO_NOT_USE` as height proof |
| Legacy `opening_schedule` | Sometimes | Legacy/job scoped | Not active-run row-local | Stale risk | Possible | No | No | `DO_NOT_USE` |
| `door_hits` | Door widths only | Yes | Point only | Interior-door domain | No | No | No | `DO_NOT_USE` |

## Implemented Rule

Added `matchPlanTextDimensionsToFloorPlanGaps`.

A floor-plan text dimension can fill height only when all are true:

- same compose run;
- same page;
- floor-gap row has measured width, page, and bbox;
- gap is exterior;
- gap routing is not ambiguous;
- gap confidence and routing confidence are not low;
- text dimension parses as two millimetre values;
- one text dimension matches the measured floor-gap width within `MEASURED_WIDTH_CONFIRMATION_TOLERANCE_MM` (`50mm`);
- text point is within `90pt` of the floor-gap bbox;
- exactly one nearby text dimension matches;
- no nearby conflicting H x W text dimension is present.

When matched:

- the floor-gap candidate keeps measured gap width as the row width;
- the other text dimension becomes height;
- area is calculated from witnessed width and witnessed height;
- evidence records `height_source pdf_text_dimension`, `height_witness_text`, and `width_match_delta_mm`;
- the row can become extracted in the Extracted Quantity ledger;
- the row is not added to `openings[]` and does not change QS/pricing workbook behaviour.

## Code Changed

- `src/lib/takeoff/floor-plan-text-height-witness.ts`
  - New current-run matcher for floor-plan text dimensions and floor-gap candidates.
- `src/lib/takeoff/compose-takeoff.ts`
  - Runs the matcher during compose and passes matches into opening evidence generation.
- `src/lib/takeoff/opening-evidence.ts`
  - Adds text-dimension height evidence to matching floor-gap candidates.
  - Uses `extracted` evidence status for ledger-only extraction without pricing writes.
- `src/lib/takeoff/extracted-quantity-ledger.ts`
  - Preserves evidence text in projected ledger evidence.
  - Treats `OpeningEvidenceCandidate.status === "extracted"` as an extracted quantity row.

## Tests

Focused tests added/updated:

- `tests/takeoff/floor-plan-text-height-witness.test.ts`
- `tests/takeoff/plan-text-compose.test.ts`

Coverage:

- parses floor-plan text dimension as width and height witness;
- matches text dimension to floor-gap row when one dimension matches measured width;
- uses the other dimension as height;
- calculates area only when width and height are both witnessed;
- does not use text dimension when width does not match floor gap;
- does not use text dimension when multiple nearby candidates are ambiguous;
- does not use text dimension when a conflicting nearby dimension is present;
- does not use text dimension from another page;
- does not assume `2100` when text is missing;
- preserves evidence text and width-match delta;
- does not promote conflict rows when text witness conflicts;
- keeps unknown height null when no safe text witness exists.

Additional existing guard coverage remains green for:

- extracted quantity ledger/read model/export/review;
- verification model;
- plan overlay;
- assumed-height rows staying null/null;
- legacy stores not being used as active evidence.

## Verification

Commands run:

```powershell
npx vitest run tests/takeoff/floor-plan-text-height-witness.test.ts tests/takeoff/plan-text-compose.test.ts
npx tsc --noEmit
npx vitest run tests/convergence/extracted-quantity-ledger.test.ts tests/convergence/extracted-quantity-read-model.test.ts tests/convergence/extracted-quantity-export.test.ts tests/convergence/extracted-quantity-review-model.test.ts src/lib/__tests__/plan-overlay.test.ts src/lib/__tests__/verification-model.test.ts
git diff --check
```

Results:

- focused text/compose tests: 30 passed;
- typecheck: passed;
- extracted quantity/export/review/overlay/verification tests: 105 passed;
- `git diff --check`: clean.

## Read-only Live Smoke

No live jobs were rerun or mutated. Existing active persisted authority remains unchanged until a fresh run recomposes with the new matcher.

### JM-0005 / Beddis

- Job id: `6f502da2-7eac-4b84-bc27-539f772a90fe`
- Run id: `712c53a1-4e4b-4ede-ba5e-11eccef0e9e6`
- Authority: `persisted_current_run_read_only`
- Ledger rows: 71
- Status counts: extracted 4, needs_review 12, missing_evidence 47, conflict 8
- Floor-gap rows: 43
- Floor-gap rows with bbox: 43
- Existing persisted text-height witness rows: 0
- Assumed-height promoted rows: 0
- Legacy height evidence rows: 0

### JM-CODEX Fenner live regression

- Job id: `ced8ec8e-51b2-4da8-b191-506477d31bb8`
- Run id: `50f98928-b065-49b8-b4b1-045a6372e0c5`
- Authority: `persisted_current_run_read_only`
- Ledger rows: 65
- Status counts: extracted 4, needs_review 17, missing_evidence 29, conflict 15
- Floor-gap rows: 24
- Floor-gap rows with bbox: 24
- Existing persisted text-height witness rows: 0
- Assumed-height promoted rows: 0
- Legacy height evidence rows: 0

### JM-0060

- Job id: `2d10ae44-f65a-4047-8d84-20bd345f84a1`
- Run id: `4ba50d23-5764-41e4-bda5-0fdace588a6c`
- Authority: `persisted_current_run_read_only`
- Ledger rows: 67
- Status counts: extracted 4, needs_review 18, missing_evidence 30, conflict 15
- Floor-gap rows: 24
- Floor-gap rows with bbox: 0
- Existing persisted text-height witness rows: 0
- Assumed-height promoted rows: 0
- Legacy height evidence rows: 0

## Warning

This slice proves and implements the safe compose-time path, but it does not retroactively enrich already persisted active runs.

Persisted `plan_text.windowCodes` currently drops x/y, so it is not safe to backfill text-height witnesses from stored `takeoff_json` alone. A fresh run is required for active ledger rows to receive text-dimension height evidence.

## Next Recommendation

Run a controlled fresh-run smoke on a safe staging/test job with printed floor-plan window dimensions and floor-gap candidates, then verify:

- text-height witness rows appear in `extracted_quantity_rows`;
- height and area are filled only on unambiguous current-run matches;
- Export, Verification, Review, and Overlay agree;
- no QS/pricing workbook cells change except the separate Extracted Quantities section.
