# Slice 2F-D First Safe Source Emits Page+Bbox Evidence

Date: 2026-06-28

Result: PASS WITH WARNINGS

## Scope

This slice makes one safe current-run source emit page+bbox evidence into the extracted quantity ledger.

Changed source: floor-plan gap evidence.

No detector tuning, visual marker matching, correction workflow, pricing work, schema work, persistence change, review write path, AI prompt change, or overlay behavior change was performed.

## Source Audit

| Source/module/function                                         | Knows page                                                        | Knows bbox                                                                      | Coordinate system                                 | Directly feeds ledger row                                       | Requires fuzzy matching              | Current-run scoped                           | Stale risk | Legacy confusion risk | Classification             | Decision                                                            |
| -------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------ | -------------------------------------------- | ---------- | --------------------- | -------------------------- | ------------------------------------------------------------------- |
| `detectFloorPlanGaps` in `src/lib/takeoff/floor-plan-gaps.ts`  | no, detector is page-local                                        | yes after this slice, from paired wall-face gap endpoints and wall-face offsets | adapter page space, PDF points, y-down            | yes, via `buildOpeningEvidenceLedger` floor-plan gap candidates | no                                   | yes when called by `runDoorEngine`           | low        | low                   | SAFE_WITH_SMALL_PROJECTION | Selected. Detector emits bbox; runner stamps page.                  |
| `runDoorEngine` page meta in `src/lib/doors/run-doors.ts`      | yes                                                               | no                                                                              | adapter page space metadata                       | yes, same run boundary as floor-plan gaps                       | no                                   | yes                                          | low        | low                   | SAFE_WITH_SMALL_PROJECTION | Used only to stamp page onto current-run floor-plan gap candidates. |
| `OpeningEvidenceItem` in `src/lib/takeoff/opening-evidence.ts` | optional                                                          | optional                                                                        | source-defined; floor gaps use adapter page space | yes                                                             | no                                   | inherited from compose/run                   | low        | low                   | SAFE_DIRECT                | Carries floor-plan gap page+bbox into the ledger projection.        |
| `planText.windowCodes` in `src/lib/takeoff/plan-text.ts`       | no persisted page today                                           | x/y point only, no true text bbox today                                         | adapter/text label point                          | indirectly feeds openings                                       | source projection needed             | yes during run                               | low        | medium                | NEEDS_DESIGN               | Rejected for this slice; needs true text bounds, not just points.   |
| `elevationData.elevationOpenings` / vector openings            | extraction page exists at call site but not retained on candidate | x/y point; geometric bounds may be derivable                                    | elevation vector page space                       | sometimes feeds promoted openings                               | often requires face/floor linkage    | yes during run                               | medium     | medium                | NEEDS_DESIGN               | Rejected for this slice; avoid matching-heavy active anchors.       |
| `door_hits` / `door_page`                                      | yes                                                               | x/y point only, no bbox                                                         | adapter page space                                | aggregate interior-door evidence only                           | bucket/point mapping would be needed | yes                                          | low        | medium                | NEEDS_DESIGN               | Rejected; no bbox invention from door hits.                         |
| `visual_opening_audit`                                         | pageNumber present                                                | normalized x/y point only, no bbox                                              | rendered image normalized coordinates             | review evidence only                                            | yes                                  | can be current-run but also legacy persisted | medium     | high                  | LEGACY_EVIDENCE_ONLY       | Rejected. Not active bbox authority.                                |
| `opening_schedule`                                             | may have legacy page/text                                         | no active ledger bbox                                                           | relational compatibility evidence                 | no                                                              | yes                                  | job scoped, not active-run authority         | high       | high                  | DO_NOT_USE                 | Rejected.                                                           |

## Implementation

Changed:

- `src/lib/takeoff/floor-plan-gaps.ts`
  - `FloorPlanGapCandidate` now has optional `page` and `bbox`.
  - Gap detector emits a deterministic bbox from the actual paired wall-face gap geometry.
  - Horizontal gap bbox: `[gapStartX, upperWallFaceY, gapEndX, lowerWallFaceY]`.
  - Vertical gap bbox: `[leftWallFaceX, gapStartY, rightWallFaceX, gapEndY]`.
- `src/lib/doors/run-doors.ts`
  - Stamps `pageNumber` from the same current-run door-engine page onto detected floor-plan gaps.
- `src/lib/takeoff/opening-evidence.ts`
  - Carries `gap.page` and `gap.bbox` into the floor-plan gap `OpeningEvidenceItem`.

Existing 2F-C projection then carries that evidence into:

- `ExtractedQuantity.evidence`;
- extracted quantity read model;
- runtime visual anchors in the plan overlay model.

## Why This Source Is Safe

Floor-plan gap evidence is directly created by the deterministic door/vector run on the current floor-plan page.

It is not matched from legacy markers. It is not copied from `visual_opening_audit`, `door_hits`, or `opening_schedule`. The bbox is derived from the same wall-face segment pair that created the gap candidate, not from label text, room names, stored opening rows, or fuzzy matching.

## Status And Totals

Bbox presence does not change:

- extraction status;
- dimensions;
- area;
- clean totals;
- unknown/null fields;
- assumed-height behavior.

Rows without page+bbox remain visible as unmarked rows.

## Smoke

Controlled current-run floor-plan gap source:

- ledger rows: 3
- page+bbox rows: 1
- runtime anchors: 1
- unmarked rows: 2
- anchored row: `opening-floorplan-gap-1`
- status counts: extracted 3, needs_review 0, missing_evidence 0, conflict 0, ignored 0

JM-0060 active persisted authority:

- runId: `4ba50d23-5764-41e4-bda5-0fdace588a6c`
- ledger rows: 67
- page+bbox rows: 0
- runtime anchors: 0
- unmarked rows: 67
- status counts: extracted 4, needs_review 18, missing_evidence 30, conflict 15, ignored 0

Representative read-only dry-run:

- job: JM-0058
- runId: `46000acd-360d-4591-87cd-89d2c40740cb`
- ledger rows: 47
- page+bbox rows: 0
- runtime anchors: 0
- unmarked rows: 47

JM-0060 and JM-0058 remain unanchored because their stored source evidence does not carry floor-plan gap page+bbox evidence. A controlled fresh run that produces floor-plan gap candidates is needed to observe production anchors on persisted rows.

## Warnings/Debt

- This slice proves the first real safe source path, but existing persisted jobs are not retroactively enriched.
- Jobs without floor-plan gap evidence still have no anchors.
- Plan-text window-code bbox remains future work because current persisted source has points, not true text bboxes.
- Elevation vector evidence needs design before active bbox use because floor/elevation linkage can become matching-heavy.
- Visual anchor persistence remains future work.
- Ledger-backed correction workflow remains future work.

## Not Changed

- detectors thresholds or matching rules;
- Fenner-specific extraction;
- legacy visual marker behavior;
- review correction workflow;
- pricing/QS workbook behavior;
- verification/review/export clean totals;
- persistence/schema;
- AI prompts;
- correction memory.
