# Multi-job Extracted Quantity Product Audit - 2026-06-29

Date: 2026-06-29 NZT

Result: PASS WITH WARNINGS

## Purpose

Validate whether Jennian Plan IQ currently produces useful extracted-quantity review artifacts
across multiple real jobs, without starting another implementation slice.

This audit checks product usefulness, not pricing correctness. A pass means the active extracted
quantity authority is visible and internally consistent; it does not mean every opening is ready
for QS pricing.

## Scope

Latest commit audited before this report: `9080e1f4c38b34e3aa1f3486a1e76708e5bf11ef`.

Jobs selected:

| Job | Mode | Reason selected |
| --- | --- | --- |
| Fenner / JM-CODEX Fenner live | production authority reference plus current local fixture diagnostics | Messy architect annotation plan with sliders, garage/front-entry complexity, skylight false-positive risk, and the completed 2H.5 clean-label recovery slice. |
| 15A | local current-code fixture | Clean/simple positive case for safe floor-plan W x H text witness recovery. |
| O'Neil | local current-code fixture | Weak current elevation/vector opening recovery and incomplete side-length evidence. |
| Beddis / JM-0005 | production persisted authority plus current local fixture diagnostics | Real old job with live persisted Export, Verification, Review, and Overlay agreement already smoke-tested. |

Excluded work:

- no pricing changes;
- no correction UI;
- no detector tuning;
- no tolerance widening;
- no schedule, visual-audit, or door-hit authority for clean opening dimensions;
- no JM-0060 mutation;
- no `output/` files committed.

## Global Guardrails

Repo state before this audit work was clean except for untracked `output/`.

Commands run:

```powershell
git status --short
git branch --show-current
git log --oneline -5
npx tsx scripts/opening-evidence-four-job-audit.mts
npx tsx scripts/15a-opening-ledger.mts
npx tsx scripts/fenner-opening-ledger.mts
npx tsx - # door-engine count probe over Fenner, 15A, O'Neil, Beddis
```

Generated scratch artifacts:

- `output/diagnostics/opening-evidence-four-job-audit.json`
- `output/diagnostics/15a-opening-ledger.json`
- `output/diagnostics/fenner-opening-ledger.json`

These artifacts were not staged and must remain uncommitted.

Authority guardrails:

- existing QS/pricing workbook behavior was not changed;
- `opening_schedule`, `visual_opening_audit`, and `door_hits` were not used as active authority for opening dimensions;
- unknown dimensions remain null in the ledger/read model/export doctrine;
- assumed heights remain review-only/null/null;
- overlay markers are only active when extracted quantity evidence has page plus bbox;
- legacy Review write paths remain quarantined from the active Extracted Quantities tab.

## Job Summaries

### Fenner

| Field | Value |
| --- | --- |
| Production job reference | `JM-CODEX-1782011310717 / Codex Fenner live` |
| Production jobId | `ced8ec8e-51b2-4da8-b191-506477d31bb8` |
| Production runId | `bcac8ed8-4e9b-43e3-8e36-35b3d694ece6` |
| Local source plan | `tests/doors/plans/fenner-floorplan.pdf` |
| Local elevation source | `tests/doors/plans/fenner-elevations.pdf` |
| Pages used | floor plan p1, elevations p1 |
| Run time | `2026-06-29T17:09:11+12:00` |
| Scripts used | `opening-evidence-four-job-audit.mts`, `fenner-opening-ledger.mts`, door-engine probe |

Surface agreement:

- Production persisted Fenner surfaces from the 2H.2 smoke agreed on runId
  `bcac8ed8-4e9b-43e3-8e36-35b3d694ece6`: 66 ledger rows, 4 extracted,
  18 needs_review, 29 missing_evidence, 15 conflict, 0 ignored, and 24 overlay markers.
- Current local Fenner diagnostics reflect the post-2H.5 clean-label recovery, but that current
  code result has not been persisted into the production Fenner run without a controlled rerun.
- No stale-run or legacy-authority issue was observed in the prior persisted surface check.

