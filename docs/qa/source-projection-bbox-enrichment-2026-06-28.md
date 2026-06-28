# Slice 2F-C Source/Projection Bbox Enrichment

Date: 2026-06-28

Result: PASS WITH WARNINGS

## Scope

This slice carries page+bbox evidence through the extracted quantity ledger only when the source object already provides safe page+bbox evidence.

It does not create new detection, matching, visual marker promotion, correction workflow, pricing behaviour, schema, persistence, or overlay behaviour.

## Source/Projection Audit

| Source/module/path                                                                | Page today                                               | Bbox today                                 | Coordinate system                            | Current-run scoped                                           | jobId/runId                              | Direct ledger mapping                                | Requires fuzzy matching                         | Stale risk                       | Active-authority risk                | Classification       | Decision                                                                          |
| --------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------- | ----------------------------------------------- | -------------------------------- | ------------------------------------ | -------------------- | --------------------------------------------------------------------------------- |
| `OpeningEvidenceItem` projected by `src/lib/takeoff/extracted-quantity-ledger.ts` | optional after this slice                                | optional after this slice                  | caller-defined source coordinates            | yes when built inside current `composeTakeoff` run           | inherited from ledger input              | yes, same candidate evidence item                    | no                                              | low if persisted with active run | low                                  | SAFE_DIRECT          | Preserve page+bbox when present.                                                  |
| `doorEngine.planText.windowCodes` via `src/lib/takeoff/plan-text.ts`              | no page on persisted `plan_text` payload                 | x/y point only, no bbox                    | door-engine/page text coordinate points      | yes during run                                               | inherited only after compose             | not directly retained on `OpeningEvidenceItem` today | would need source plumbing                      | low                              | medium if inferred from labels alone | SAFE_WITH_PROJECTION | Not implemented here; needs direct projection of page+bbox from plan text source. |
| `doorEngine.floorPlanGaps` via `src/lib/takeoff/floor-plan-gaps.ts`               | no page on candidate                                     | x/y point only, no bbox                    | door-engine adapter page space               | yes during run                                               | inherited only after compose             | directly creates review ledger candidates            | no for candidate, but bbox must be defined      | low                              | low                                  | SAFE_WITH_PROJECTION | Not implemented here; needs explicit bbox/page on gap evidence.                   |
| `elevationData.elevationOpenings` / vector openings                               | page known at extraction call, not retained on candidate | x/y point only, candidate bounds derivable | elevation PDF page/user-derived vector space | yes during run                                               | inherited only after compose             | sometimes feeds promoted openings/elevation matches  | usually needs face/floor matching               | medium                           | medium                               | NEEDS_DESIGN         | Rejected for this slice unless page+bbox is attached before matching.             |
| `door_hits` / `door_page`                                                         | yes                                                      | x/y point only, no bbox                    | adapter page space                           | yes during run                                               | inherited only after compose             | only maps to aggregate interior-door rows by bucket  | bucket grouping, not row-level opening identity | low                              | medium                               | NEEDS_DESIGN         | Rejected. Do not invent bbox from point data or match door_hits into ledger rows. |
| `visual_opening_audit`                                                            | pageNumber present                                       | normalized x/y point only, no bbox         | rendered image normalized coordinates        | current run when fresh, but legacy persisted evidence exists | inherited only through takeoff payload   | review evidence candidates only                      | yes for active row attachment                   | medium                           | high                                 | LEGACY_EVIDENCE_ONLY | Rejected. Do not make visual markers active authority.                            |
| `opening_schedule`                                                                | may carry page in legacy rows                            | no active ledger bbox                      | relational compatibility evidence            | can be stale                                                 | job scoped, not active-run ledger scoped | no                                                   | yes                                             | high                             | high                                 | DO_NOT_USE           | Rejected. Not an active bbox source.                                              |

## Implementation

Changed:

- `src/lib/takeoff/opening-evidence.ts`
  - Added optional `page` and `bbox` to `OpeningEvidenceItem`.
- `src/lib/takeoff/extracted-quantity-ledger.ts`
  - Added optional `source` to `ExtractedQuantityEvidence`.
  - Preserves `page` and `bbox` from each source evidence item when already present.
  - Does not synthesize page or bbox.

Not changed:

- detector logic;
- Fenner logic;
- visual marker matching;
- `door_hits` matching;
- `opening_schedule` authority;
- review correction workflow;
- persistence/schema;
- overlay runtime anchor derivation;
- verification/review/export counts;
- pricing/QS workbook behaviour.

## Behaviour

If a current-run source evidence item already has:

- `page`
- `bbox`

then the projected extracted quantity ledger evidence keeps those fields.

The existing overlay runtime anchor rule then works:

`ledger evidence page+bbox -> runtime visual anchor -> drawable marker`

Rows without page+bbox remain visible as unmarked rows.

Bbox presence does not change:

- status;
- clean totals;
- dimensions;
- unknown/null fields;
- assumed-height rejection.

## Smoke

Synthetic safe-source fixture:

- ledger rows: 2
- rows with page+bbox: 1
- runtime anchors: 1
- unmarked rows: 1

JM-0060 active persisted authority:

- jobId: `2d10ae44-f65a-4047-8d84-20bd345f84a1`
- runId: `4ba50d23-5764-41e4-bda5-0fdace588a6c`
- ledger rows: 67
- status counts: extracted 4, needs_review 18, missing_evidence 30, conflict 15, ignored 0
- rows with page+bbox: 0
- runtime anchors: 0
- unmarked rows: 67

Representative dry-run:

- job: JM-0058 / AI first Run / AI run
- runId: `46000acd-360d-4591-87cd-89d2c40740cb`
- ledger rows: 47
- rows with page+bbox: 0
- runtime anchors: 0
- unmarked rows: 47

## Warnings/Debt

This is a contract/projection slice, not a full production bbox enrichment slice.

Current production representative sources still do not emit page+bbox into `OpeningEvidenceItem`, so JM-0060 remains at 0 anchors. The next enrichment work should attach explicit page+bbox at one safe source before or during evidence-ledger creation.

Recommended next source candidates:

1. Floor-plan gap evidence: add page and a conservative bbox around the measured gap, where the page comes from the same door-engine page meta.
2. Plan-text window-code evidence: preserve page and text bbox/label bbox at parse time, if the door adapter can supply real text bounds rather than x/y points only.
3. Elevation vector evidence: design first, because floor/elevation face mapping can become matching-heavy.

Do not use visual_opening_audit, door_hits, or opening_schedule as active bbox authority until a separate design proves same-run row identity without fuzzy matching.
