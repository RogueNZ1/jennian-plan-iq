# Review Opening Triage Grouping - 2026-06-29

## Result

PASS WITH WARNINGS

The read-only Review triage grouping is implemented and covered by focused
model tests. Warning: this slice was validated with model tests, TypeScript, and
the full Vitest suite; there was no existing Review component test harness found
to add a small render assertion.

## Purpose

Make existing Extracted Quantity opening rows easier to review without changing
authority, extraction, status, dimensions, clean totals, or pricing behaviour.

The Review page should make it obvious:

- which opening rows are clean;
- which rows need height;
- which rows are dirty assemblies;
- which rows need face/elevation checking;
- which rows have no overlay marker;
- which rows are conflicts.

## What Changed

- Added display-only opening triage to the active Extracted Quantity Review
  model.
- Added Review summary counts for clean extracted, needs review, missing
  evidence, conflict, rows with overlay markers, and rows without overlay
  markers.
- Added opening-specific triage groups to the Extracted Quantities tab in
  Review.
- Added focused tests for the triage classifier/model.

## What Did Not Change

- no pricing;
- no correction UI;
- no edit buttons;
- no extracted quantity row mutation;
- no extraction promotion;
- no status changes;
- no tolerance widening;
- no detector tuning;
- no `opening_schedule`, `visual_opening_audit`, or `door_hits` authority;
- no `output/` commit.

## Triage Groups

| Group                      | Definition                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean                      | Opening rows where `status === "extracted"`.                                                                                                            |
| Dirty assembly             | Rows with evidence or warnings indicating malformed, contaminated, assembly, multi-part, sidelight, overlight, split-entry, or drafting issue evidence. |
| Width only                 | Rows where width exists but height is still null.                                                                                                       |
| Height missing             | Rows where height/area are null and warnings or evidence indicate height was not extracted or area was not calculated.                                  |
| Needs face/elevation check | Rows with useful evidence but unsafe face, elevation, order, room/order, garage, or slider assignment.                                                  |
| No overlay marker          | Rows without usable page plus bbox evidence for an overlay marker.                                                                                      |
| Conflict                   | Rows with `status === "conflict"` or conflict/source-conflict evidence.                                                                                 |
| Other review               | Non-clean rows that still need review but do not match a more specific reason.                                                                          |

Rows can appear in more than one group when that is useful for review. For
example, a width-only row with no page/bbox appears under both Width only and No
overlay marker.

## Example Rows

Examples below come from the existing Fenner QA/audit fixtures and reports used
through this opening-recovery work. They are examples of how the grouping reads
current ledger rows; this slice does not create new extraction rows.

| Example                                                                                                     | Expected Review grouping                                                                            |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Clean Fenner W x H row such as `floorplan-label-7: 2150 x 600` / Ensuite, width 600, height 2150, area 1.29 | Clean.                                                                                              |
| Family slider / overlight evidence such as malformed `1300x175036001300x1750` and width-only `3600`         | Dirty assembly; Width only or Height missing where row dimensions remain partial.                   |
| Front entry / sidelight evidence such as `1030`, `1400`, `2150 x 400`                                       | Dirty assembly or Needs face/elevation check, depending on active row evidence.                     |
| Width-only garage/sliders such as garage door `4800` or Lounge slider `3600`                                | Width only; Height missing; Needs face/elevation check where evidence says garage/slider/elevation. |
| Active opening row without page+bbox evidence                                                               | No overlay marker.                                                                                  |
| Conflict/source-conflict row                                                                                | Conflict.                                                                                           |

## Validation

Commands run:

```powershell
git diff --check
npx vitest run tests/convergence/extracted-quantity-review-model.test.ts
npx vitest run tests/convergence/extracted-quantity-review-model.test.ts tests/convergence/extracted-quantity-read-model.test.ts tests/convergence/extracted-quantity-export.test.ts tests/convergence/extracted-quantity-ledger.test.ts src/lib/__tests__/verification-model.test.ts src/lib/__tests__/plan-overlay.test.ts
npx tsc --noEmit
npm run test
npm run build
```

Results:

- `git diff --check`: passed.
- focused Review model tests: 1 file passed, 22 tests passed.
- focused authority/export/verification/overlay tests: 6 files passed, 113
  tests passed.
- `npx tsc --noEmit`: passed.
- `npm run test`: 103 files passed, 9 skipped; 991 tests passed, 1 expected
  fail, 26 skipped.
- `npm run build`: passed. The build reran the full Vitest suite with the same
  result, then Vite built client and SSR bundles successfully. `version.json`
  and the Cloudflare Pages worker were regenerated inside ignored build output
  only.

## Product Verdict

Yes, this makes Review easier for Haydon. It does not increase automatic
recovery, but it reduces review confusion by putting the active opening ledger
rows into practical read-only buckets: clean, dirty assembly, width only, height
missing, needs face/elevation check, no overlay marker, conflict, and other
review.