Quantity results:

| Area | Result |
| --- | --- |
| Exterior perimeter | `89.1 m` from floor-plan title text. Useful and visible. |
| Interior doors | Door engine returned singles 10, doubles 8, cavity sliders 2, flags 0. Useful as a review/export quantity. |
| Exterior openings/windows | Benchmark 17 rows / 18 units. Current clean floor-plan label recovery is 8 rows / 9 units. Review required 8 rows. Missing/conflict 1 row. False positives 0. |
| Glass area | Clean recovered floor-plan label area is 17.63 m2. Dirty assemblies and unknown-height rows remain null/excluded. |
| Evidence quality | Strong for clean W x H labels with page/bbox. Weak for width-only sliders, garage, and front-entry/sidelight assembly rows. |

Product verdict:

| Question | Answer |
| --- | --- |
| Useful as-is for Haydon? | Partially. |
| Why | Normal windows now recover cleanly enough to review; dirty assemblies are correctly flagged rather than guessed. Persisted production needs a safe rerun before the new Fenner clean-label recovery appears in live surfaces. |
| Automatic recovery | clean rows 8, review-required rows 8, missing/conflict 1, false positives 0. |
| Human review burden | Medium. |
| Most important trust issue | Large sliders, garage openings, Family overlight assembly, and front entry/sidelight still need face/elevation/assembly proof or human review. |
| Next bottleneck | Review UX plus targeted face/elevation/assembly evidence, not wider W x H label matching. |

### 15A

| Field | Value |
| --- | --- |
| Job reference | `15A local fixture` |
| jobId | `local-15a-multi-job-audit` |
| runId | `local-15a-multi-job-audit-2026-06-29` |
| Source plan | `tests/fixtures/15a/floorplan.pdf` |
| Elevation source | `tests/fixtures/15a/elevations.pdf` |
| Pages used | floor plan p1, elevations p1 |
| Run time | `2026-06-29T17:09:11+12:00` |
| Scripts used | `opening-evidence-four-job-audit.mts`, `15a-opening-ledger.mts`, door-engine probe |

Surface agreement:

- Local fresh-run surface model from the 2H.2 smoke agreed across Extracted Quantities export,
  Verification, Review, and Overlay with authority `takeoff_json_fallback_local_fresh_run`.
- That local model had 55 rows: 16 clean extracted, 0 needs_review, 39 missing_evidence,
  0 conflict, 0 ignored, 40 overlay markers, and 15 unmarked rows.
- This audit did not create a persisted 15A production job.

Quantity results:

| Area | Result |
| --- | --- |
| Exterior perimeter | `57.1 m` from floor-plan title text. Useful and visible. |
| Interior doors | Door engine returned singles 6, doubles 8, cavity sliders 4, flags 0. Useful. |
| Exterior openings/windows | 15 signed benchmark rows. Current ordered face/elevation scorecard recovers 4 / 15 rows, 6.36 m2 of 33.66 m2. Text-height proof has 2 safe floor-gap W x H matches. |
| Glass area | Area is calculated only for rows with witnessed width plus height. Rejected rows remain null. |
| Evidence quality | Good positive proof for text witness recovery when measured gap width and printed label width reconcile. Weak for garage/entry/slider rows that need a separate evidence class. |

Product verdict:

| Question | Answer |
| --- | --- |
| Useful as-is for Haydon? | Partially. |
| Why | Perimeter, doors, and a subset of openings are useful; a large opening remainder still needs row/face proof. |
| Automatic recovery | clean surface rows 16 in the local model; ordered face/elevation scorecard clean rows 4 / 15 signed openings; many opening rows remain missing evidence. |
| Human review burden | Medium to high. |
| Most important trust issue | Same-room labels can exist but still not prove the signed opening row unless face/order evidence is safe. |
| Next bottleneck | Review UX and narrow face/elevation assignment, not broad parser work. |

### O'Neil

