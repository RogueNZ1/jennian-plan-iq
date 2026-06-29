# Floor-plan Label Duplicate Guard Audit - 2026-06-29

## Result

PASS WITH FIX

## Question

Can clean floor-plan W x H label recovery duplicate an existing clean opening row?

## Finding

Yes. The risk was real.

Before this guard, `buildOpeningEvidenceLedger` appended clean `floorplan-label-N`
evidence after already-created opening candidates. When the existing opening and
the clean floor-plan label represented the same physical window, both candidates
could flow into `buildExtractedQuantityLedger` as clean `window` rows and double
count clean extracted area.

The duplicate path was:

```text
planText.windowCodes
-> recoverFloorPlanLabelAssignments
-> buildOpeningEvidenceLedger
-> buildExtractedQuantityLedger
-> read model / export / review / verification
```

## Product Rule

One physical opening must not contribute twice to clean Extracted Quantity totals.

Floor-plan label evidence may support or annotate an existing opening, but it must
not create a second clean row for the same physical opening.

## Tests Added

Focused tests were added for:

- duplicate clean label vs existing clean opening: one clean ledger row remains,
  clean area does not double count, and the floor-plan label is attached as
  supporting evidence;
- same dimensions in different rooms: distinct physical openings remain distinct;
- dirty/review labels: review evidence remains visible, no clean area is created;
- Fenner full-height narrow case `2150 x 600`: remains clean, width 600, height
  2150, area 1.29, no assumed height, `priced: false`;
- skylight labels: `780 x 1400` near `Skylight` remains excluded from exterior
  opening label recovery.

## Code Changed

Changed `src/lib/takeoff/opening-evidence.ts`.

The fix is intentionally narrow:

- applies only to clean floor-plan label assignments;
- matches only existing clean/priced `window` candidates;
- requires same normalized room;
- requires explicit width and height on both sides;
- requires width and height to match within 10 mm;
- appends the floor-plan label as supporting `floorplan_text` evidence on the
  existing candidate;
- suppresses only the duplicate clean label row.

No pricing path was changed. Existing clean openings keep their original source,
status, and priced state.

## Fenner Impact

- Auto recovered clean remains: 8 rows / 9 units.
- Review required remains: 8 rows.
- Missing/conflict remains: 1 row.
- False positives remain: 0.

Current-code Fenner standalone label check after the fix:

- parsed W x H codes: 13;
- floor-plan label rows: 12;
- extracted label rows: 8;
- review label rows: 4;
- skylight W x H window codes: 0.

The guard does not change Fenner clean-label recovery when no matching existing
clean opening is present. It only prevents a duplicate clean row when another
same-room/same-dimension clean opening already exists.

## Guardrails Confirmed

- no pricing changes;
- no correction UI;
- no Review triage UI;
- no tolerance widening;
- no detector tuning;
- no `opening_schedule`, `visual_opening_audit`, or `door_hits` authority;
- `output/` not committed.

## Validation

Validation passed:

```powershell
git diff --check
npx vitest run tests/takeoff/floor-plan-label-recovery.test.ts tests/takeoff/opening-evidence-label-recovery.test.ts tests/convergence/extracted-quantity-ledger.test.ts tests/convergence/extracted-quantity-read-model.test.ts tests/convergence/extracted-quantity-export.test.ts
npx tsc --noEmit
npm run test
```

Results:

- `git diff --check`: passed.
- focused required tests: 5 files passed, 41 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run test`: 103 files passed, 9 skipped; 982 tests passed, 1 expected
  fail, 26 skipped.
