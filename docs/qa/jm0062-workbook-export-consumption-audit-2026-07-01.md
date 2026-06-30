# JM-0062 Workbook Export Consumption Audit - 2026-07-01

## Result

PASS WITH WARNINGS after the safe export fix.

The uploaded workbook failed the QS handoff safety rule because `IQ Import` converted blocked window/opening reconciliation into hard-zero import cells and emitted a stale garage door import size. A regenerated JM-0062 workbook from the patched local export route now leaves blocked opening import cells blank, keeps cladding blocked, and surfaces clean evidence as review-only notes.

Warning: the regenerated artifact is local against the live JM-0062 job. Production artifact verification should happen after this commit is deployed.

## User finding

The workbook contains useful extracted evidence, but `IQ Import` did not use it safely.

The unsafe meaning was:

- `0` in window import cells looked like confirmed no windows.
- `2.4x2.1` garage door looked priceable even though active review evidence had a `4.8x2.1` held/conflict garage candidate.
- clean extracted evidence was only discoverable in `Extracted Quantities`, not summarized where the QS handoff would be consumed.

## Uploaded workbook inspected

- Uploaded filename: `C:\Users\Haydon\Downloads\JM-0062-IQ-Data-test.xlsx`
- Job number: `JM-0062`
- Job id: `886687aa-fbd5-40e1-b196-5f4286ce98e4`
- Active extracted quantity run: `84052442-d462-45f6-8da6-47763aaafaef`
- Sheets: `Cover`, `Review flags`, `Extracted Quantities`, `5. Data Input House `, `IQ Import`

## Evidence present

From the uploaded workbook and regenerated workbook:

- exterior perimeter: `89100 mm` / `89.1 lm`, status `extracted`
- interior doors: standard `10`, double `8`, cavity sliders `2`, total `20`, status `extracted`
- clean windows: `9` rows
- clean window area: `17.63 m2`
- duplicate MASTERBED clean rows: `2` rows at `1100 x 800`
- garage door review evidence:
  - `opening-held-blocked-opening-14`
  - category `garage_door`
  - width `4800 mm`
  - height `2100 mm`
  - status `conflict` / held blocked
- opening reconciliation block count in `Review flags`: `1`

## Export consumption failures

Uploaded workbook:

- `IQ Import!B33:D43` and `B45:D45` contained `36` hard-zero cells for Windows by Room.
- `IQ Import!B15` was blank, meaning opening pricing was blocked, but the row-level window cells still said zero.
- `IQ Import!B24` contained `2.4x2.1`.
- `IQ Import!B44:D44` contained `1`, `2.1`, `2.4`.
- `IQ Import` did not summarize the clean extracted window evidence.
- `IQ Import` did not summarize the `4.8x2.1` garage door review evidence.
- cladding correctly stayed blocked: `Less openings: NOT COMPUTED - opening reconciliation blocked` and `NET CLADDING: NOT COMPUTED`.

This made the sheet unsafe for consumption because the final paste block hid useful evidence and converted unresolved/review-only openings into priceable-looking zeros.

## Root cause

Classified causes:

- `applyEnrichedTakeoff` correctly blocks opening pricing by clearing priceable window data when `openingPricingBlocked` is true.
- `buildDropInSheet` then treated the empty priceable window slots as normal empty slots and wrote `0` into every Windows by Room row.
- The `IQ Import` window slot writer did not distinguish "confirmed zero" from "blocked/unresolved".
- The garage door section still read legacy QS-shaped `garageDoor24x21*` / `garageDoor48x21*` counters and wrote the first relational counter even while opening pricing was blocked.
- The active `extractedQuantityReadModel` was available but was not consumed for a review-safe handoff summary in `IQ Import`.

No extraction authority bug was found. The evidence existed; the handoff sheet was rendering it unsafely.

## Correct product semantics

When opening reconciliation is blocked:

- Windows by Room import cells must be blank, not zero.
- Garage door import cells must be blank unless a separate product rule explicitly allows priceable promotion.
- Clean extracted window evidence may be summarized as review-only evidence.
- Garage door held/conflict evidence may be summarized as review-only evidence.
- Cladding must remain not computed.
- `0` must only mean confirmed zero.

## Fix made

Narrow source fix in `src/lib/iq-qs-export.ts`:

- Added a blocked-opening import cell helper so `IQ Import` window rows render blank instead of `0` when opening pricing is blocked.
- Added a clean extracted window evidence summary:
  - `Clean extracted window evidence: 9 rows / 17.63 m2 - review before pricing; see Extracted Quantities.`
- Added a garage door review evidence summary:
  - `Garage door review evidence: 4.8x2.1 review only - see Extracted Quantities.`
- Suppressed garage door import cells while opening pricing is blocked:
  - `B24` blank
  - `B44:D44` blank
- Left cladding blocked.

## Regenerated workbook inspection

Regenerated via local export route:

- Base URL: `http://127.0.0.1:5173`
- Job id: `886687aa-fbd5-40e1-b196-5f4286ce98e4`
- Workbook: `output/jm0062-workbook-export-consumption-audit-2026-07-01/JM-0061-Fenner-live-production.xlsx`
- Inspection JSON: `output/jm0062-workbook-export-consumption-audit-2026-07-01/jm0062-workbook-before-after-inspection.json`

Regenerated workbook results:

- Windows by Room hard-zero cells: `0`
- Windows by Room blank cells: `36`
- `IQ Import!B15`: blank
- `IQ Import!B24`: blank
- `IQ Import!B44:D44`: blank / blank / blank
- clean window summary present: yes
- garage review summary present: yes
- stale `2.4x2.1` garage import text present: no
- opening reconciliation block count: `1`
- cladding not computed: yes

Clean evidence remained unchanged:

- clean windows: `9`
- clean window area: `17.63 m2`
- MASTERBED `1100 x 800` rows: `2`
- interior doors: `20`
- exterior perimeter: `89.1 lm`

## Tests added

- blocked opening reconciliation with clean extracted window rows leaves Windows by Room import cells blank.
- clean extracted window evidence summary appears in the review-safe `IQ Import` manual block.
- blocked garage/opening pricing does not emit legacy `2.4x2.1` import values.
- garage door review evidence `4.8x2.1` appears only as review-safe summary.
- duplicate clean MASTERBED `1100 x 800` rows remain separately represented in the `Extracted Quantities` worksheet.

## No extraction/pricing changes

Confirmed no changes to:

- extraction
- opening recovery
- pricing calculations
- correction UI
- detectors
- tolerances
- ledger persistence
- ledger authority
- Review triage classification

This is a QS workbook handoff safety fix only.

## Validation

- `npx vitest run tests/convergence/qs-export-dropin.test.ts tests/convergence/qs-export-flat-openings.test.ts tests/convergence/extracted-quantity-export.test.ts`: passed, `3` files / `51` tests
- regenerated JM-0062 workbook from local app export route and inspected actual cells