| Field | Value |
| --- | --- |
| Job reference | `O'Neil local fixture` |
| jobId | `local-oneil-multi-job-audit` |
| runId | `local-oneil-multi-job-audit-2026-06-29` |
| Source plan | `tests/fixtures/oneil/floorplan.pdf` |
| Elevation source | `tests/fixtures/oneil/elevations.pdf` |
| Pages used | floor plan p1, elevations p1 |
| Run time | `2026-06-29T17:09:11+12:00` |
| Scripts used | `opening-evidence-four-job-audit.mts`, door-engine probe |

Surface agreement:

- O'Neil was audited as a local current-code fixture only.
- The extracted-quantity surface model tests validate the shared active-run/read-model/export/review/overlay
  rules, but this audit did not create or load a persisted O'Neil product run.
- No authority blocker was observed; the warning is evidence coverage, not surface disagreement.

Quantity results:

| Area | Result |
| --- | --- |
| Exterior perimeter | `64.0 m` from floor-plan title text. Useful. |
| Interior doors | Door engine returned singles 6, doubles 3, cavity sliders 8, flags 0. Useful as a deterministic count. |
| Exterior openings/windows | 15 benchmark rows. Floor plan has 8 printed W x H witnesses and 9 physical width witnesses, but elevation vector opening detection returned 0 openings in this diagnostic. |
| Glass area | No safe text-height matches in the current rule; rows should remain null/review rather than guessed. |
| Evidence quality | Floor-plan text exists, but side-length evidence is incomplete and elevation detection is the weak link. |

Product verdict:

| Question | Answer |
| --- | --- |
| Useful as-is for Haydon? | Partially, for perimeter and interior doors; no, for finished opening/glass quantities. |
| Why | The product can present review artifacts, but opening recovery is not yet enough for a low-effort QS review. |
| Automatic recovery | clean opening recovery effectively 0 under current local diagnostic; review/missing burden high. |
| Human review burden | High. |
| Most important trust issue | Elevation/vector opening evidence is missing, so W x H text cannot be tied to safe opening rows. |
| Next bottleneck | Elevation/vector evidence recovery or review UX, not tolerance widening. |

### Beddis

| Field | Value |
| --- | --- |
| Production job reference | `JM-0005 / Beddis` |
| Production jobId | `6f502da2-7eac-4b84-bc27-539f772a90fe` |
| Production runId | `712c53a1-4e4b-4ede-ba5e-11eccef0e9e6` |
| Local source plan | `tests/fixtures/beddis/concept-floorplan.pdf` |
| Elevation source | `tests/fixtures/beddis/prelim.pdf`, elevation page 5 |
| Run time | `2026-06-29T17:09:11+12:00` |
| Scripts used | `opening-evidence-four-job-audit.mts`, door-engine probe; live data from Product Smoke 1 |

Surface agreement:

- Production persisted Beddis surfaces agreed on runId
  `712c53a1-4e4b-4ede-ba5e-11eccef0e9e6`: 71 ledger rows, 4 extracted,
  12 needs_review, 47 missing_evidence, 8 conflict, 0 ignored.
- Extracted Quantities export, Verification, Review, and Overlay all used
  `persisted_current_run`.
- Overlay rendered 43 marker groups with `data-extracted-quantity-id`; 28 rows remained unmarked.
- No stale persisted rows, mixed runIds, or legacy active authority were observed.

Quantity results:

| Area | Result |
| --- | --- |
| Exterior perimeter | `63.8 m`, clean extracted and visible in live export/review/verification. |
| Interior doors | Live clean extracted counts: standard 7, double 9, cavity sliders 3. Door-engine probe matched singles 7, doubles 9, cavity 3, flags 0. |
| Exterior openings/windows | 67 opening-related live rows, but mostly needs_review/missing/conflict. Current local diagnostic has 8 printed W x H witnesses, 3 physical width witnesses, 11 elevation openings, and 6 dimension matches against truth. |
| Glass area | Live clean area 0 m2 for openings; unknown opening dimensions remain null/blank. |
| Evidence quality | Good page+bbox review context for many rows; weak clean height/area proof. |

Product verdict:

| Question | Answer |
| --- | --- |
| Useful as-is for Haydon? | Partially. |
| Why | Exterior perimeter and interior doors are immediately useful; openings are honestly visible but require substantial review. |
| Automatic recovery | live clean rows 4, needs_review 12, missing_evidence 47, conflict 8. |
| Human review burden | High for openings; low for perimeter/doors. |
| Most important trust issue | Most opening rows have location/evidence but not enough safe dimension proof for clean glass area. |
| Next bottleneck | Review UX and a narrow evidence-class recovery slice for openings. |

## Cross-job Findings

Consistently useful quantities:

- Exterior perimeter is visible and plausible across all four audited plans: Fenner 89.1 m,
  15A 57.1 m, O'Neil 64.0 m, Beddis 63.8 m.
- Interior door counts are consistently recoverable by the deterministic door engine with 0 flags
  in this audit: Fenner 20, 15A 18, O'Neil 17, Beddis 19.
- Export/read-model/review/verification/overlay authority rules remain structurally sound where
  live persisted surfaces were checked.

Fragile quantities:

- Exterior openings and glass area remain the product bottleneck.
- Safe floor-plan W x H label recovery works when labels can be assigned cleanly, but it is not
  enough for sliders, garage doors/windows, front-entry/sidelight assemblies, and plans where the
  floor/elevation relationship is weak.
- Elevation/vector face evidence is inconsistent across jobs: Fenner and Beddis have many vector
  candidates but hard assignment problems; O'Neil produced no usable vector opening candidates in
  this diagnostic.

Repeated false positives:

- Skylight labels are contained on Fenner and did not become exterior wall opening rows.
- No false-positive clean opening rows were found in the Fenner post-2H.5 scorecard.

Repeated missing evidence types:

- width-only slider/garage labels without safe height proof;
- front-entry and sidelight assemblies represented by split or contaminated annotations;
- face/order mapping that is plausible to a human but not safe enough for clean automation;
- elevation openings that exist visually but are not reliably mapped to current floor-plan rows.

Review UX pain points:

- Review is usable but dense when a job has dozens of missing/conflict rows.
- The highest leverage improvement is to make "what to check next" obvious, not to silently
  promote more rows.
- Dirty assemblies should be labelled as assembly review targets rather than generic
  missing evidence.

Export clarity issues:

- The separate Extracted Quantities worksheet is the right authority surface.
- Clean totals are useful because needs_review rows remain visible but excluded.
- The export is a review artifact for openings, not final QS pricing, until opening dimensions
  are clean or corrected.

Overlay evidence issues:

- Beddis live overlay is useful because 43 current-run markers render with extracted quantity IDs.
- Fenner current clean-label rows have page/bbox evidence locally; persisted production needs a
  controlled rerun before that current recovery appears as live active markers.
- Unmarked rows must remain visible in Verification/Review so lack of page+bbox is not hidden.

Plan types that work well:

- Plans with reliable title perimeter and clean door-width annotations.
- Normal exterior windows with clean floor-plan W x H labels and unambiguous room/proximity/order.

Plan types that do not work well yet:

- Dirty architect annotations and multi-part assemblies.
- Large sliders/garage openings relying on width-only labels.
- Plans where elevation vectors are text-poor, over-nested, or not mappable to the floor face.

## Recovery Ceiling

Current safe automation ceiling by quantity type:

| Quantity type | Current ceiling | Rationale |
| --- | --- | --- |
| Exterior perimeter | High | All four selected jobs exposed plausible title/perimeter values and Beddis proved live export/review/verification visibility. |
| Interior doors | High | Door engine produced stable counts with zero flags across all four selected floor plans. |
| Exterior openings | Medium on clean-label jobs, low on assembly/elevation-heavy jobs | Fenner recovers 8 / 17 benchmark rows after 2H.5; 15A has positive text-height proof but still many signed rows need face/order proof; Beddis/O'Neil remain review-heavy. |
| Glass area | Low to medium | Area is safe only when explicit width plus height evidence exists. The system is correctly leaving unknowns null instead of filling guessed heights. |

## Recommended Next Product Slice

Recommended next slice:

`2I - Review-first extracted quantity triage for opening rows`

Why this is higher leverage than more parser work:

- The authority chain is now structurally sane: one active ledger, visible read model, export,
  verification, review, and overlay alignment where live surfaces were checked.
- The remaining pain is not hidden totals; it is the human cost of understanding many honest
  missing/conflict rows.
- Fenner already shows the product target: normal windows recovered, dirty assemblies flagged,
  no guessed heights, no skylight false positives.
- Beddis and O'Neil show that more parsing alone will not produce useful output unless the review
  surface makes uncertain rows fast to inspect and resolve.

Suggested scope for `2I`:

- add a read-only Review triage grouping for extracted quantity opening rows:
  `clean`, `dirty assembly`, `width-only`, `height-missing`, `face/elevation-check`,
  `missing bbox`, and `conflict`;
- keep correction writes out unless a separate append-only correction design is explicitly
  started;
- preserve the current authority rules and null unknowns;
- rerun the same multi-job scorecard after the triage view exists.

Do not start:

- broad detector tuning;
- schedule/code/elevation recovery as a large mixed slice;
- correction UI implementation;
- pricing changes;
- legacy visual authority migration.

## Appendix

### Per-job Counts

| Job | Perimeter m | Interior door counts | Printed W x H witnesses | Physical width witnesses | Floor gaps | Elevation openings | Opening benchmark/useful count |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| Fenner | 89.1 | singles 10, doubles 8, cavity 2 | 13 | 6 | 24 | 44 | 8 clean / 17 benchmark rows after 2H.5 |
| 15A | 57.1 | singles 6, doubles 8, cavity 4 | 11 | 4 | 40 | 33 | 4 / 15 ordered face/elevation scorecard rows; 2 safe text-height floor-gap matches |
| O'Neil | 64.0 | singles 6, doubles 3, cavity 8 | 8 | 9 | 26 | 0 | 0 clean opening recovery under current diagnostic |
| Beddis | 63.8 | singles 7, doubles 9, cavity 3 | 8 | 3 | 43 | 11 | live 4 clean rows, but clean rows are perimeter/doors; openings review-heavy |

### Surface Authority Evidence

| Surface | Evidence |
| --- | --- |
| Extracted Quantity Ledger | Beddis live persisted rows and Fenner production rows previously checked; local fixture scorecards generated from current code. |
| Extracted Quantity read model | Focused tests cover activeRunId filtering, multiple-run fail-loud behavior, null unknowns, clean totals, needs_review visibility, and perimeter/doors surviving opening uncertainty. |
| Verification | Beddis and Fenner production smokes showed same active run/status groups as the read model. |
| Review | Beddis and Fenner production smokes showed active Extracted Quantities authority and quarantined legacy evidence. |
| Export workbook | Beddis live workbook contained the separate Extracted Quantities worksheet; focused export tests protect sectioning and null cells. |
| Overlay | Beddis live overlay rendered current-run markers only when page+bbox existed; focused overlay tests protect extractedQuantityId/visualAnchorId behavior. |

### Validation

Validation passed:

```powershell
git diff --check
npx vitest run tests/convergence/extracted-quantity-read-model.test.ts tests/convergence/extracted-quantity-export.test.ts tests/convergence/extracted-quantity-review-model.test.ts src/lib/__tests__/verification-model.test.ts src/lib/__tests__/plan-overlay.test.ts tests/takeoff/floor-plan-label-recovery.test.ts tests/takeoff/opening-evidence-label-recovery.test.ts tests/takeoff/floor-plan-text-height-witness.test.ts
npx tsc --noEmit
npm run test
```

Results:

- `git diff --check`: passed.
- focused tests: 8 files passed, 113 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run test`: 103 files passed, 9 skipped; 978 tests passed, 1 expected fail,
  26 skipped.
