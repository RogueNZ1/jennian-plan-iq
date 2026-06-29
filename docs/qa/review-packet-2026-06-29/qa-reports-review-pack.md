

============================================================
FILE: docs/qa/multi-job-extracted-quantity-product-audit-2026-06-29.md
============================================================

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



============================================================
FILE: docs/qa/product-smoke-real-old-job-2026-06-29.md
============================================================

# Product Smoke 1 - Real Old Job End-to-End

Date: 2026-06-29 NZT

Result: PASS WITH WARNINGS

## Scope

Paused Slice 2G.3 and ran one old real job through current production/current main.

No detector tuning, pricing changes, correction UI/buttons, Review or Overlay edit controls, AI prompt changes, correction-memory changes, proof gate changes, migrations, schema changes, or broad refactors were performed.

Production `/version.json` served build `4c26cf9eb323115750b87bad5dee949efc4e815d`.

## Job Selected

| Field | Value |
| --- | --- |
| Job reference | `JM-0005 / Beddis` |
| jobId | `6f502da2-7eac-4b84-bc27-539f772a90fe` |
| Why selected | Real old pre-ledger job, Haydon-recognisable Beddis plan, not JM-0060, not a Codex synthetic job, one uploaded plan, had perimeter/opening/interior-door evidence, and zero active ledger rows before rerun. |
| Environment | Production UI at `https://www.jennianiq.nz` |
| New runId | `712c53a1-4e4b-4ede-ba5e-11eccef0e9e6` |
| Run status | `completed` |
| Authority source | `persisted_current_run` |

## Numbers Summary

| Metric | Value |
| --- | ---: |
| Ledger rows | 71 |
| Clean extracted rows | 4 |
| needs_review rows | 12 |
| missing_evidence rows | 47 |
| conflict rows | 8 |
| ignored rows | 0 |
| Clean count | 20 |
| Clean length | 63,800 mm |
| Clean area | 0 m2 |
| Page+bbox rows | 43 |
| Runtime anchors | 43 |
| Unmarked rows | 28 |
| assumed_height_rejected rows | 3 |
| Unknown opening dimension rows | 53 |

Clean totals include only `status === "extracted"` rows.

Clean extracted rows were:

- exterior perimeter: count 1, length 63,800 mm;
- interior doors - standard: count 7;
- interior doors - double: count 9;
- interior doors - cavity sliders: count 3.

All 43 runtime anchors were `opening / missing_evidence / vector_geometry` rows. They provide visual context for review, but they are not clean extracted opening dimensions yet.

## Surface Agreement

| Surface | Result |
| --- | --- |
| Extracted Quantities export | PASS. Downloaded workbook `JM-0005-IQ-Data-Beddis.xlsx` includes `Extracted Quantities`, active run `712c53a1-4e4b-4ede-ba5e-11eccef0e9e6`, sections `Clean extracted` 4, `Needs review` 12, `Missing evidence` 47, `Conflict` 8, `Ignored` 0, and clean totals. Unknown cells are blank/null. |
| Verification | PASS. Shows `Authority: persisted_current_run`, the same runId, the same clean-total rule, and ledger rows/status groups. |
| Review | PASS. Shows `Active Extracted Quantity Ledger`, `Authority persisted_current_run`, the same runId/activeRunId, clean count 20, clean length 63,800 mm, clean area 0 m2, and sections 4/12/47/8/0. |
| Overlay | PASS. Shows `Active extracted quantity overlay: persisted_current_run`, same runId, total ledger rows 71, rows with markers 43, rows without markers 28. DOM rendered 43 marker groups with `data-extracted-quantity-id` and runtime `visualAnchorId`. |

No surface selected stale rows, mixed runIds, or a different active authority.

## Legacy Authority Check

No old split-brain authority was found.

- Active unsuperseded ledger runIds: only `712c53a1-4e4b-4ede-ba5e-11eccef0e9e6`.
- `opening_schedule` rows for this job after rerun: 0.
- Verification still displays legacy visual and door-engine evidence, but labels it as evidence-only and not active extracted quantity authority.
- Legacy visual evidence was not used to create active authority totals.

## Product Usefulness Questions

| Question | Answer |
| --- | --- |
| Is exterior perimeter visible and plausible? | Yes. It is clean extracted as 63.8 m, which is plausible for Beddis. |
| Are interior doors visible and plausible? | Yes. Standard 7, double 9, cavity 3, total clean door count 19. |
| Are windows/openings visible as rows? | Yes. There are 67 opening-related rows across window/opening/exterior_door/garage_door categories. |
| Are known dimensions filled? | Partly. Known widths/heights appear on several review/conflict rows. |
| Are unknown dimensions null/blank rather than guessed? | Yes. Unknown dimensions stay null/blank in DB, Review, and export. |
| Are needs_review rows obvious? | Yes. Export and Review separate them clearly. |
| Are missing_evidence/conflict rows understandable? | Mostly. Warnings/source/evidence text are visible, but volume is high and needs human review. |
| Are assumed-height rows quarantined? | Yes. Three rows are `needs_review` with `heightMm` null, `areaM2` null, and `assumed_height_rejected`. |
| Does overlay show anchors where supported? | Yes. 43 ledger marker groups render, all from current-run page+bbox evidence. |
| Are unmarked rows still visible? | Yes. Verification lists 28 rows without markers. |
| Does Review make clear what the user should inspect? | Yes. The Extracted Quantities tab is first, legacy tabs are labelled/quarantined, and uncertainty stays visible. |
| Is the Extracted Quantities workbook usable as a numbers export? | Yes as a review export. It is not a finished pricing answer because most openings remain missing/conflict/review. |
| Does anything still look like old split-brain behaviour? | No active split-brain. Legacy evidence is visible but quarantined/labeled. |
| Could Haydon use this output as a review starting point tomorrow? | Yes, as a review starting point, not as final QS/pricing input. |

## Accuracy Notes

`usable_now`

- Exterior perimeter and interior door counts survive the old-job rerun and are visible across Export, Verification, Review, and Overlay authority summaries.
- The active ledger/run chain is structurally sane.

`needs_review_but_honest`

- 12 rows are `needs_review`, 47 are `missing_evidence`, and 8 are `conflict`.
- Assumed heights are rejected instead of promoted to clean area.

`blocked_by_missing_evidence`

- Most window/opening rows are not clean extracted dimensions yet.
- All overlay anchors in this smoke are missing-evidence opening-gap anchors, useful for visual review but not clean joinery takeoff.

`extraction_accuracy_issue`

- Opening recovery is still the main accuracy gap. The product is surfacing the gap honestly rather than hiding it.

`ui_clarity_issue`

- Review is usable but dense. It may need small polish before non-technical users rely on it heavily.
- Browser console showed a non-blocking `module_items_run_id_fkey` warning during concept assumptions. It did not affect the active extracted quantity ledger, export, Review, Verification, or Overlay agreement in this smoke.

`authority_issue`

- None observed.

## Artifacts

- Workbook downloaded during smoke: `output/product-smoke-real-old-job-2026-06-29/JM-0005-IQ-Data-Beddis.xlsx`
- Overlay screenshot: `output/product-smoke-real-old-job-2026-06-29/JM-0005-verification-overlay.png`

## Verdict

PASS WITH WARNINGS.

The old job reruns successfully, migrated surfaces agree on one active persisted ledger authority, numbers are visible, uncertainty is visible, and no stale/legacy authority leaks were observed.

The warning is product usefulness rather than architecture: Beddis is usable as a review starting point, but not as a final pricing takeoff because opening dimensions still require substantial review.

## Recommended Next Slice

Proceed with a small Review-first correction slice only if Haydon needs to act on this output immediately.

Recommended path:

1. `2G.3-min` - design/implement one tiny append-only Review correction action against ledger rows, scoped to the active run, with original values preserved.
2. Do not start broad correction UI.
3. Do not tune extraction in the correction slice.

If the next priority is accuracy rather than workflow, pause corrections and use this stable authority chain to target opening/window recovery.



============================================================
FILE: docs/qa/opening-window-evidence-triage-2026-06-29.md
============================================================

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



============================================================
FILE: docs/qa/floor-gap-height-witness-recovery-audit-2026-06-29.md
============================================================

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



============================================================
FILE: docs/qa/floor-plan-text-dimension-witness-recovery-2026-06-29.md
============================================================

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



============================================================
FILE: docs/qa/floor-plan-text-witness-fresh-run-smoke-2026-06-29.md
============================================================

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



============================================================
FILE: docs/qa/text-witness-coverage-diagnostics-2026-06-29.md
============================================================

# Slice 2H.3 - Text Witness Coverage Diagnostics

Date: 2026-06-29 NZT

Result: PASS WITH WARNINGS

## Scope

This diagnostic explains why the fresh production Codex Fenner run produced zero floor-plan text height witness matches while the local 15A proof produced two safe matches.

No extraction logic, detector tuning, tolerance changes, assumed heights, pricing paths, correction UI, `opening_schedule`, `visual_opening_audit`, `door_hits`, or correction-memory matching was changed.

Production `/version.json` served:

`fb930c7bbc9d2559f0ffe2d0b8b80a6d2d6e6821`

## Summary

Production Fenner did not fail because text was absent or because text was not passed to the matcher.

The source PDF dry-run found:

- 15 parsed `W x H` text candidates;
- all 15 had same-page context and x/y position;
- 20 of 24 floor-gap rows had a nearby `W x H` candidate;
- only 3 floor gaps were eligible exterior rows;
- all 3 eligible exterior rows rejected by strict width mismatch;
- the remaining 21 rows were interior/ineligible, mostly low-confidence/ambiguous routing.

That makes Fenner's zero matches expected under the conservative rule, not a plumbing bug.

The current yield limit is not text extraction. It is the overlap between:

1. true exterior floor-gap rows with reliable measured width; and
2. nearby printed dimension labels whose width component matches that gap within 50 mm.

15A has two such rows. Fenner, Beddis, O'Neil, and Christian did not under the current rule.

## Jobs Inspected

| Job | Run mode | runId | Purpose |
| --- | --- | --- | --- |
| JM-CODEX Fenner fresh production | production fresh run | `bcac8ed8-4e9b-43e3-8e36-35b3d694ece6` | Deployed zero-match case |
| JM-CODEX Fenner source PDF | dry-run from production uploaded PDF | `bcac8ed8-4e9b-43e3-8e36-35b3d694ece6` | Full text/gap rejection funnel |
| JM-0005 Beddis current production | production current run | `712c53a1-4e4b-4ede-ba5e-11eccef0e9e6` | Read-only old-job/current authority comparison |
| JM-0005 Beddis source PDF | dry-run from production uploaded PDF | `712c53a1-4e4b-4ede-ba5e-11eccef0e9e6` | Full text/gap rejection funnel |
| 15A floorplan fixture | local fresh run | n/a | Positive proof |
| O'Neil floorplan fixture | local fresh run | n/a | Additional W x H text fixture |
| Christian floorplan page6 fixture | local fresh run | n/a | Additional W x H text fixture |

JM-0060 was not rerun or mutated.

## Persisted Production Authority

Persisted production rows confirm active authority state, but not the full text-position funnel. Persisted `takeoff_json.plan_text.windowCodes` stores dimensions and optional ids, but not text x/y/page. The rejection funnel therefore requires current-code dry-runs on the source PDFs.

| Job | Authority rows | Floor-gap rows | Persisted W x H count | Persisted W x H has x/y/page | Text-height matches | Opening rows still height null | Status groups |
| --- | ---: | ---: | ---: | --- | ---: | ---: | --- |
| JM-CODEX Fenner | 66 | 24 | 15 | no | 0 | 32 | 4 extracted, 18 needs_review, 29 missing_evidence, 15 conflict, 0 ignored |
| JM-0005 Beddis | 71 | 43 | 8 | no | 0 | 50 | 4 extracted, 12 needs_review, 47 missing_evidence, 8 conflict, 0 ignored |

No persisted production rows used forbidden sources as height proof.

## Match Funnel

| Job / mode | Floor gaps | Eligible exterior gaps | Gaps with measured width | Parsed W x H text | Text with page | Text with x/y | Gaps with nearby W x H | Safe matches | Height filled | Area calculated | Rows still height null |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fenner source PDF dry-run | 24 | 3 | 24 | 15 | 15 | 15 | 20 | 0 | 0 | 0 | 25 |
| Beddis source PDF dry-run | 43 | 7 | 43 | 8 | 8 | 8 | 26 | 0 | 0 | 0 | 43 |
| 15A local fresh run | 40 | 5 | 40 | 11 | 11 | 11 | 33 | 2 | 2 | 2 | 38 |
| O'Neil local fresh run | 26 | 4 | 26 | 8 | 8 | 8 | 17 | 0 | 0 | 0 | 26 |
| Christian local fresh run | 21 | 1 | 21 | 18 | 18 | 18 | 21 | 0 | 0 | 0 | 21 |

## Rejection Reasons

| Job / mode | No parsed W x H | No nearby text | Text no page/position/bbox | Wrong page | Width mismatch | Too far | Ambiguous | Interior/ineligible | Conflict row | Missing width | Other |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fenner source PDF dry-run | 0 | 0 | 0 | 0 | 3 | 0 | 0 | 21 | 0 | 0 | 0 |
| Beddis source PDF dry-run | 0 | 0 | 0 | 0 | 7 | 0 | 0 | 36 | 0 | 0 | 0 |
| 15A local fresh run | 0 | 1 | 0 | 0 | 2 | 0 | 0 | 35 | 0 | 0 | 0 |
| O'Neil local fresh run | 0 | 2 | 0 | 0 | 2 | 0 | 0 | 22 | 0 | 0 | 0 |
| Christian local fresh run | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 20 | 0 | 0 | 0 |

Dominant rejection reasons:

- `interior_or_ineligible_gap`: most detected floor gaps are not safe exterior opening rows.
- `width_mismatch`: every eligible zero-match row in Fenner and Beddis had nearby text, but no printed dimension matched the measured gap width within 50 mm.

Not observed:

- text candidate missing page;
- text candidate missing x/y;
- wrong-page rejection;
- ambiguous accepted rows;
- missing measured floor-gap width;
- area calculated from null/assumed height.

## Fenner Detail

Fresh production run:

- jobId: `ced8ec8e-51b2-4da8-b191-506477d31bb8`
- runId: `bcac8ed8-4e9b-43e3-8e36-35b3d694ece6`
- status: completed
- completed at: `2026-06-28T22:48:19.072+00:00`
- active authority: `persisted_current_run`

Dry-run on the same uploaded source PDF:

- page: 1
- parsed text candidates: 15
- text candidates with x/y: 15
- floor-gap rows: 24
- eligible exterior rows: 3
- rows with nearby `W x H` text: 20
- safe matches: 0

Eligible rejection examples:

| Gap | Gap width | Nearby text | Distance | Closest width deltas | Rejection |
| --- | ---: | --- | ---: | --- | --- |
| `floorplan-gap-1` | 2747 mm | `1100 x 1500` | 82 pt | 1247 mm / 1647 mm | width mismatch |
| `floorplan-gap-2` | 1994 mm | `2150 x 600` | 31 pt | 1394 mm / 156 mm | width mismatch |
| `floorplan-gap-3` | 381 mm | `1100 x 800` | 65 pt | 419 mm / 719 mm | width mismatch |

Fenner conclusion:

The matcher received positioned text candidates and floor-gap candidates. It rejected Fenner because the eligible measured gap widths did not match nearby printed dimensions. This is expected conservative behavior.

## Beddis Detail

Production current run:

- jobId: `6f502da2-7eac-4b84-bc27-539f772a90fe`
- runId: `712c53a1-4e4b-4ede-ba5e-11eccef0e9e6`
- active authority: `persisted_current_run`

Dry-run on the same uploaded source PDF:

- page: 1
- parsed text candidates: 8
- text candidates with x/y: 8
- floor-gap rows: 43
- eligible exterior rows: 7
- rows with nearby `W x H` text: 26
- safe matches: 0

Eligible rejection examples:

| Gap | Gap width | Nearby text | Distance | Closest width deltas | Rejection |
| --- | ---: | --- | ---: | --- | --- |
| `floorplan-gap-2` | 1913 mm | `750 x 1500` | 70 pt | 413 mm / 1163 mm | width mismatch |
| `floorplan-gap-5` | 1806 mm | `2150 x 2000` | 49 pt | 194 mm / 344 mm | width mismatch |
| `floorplan-gap-7` | 1056 mm | `2150 x 800` | 28 pt | 256 mm / 1094 mm | width mismatch |

Beddis conclusion:

Text exists and is positioned. The current floor-gap widths do not match nearby printed dimensions tightly enough to support height recovery.

## Positive 15A Proof

15A local fresh run:

- parsed text candidates: 11
- eligible exterior floor gaps: 5
- safe matches: 2
- height filled: 2
- area calculated: 2

Successful rows:

| Ledger row | Gap width | Matched text | Width delta | Height selected | Area | Before | After |
| --- | ---: | --- | ---: | ---: | ---: | --- | --- |
| `opening-floorplan-gap-3` | 1820 mm | `1300 x 1800` | 16 mm | 1300 mm | 2.37 m2 | missing_evidence, height null, area null | extracted |
| `opening-floorplan-gap-4` | 1320 mm | `1300 x 1500` | 21 mm | 1500 mm | 1.98 m2 | missing_evidence, height null, area null | extracted |

Rejected 15A examples stayed null:

- `floorplan-gap-1`: width 1909 mm, nearby `1100 x 600`, `1100 x 1200`, `1100 x 600`; rejected by width mismatch.
- `floorplan-gap-2`: width 1816 mm, no nearby text; rejected by no nearby text.
- interior/ambiguous gap rows with nearby text stayed ineligible and did not promote.

## Additional Fixture Findings

O'Neil:

- 8 parsed W x H candidates with positions.
- 4 eligible exterior gaps.
- 0 safe matches.
- 2 eligible rows had no nearby text.
- 2 eligible rows rejected by width mismatch.

Christian:

- 18 parsed W x H candidates with positions.
- 1 eligible exterior gap.
- 0 safe matches.
- the eligible row rejected by width mismatch.
- many ineligible/interior rows had nearby W x H labels, but were correctly not promoted.

## Expected Or Bug?

Expected under the current rule.

There is no evidence of a same-page text plumbing bug:

- Fenner source PDF dry-run produced 15 parsed text dimensions;
- all 15 carried x/y positions;
- all inherited page context through the active door page;
- 20 floor-gap rows had nearby text;
- no text rows were rejected for missing page or position.

The zero-match cause is conservative filtering:

- eligible exterior gap rows are low-yield;
- eligible gap widths often appear to be wall-gap spans or partial gaps that do not match the nearby printed joinery dimension;
- most nearby text labels sit near interior/ineligible floor gaps and are intentionally not used.

## Safety

Held:

- no assumed `2100` height;
- no area from unmatched text;
- no ambiguous matches accepted;
- no schedule/legacy source used;
- no pricing behavior changed;
- rows without width proof stayed null/null;
- text witness status promotion occurred only in the 15A rows with strict width match.

## Recommendation

Next implementation slice:

`2H.4 - Floor-gap width quality diagnostics for exterior opening candidates`

Goal:

Explain why many eligible exterior floor-gap widths do not match nearby printed joinery dimensions.

Scope should remain diagnostic unless a narrow bug is found. Recommended checks:

- compare floor-gap measured width against nearby physical opening/code witnesses;
- classify whether the gap width is a true opening, wall span, doorway, partial gap, or detector artefact;
- record per-gap width quality reason in diagnostics/review evidence;
- keep height and area null when width quality is not proven.

Do not widen tolerance or accept mismatched text. If the width mismatch is genuine, the next evidence path should be schedule/code witness recovery or a stronger opening-width source, not looser text matching.

## Commands Run

```powershell
git status --short --branch
Invoke-WebRequest https://www.jennianiq.nz/version.json
# Read-only Supabase authority inspection for Fenner and Beddis
# Current-code dry-run on production uploaded PDFs for Fenner and Beddis
# Current-code local fresh runs on 15A, O'Neil, and Christian fixtures
```



============================================================
FILE: docs/qa/floor-gap-width-quality-diagnostics-2026-06-29.md
============================================================

# Slice 2H.4 - Floor-Gap Width Quality Diagnostics

Date: 2026-06-29 NZT

Result: PASS WITH WARNINGS

## Scope

This diagnostic checks why eligible exterior floor-gap rows reject nearby printed `W x H`
text by width mismatch, especially on the Fenner production fresh run.

No extraction logic, detector tuning, matcher tolerance, assumed heights, pricing paths,
correction UI, `opening_schedule`, `visual_opening_audit`, `door_hits`, or correction-memory
source was used as height proof.

Scratch diagnostic output was written under:

`output/diagnostics/floor-gap-width-quality-diagnostics-2026-06-29.json`

`output/` remains untracked and is not part of this slice.

## Finding

Fenner's text-height rows are correctly rejected under the current authority rule.

The zero-match cause is not text plumbing, scale, or dimension-order interpretation. The
matcher already tests both printed dimensions against the measured floor-gap width. Fenner
fails because neither printed dimension reconciles tightly enough with the measured
eligible exterior gap widths.

The positive 15A fixture proves the path can work when the floor-gap width and one printed
dimension represent the same opening quantity:

- 15A `floorplan-gap-3`: 1816 mm measured gap vs `1300 x 1800`, 16 mm delta, accepted.
- 15A `floorplan-gap-4`: 1321 mm measured gap vs `1300 x 1500`, 21 mm delta, accepted.

Fenner has no near-threshold 51-100 mm rows. Its best eligible deltas are 156 mm, 419 mm,
and 1247 mm. That is too loose for automatic height recovery.

## Jobs Inspected

| Job | Mode | runId | PDF/source |
| --- | --- | --- | --- |
| JM-CODEX Fenner fresh production source PDF | current-code dry-run | `bcac8ed8-4e9b-43e3-8e36-35b3d694ece6` | `tests/doors/plans/fenner-floorplan.pdf` |
| 15A floorplan fixture positive proof | local current-code fresh run | n/a | `tests/fixtures/15a/floorplan.pdf` |
| JM-0005 Beddis source PDF | current-code dry-run | `712c53a1-4e4b-4ede-ba5e-11eccef0e9e6` | `tests/fixtures/beddis/concept-floorplan.pdf` |
| O'Neil floorplan fixture | local current-code fresh run | n/a | `tests/fixtures/oneil/floorplan.pdf` |
| Christian floorplan page6 fixture | local current-code fresh run | n/a | `tests/fixtures/christian/floorplan-page6.pdf` |

JM-0060 was not rerun or mutated.

## Aggregate Summary

Tolerance: 50 mm width delta. Maximum text-to-gap distance: 90 PDF points.

| Job | Floor gaps | Eligible exterior gaps | Eligible with nearby WxH | Accepted | Rejected mismatch | No nearby | Min delta | Median delta | Max delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fenner | 24 | 3 | 3 | 0 | 3 | 0 | 156 | 419 | 1247 |
| 15A | 40 | 5 | 4 | 2 | 2 | 1 | 16 | 47 | 709 |
| Beddis | 43 | 7 | 7 | 0 | 7 | 0 | 194 | 413 | 3945 |
| O'Neil | 26 | 4 | 2 | 0 | 2 | 2 | 331 | 481 | 631 |
| Christian | 21 | 1 | 1 | 0 | 1 | 0 | 1569 | 1569 | 1569 |

Combined eligible exterior rows:

| Band | Count |
| --- | ---: |
| 0-50 mm | 2 |
| 51-100 mm | 1 |
| 101-250 mm | 2 |
| 251-500 mm | 5 |
| 500 mm+ | 7 |
| No nearby WxH | 3 |

Combined median width delta for rows with nearby text: 413 mm.

## Cause Classification

| Cause | Result | Notes |
| --- | --- | --- |
| A. floor-gap width measurement error | Partial, not systemic | 15A accepted rows show the gap detector can measure opening widths accurately when the candidate is the same opening. Some rejected rows are likely partial or different wall breaks, but this is not a global scale bug. |
| B. wrong wall/face/room routing | Contributes outside eligible rows | Most low-confidence/interior gaps stay ineligible. Fenner's three inspected eligible rows have medium routing, so routing is not the primary reason those rows reject. |
| C. text dimension order/interpretation issue | Not supported | The matcher checks both printed dimensions. Fenner still misses because neither dimension is within 50 mm. |
| D. text dimension refers to a different unit size | Supported | Many nearest text labels appear to describe a different joinery unit or another quantity than the detected gap span. |
| E. gap candidate is not the matching opening | Supported | Small/partial gaps and large wall breaks sit near WxH text but do not reconcile as joinery widths. |
| F. scale/coordinate issue | Not supported | 15A produces 16 mm and 21 mm deltas under the same current-code scale path. Fenner/Beddis deltas are not a uniform scale offset. |
| G. matcher too strict | Not for Fenner | Fenner has no 51-100 mm near-miss rows. 15A has one 72 mm row, but widening would risk accepting unproven text. |
| H. matcher correctly rejecting unsafe evidence | Dominant | This is the safest reading for Fenner, Beddis, O'Neil, and Christian under the current proof rule. |

## Accepted Examples

| Job | Row | Page | Bbox | Wall/room | Gap width | Text | Distance | Matched dimension | Delta | Height selected | Why accepted |
| --- | --- | ---: | --- | --- | ---: | --- | ---: | --- | ---: | ---: | --- |
| 15A | `floorplan-gap-3` | 1 | `[899.246,631.62,902.22,683.1]` | `V-150`, MASTERBED, west | 1816 mm | `1300 x 1800` | 66 pt | second, 1800 mm | 16 mm | 1300 mm | Exterior wall break and printed dimension reconcile within tolerance. |
| 15A | `floorplan-gap-4` | 1 | `[899.246,205.74,902.22,243.18]` | `V-150`, DINING, west | 1321 mm | `1300 x 1500` | 38 pt | first, 1300 mm | 21 mm | 1500 mm | Exterior wall break and printed dimension reconcile within tolerance. |

These are the rows that prove the intended text witness rule: height is selected only after
a printed dimension matches the measured floor-gap width.

## Rejected Examples

| Job | Row | Page | Bbox | Wall/room | Gap width | Nearby text | Distance | Closest dimension | Delta | Rejection reason | Visual read |
| --- | --- | ---: | --- | --- | ---: | --- | ---: | --- | ---: | --- | --- |
| Fenner | `floorplan-gap-1` | 1 | `[665.554,106.62,667.755,184.5]` | `V-111`, PANTRY, west | 2747 mm | `1100 x 1500` | 82 pt | second, 1500 mm | 1247 mm | Large mismatch | Plausible wall break with nearby text, but the width evidence does not reconcile. |
| Fenner | `floorplan-gap-2` | 1 | `[310.5,638.46,313.035,694.98]` | `V-52`, ENSUITE, east | 1994 mm | `2150 x 600` | 31 pt | first, 2150 mm | 156 mm | Moderate mismatch | Plausible wall break, but accepting would be unsafe and may select a 600 mm height from the other dimension. |
| Fenner | `floorplan-gap-3` | 1 | `[205.058,684.18,208.698,694.98]` | `V-34`, ENSUITE, east | 381 mm | `1100 x 800` | 65 pt | second, 800 mm | 419 mm | Small/partial wall break | Too small to treat as joinery width without another witness. |
| Beddis | `floorplan-gap-5` | 1 | `[363.443,247.86,366.42,299.04]` | `V-61`, BED2, east | 1806 mm | `2150 x 2000` | 49 pt | second, 2000 mm | 194 mm | Moderate mismatch | Nearby text exists, but width evidence does not reconcile. |
| O'Neil | `floorplan-gap-3` | 1 | `[433.878,209.88,436.724,261.78]` | `V-73`, ENS., east | 1831 mm | `1300 x 1500` | 88 pt | second, 1500 mm | 331 mm | Large mismatch | Plausible wall break, but not safe proof. |
| Christian | `floorplan-gap-1` | 1 | `[467.46,92.073,588.48,97.887]` | `H-16`, Bed 1, south | 4269 mm | `2110 x 2700` | 61 pt | second, 2700 mm | 1569 mm | Large mismatch | The gap span is not the printed joinery width. |

## Critical Comparison

| Case | Measured gap | Printed text | Closest printed dimension | Delta | Outcome |
| --- | ---: | --- | ---: | ---: | --- |
| 15A accepted | 1816 mm | `1300 x 1800` | 1800 mm | 16 mm | Safe text witness. Height 1300 mm, area can be calculated from witnessed width and height. |
| Fenner rejected | 1994 mm | `2150 x 600` | 2150 mm | 156 mm | Unsafe. This is not a small tolerance miss, and the other dimension would imply a 600 mm height if accepted. |
| Fenner rejected | 381 mm | `1100 x 800` | 800 mm | 419 mm | Unsafe. The gap is a small/partial break, not proved to be the opening width. |

Fenner does not need a looser text matcher. The current matcher is preventing unsupported
height and area from entering the active ledger.

## Fenner Decision

Fenner's mismatch should be treated as correct rejection for now.

There is no evidence that:

- text coordinates are missing;
- page routing is broken;
- the floor-plan scale is globally wrong;
- dimension order is misunderstood;
- widening from 50 mm would safely recover Fenner.

There is evidence that:

- eligible exterior gaps exist;
- nearby WxH text exists;
- the measured gap widths often describe a different span than the printed dimensions;
- at least one gap is a small/partial break that should not become a joinery opening;
- height and area must remain null unless another current-run witness proves the row.

## Safety Checks

Held:

- no assumed height;
- no area from mismatched text;
- no ambiguous matches accepted;
- no schedule/legacy source used as proof;
- no pricing or QS workbook path touched;
- no production matching behavior changed;
- rejected rows stay null/null for height and area.

## Recommendation

Next slice:

`2H.5 - Current-run schedule/code/elevation witness recovery for floor-gap rows`

Why:

Text-to-gap matching is already doing the safe thing for Fenner. The product pain is still
real, but the next safe evidence source is not looser proximity or wider tolerance. The next
slice should audit and then implement a narrow current-run witness path that can prove height
from schedule/code/elevation evidence while preserving:

- active run scope;
- original floor-gap ledger row id;
- page/bbox evidence where available;
- unknown dimensions as null;
- `needs_review` or `missing_evidence` unless proof is direct;
- no legacy authority leakage.

Do not build human correction workflow yet. Do not widen text matching. Do not promote any
Fenner row from these rejected WxH examples.

## Commands Run

```powershell
git status --short
git branch --show-current
Get-Content C:\Users\Haydon\.codex\attachments\bdca6ac9-e180-4b41-8cd8-3fbaff1433db\pasted-text.txt
npx tsx - # diagnostic-only current-code probe over Fenner, 15A, Beddis, O'Neil, Christian
```



============================================================
FILE: docs/qa/fenner-opening-label-assignment-audit-2026-06-29.md
============================================================

# Slice 2H.5-A - Fenner Floor-Plan Opening Label Assignment Audit

Date: 2026-06-29 NZT

Result: PASS WITH WARNINGS

## Scope

This audit pauses schedule/code/elevation witness implementation and inspects Fenner's
printed floor-plan `W x H` labels against floor-gap candidates, wall/face proximity, and
dimension-like elevation evidence.

No matcher tolerance was widened. No height was assumed. No `opening_schedule`,
`visual_opening_audit`, `door_hits`, correction memory, pricing path, or QS workbook path
was used as authority. No glass area was calculated from these labels.

Scratch visual/diagnostic outputs:

- `output/diagnostics/fenner-opening-label-assignment-audit-2026-06-29.png`
- `output/diagnostics/fenner-opening-label-assignment-audit-2026-06-29.json`

`output/` remains untracked.

## Finding

Fenner's printed floor-plan opening dimensions are real useful evidence, but the current
floor-gap candidate layer is not enough to safely assign them by proximity alone.

The audit found:

- 15 parsed floor-plan `W x H` labels.
- 0 labels were `SAFE_BY_WIDTH_MATCH`.
- 0 labels were `SAFE_BY_FACE_ORDER`.
- 7 labels were `NEEDS_ELEVATION_CHECK`.
- 8 labels were `AMBIGUOUS`.

That means a broad text-dominant assignment mode is not safe yet. The next safe step is a
face/order/elevation crosswalk, not a tolerance increase and not blind nearest-label matching.

## Verdict Counts

| Verdict | Count | Meaning in this audit |
| --- | ---: | --- |
| `SAFE_BY_WIDTH_MATCH` | 0 | Current strict text-to-gap rule proves the row. |
| `SAFE_BY_FACE_ORDER` | 0 | Wall face/order/proximity alone proves a unique row assignment. |
| `NEEDS_ELEVATION_CHECK` | 7 | Label may be real and has similar elevation dimensions, but row assignment is not proven. |
| `AMBIGUOUS` | 8 | Label is not row-safe from floor-plan geometry/proximity. |
| `REJECT` | 0 | No label is discarded as a printed label; unsafe nearest-row pairings are rejected in notes. |

## Assignment Map

The scratch PNG labels each parsed floor-plan dimension `L1` through `L15` and connects it
to the nearest exterior floor-gap candidate. Colors in the PNG are diagnostic only; the
table below is the controlling verdict.

| Label | Text | Position | Likely wall/face | Nearest exterior candidate | Gap width | Printed width | Closest dim | Delta | Elevation correspondence | Verdict |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| L1 | `1300 x 2400` | `(363.2, 175.3)` | `H-30` top wall | `floorplan-gap-24` | 398 | 2400 | 1300 | 902 | none | `AMBIGUOUS` |
| L2 | `1300 x 2400` | `(477.4, 175.3)` | `H-30` top wall | `floorplan-gap-24` | 398 | 2400 | 1300 | 902 | none | `AMBIGUOUS` |
| L3 | `1100 x 1500` | `(583.6, 175.3)` | `H-30` top wall | `floorplan-gap-1` | 2747 | 1500 | 1500 | 1247 | face-10 window `1554 x 999` | `NEEDS_ELEVATION_CHECK` |
| L4 | `700 x 3000` | `(713.1, 370.1)` | `H-61` wall band | `floorplan-gap-17` | 1848 | 3000 | 700 | 1148 | face-20 window `3048 x 597` | `NEEDS_ELEVATION_CHECK` |
| L5 | `2150 x 400` | `(613.3, 399.9)` | `V-96` wall band | `floorplan-gap-17` | 1848 | 400 | 2150 | 302 | none | `AMBIGUOUS` |
| L6 | `1300 x 1500` | `(649.9, 470.1)` | `V-107` wall band | `floorplan-gap-17` | 1848 | 1500 | 1500 | 348 | none | `AMBIGUOUS` |
| L7 | `2150 x 600` | `(344.2, 653.5)` | `H-107` bottom wall | `floorplan-gap-2` | 1994 | 600 | 2150 | 156 | face-10 window `601 x 2049`; face-5 windows near `600 x 2040/2049` | `NEEDS_ELEVATION_CHECK` |
| L8 | `1100 x 600` | `(420.4, 653.5)` | `H-107` bottom wall | `floorplan-gap-11` | 1960 | 600 | 1100 | 860 | face-1 windows around `656 x 1143` | `NEEDS_ELEVATION_CHECK` |
| L9 | `1100 x 1200` | `(467.1, 653.5)` | `H-107` bottom wall | `floorplan-gap-11` | 1960 | 1200 | 1200 | 760 | face-1 windows around `1177/1181 x 1190` | `NEEDS_ELEVATION_CHECK` |
| L10 | `1300 x 1500` | `(548.0, 653.5)` | `H-107` bottom wall | `floorplan-gap-11` | 1960 | 1500 | 1500 | 460 | none | `AMBIGUOUS` |
| L11 | `1100 x 800` | `(200.8, 619.8)` | `V-34` left wall | `floorplan-gap-3` | 381 | 800 | 800 | 419 | face-4 window `821 x 1079`; face-1 windows around `796 x 944` | `NEEDS_ELEVATION_CHECK` |
| L12 | `1100 x 800` | `(200.8, 535.8)` | `V-34` left wall | `floorplan-gap-3` | 381 | 800 | 800 | 419 | face-4 window `821 x 1079`; face-1 windows around `796 x 944` | `NEEDS_ELEVATION_CHECK` |
| L13 | `1300 x 2400` | `(723.2, 578.1)` | `V-119` right/lower wall | `floorplan-gap-23` | 402 | 2400 | 1300 | 898 | none | `AMBIGUOUS` |
| L14 | `780 x 1400` | `(238.9, 330.6)` | `V-50` left wall | `floorplan-gap-24` | 398 | 1400 | 780 | 382 | none | `AMBIGUOUS` |
| L15 | `780 x 1400` | `(238.8, 239.4)` | `V-50` left wall | `floorplan-gap-24` | 398 | 1400 | 780 | 382 | none | `AMBIGUOUS` |

## Focused Rejected Pairs

### 156 mm Case

Label `L7`, `2150 x 600`, is the best candidate for future recovery:

- nearest exterior candidate: `floorplan-gap-2`;
- gap width: 1994 mm;
- closest printed dimension: 2150 mm;
- delta: 156 mm;
- elevation-sized evidence exists: e.g. `601 x 2049` and similar `600 x 2040/2049` openings.

This is not safe for the current matcher, but it is worth a face/order/elevation check. It
also exposes a dimension-order hazard: a naive width-flexible matcher could treat 2150 mm
as the gap width and accidentally select 600 mm as height. Any future text-dominant mode
must explicitly preserve the printed dimension semantics instead of letting the current
"either side may be width" rule choose height.

Verdict: `NEEDS_ELEVATION_CHECK`, not safe yet.

### 419 mm Cases

Labels `L11` and `L12`, both `1100 x 800`, are close to `floorplan-gap-3`:

- nearest exterior candidate: `floorplan-gap-3`;
- gap width: 381 mm;
- closest printed dimension: 800 mm;
- delta: 419 mm;
- elevation-sized evidence exists: face-4 window around `821 x 1079`.

The gap candidate is likely a small/partial wall break, not a reliable joinery width. The
label may still describe a real opening, but assigning it to `floorplan-gap-3` is not safe.

Verdict: `NEEDS_ELEVATION_CHECK`; nearest-gap pairing is not accepted.

### 1247 mm Case

Label `L3`, `1100 x 1500`, is near `floorplan-gap-1`:

- nearest exterior candidate: `floorplan-gap-1`;
- gap width: 2747 mm;
- closest printed dimension: 1500 mm;
- delta: 1247 mm;
- elevation-sized evidence exists only as a loose dimension correspondence.

The nearest-gap association is probably wrong. This should not become a text-to-gap
assignment. If recovered later, it needs face/order/elevation proof independent of this
nearest floor-gap pairing.

Verdict: `NEEDS_ELEVATION_CHECK`; nearest-gap pairing rejected.

## Decision

Do not implement broad text-label assignment mode yet.

The audit supports the product hypothesis that printed floor-plan labels should become
primary dimension witnesses when they can be assigned, but Fenner does not yet prove a safe
`SAFE_BY_FACE_ORDER` row. Most useful rows need an elevation/face-order crosswalk first.

Recommended next slice:

`2H.5-B - Fenner floor-label to elevation face-order crosswalk audit`

That slice should:

- group floor-plan labels by exterior wall band/order;
- group elevation vector openings by face/order and dimension;
- identify exact label-to-elevation correspondences;
- only then decide whether a `SAFE_BY_FACE_ORDER` assignment mode exists;
- keep floor-gap row height/area null unless the assignment is unique and current-run scoped.

If 2H.5-B proves a unique face/order mapping, implement a narrow text-label assignment mode.
If it remains ambiguous, proceed to elevation/garage-anchor recovery or human correction
design, not wider text matching.

## Safety

Held:

- no assumed heights;
- no area calculation;
- no tolerance widening;
- no legacy authority path;
- no pricing or QS workbook change;
- no status promotion;
- no production extraction behavior changed.

## Commands Run

```powershell
git status --short
npx tsx - # diagnostic-only Fenner label/gap/elevation map
node --input-type=module # normalize scratch map verdict colors
```



============================================================
FILE: docs/qa/fenner-automatic-recovery-scorecard-2026-06-29.md
============================================================

# Fenner Automatic Recovery Scorecard

Date: 2026-06-29 NZT

Result: PASS WITH WARNINGS

## Scope

This is a product scorecard, not an architecture slice.

Goal: measure how many Fenner exterior openings are automatically recovered from clean
current evidence, and how many are correctly left for review.

No detectors were tuned. No tolerances were widened. No heights were assumed. Pricing,
QS export, correction UI, `opening_schedule`, `visual_opening_audit`, `door_hits`, and
correction memory were not used as active authority.

The Fenner manual fixture is used only as a benchmark denominator for this scorecard. It is
not active extraction authority.

## Executive Score

Benchmark exterior opening rows: 17 rows, 18 total units.

| Metric               |            Count | Meaning                                                                                      |
| -------------------- | ---------------: | -------------------------------------------------------------------------------------------- |
| Auto recovered clean | 8 rows / 9 units | Complete width + height + area recovered from clean floor-plan W x H label evidence.         |
| Review required      |           8 rows | Useful evidence exists, but assignment, assembly, or opening type proof is not clean enough. |
| Missing/conflict     |            1 row | Evidence is missing or not enough to construct the row.                                      |
| False positives      |                0 | Skylight labels are excluded from exterior wall opening candidates.                          |

Current parser/recovery detail:

- parsed floor-plan opening labels: 13;
- clean label evidence rows: 9;
- clean recovered label area: 17.63 m2;
- retained label-review rows: 4;
- parsed skylight labels: 0.

## Status Definitions

| Status                   | Meaning                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `auto_recovered_clean`   | Current safe evidence recovers row, dimensions, and area without review.                |
| `recovered_needs_review` | Useful dimension evidence exists, but row/face/order/type assignment is not yet safe.   |
| `dirty_assembly_review`  | Assembly or drafting issue is visible; automatic split/merge would be unsafe.           |
| `missing_evidence`       | A benchmark opening lacks enough current-run evidence for dimensions or row assignment. |
| `conflict`               | Parsed evidence likely describes something other than an exterior opening.              |

## Scorecard Rows

Width/height/area below are diagnostic candidate values only. Clean rows are now projected
through the active Extracted Quantity ledger as evidence-only `pdf_text` rows with `priced:
false`; existing QS/pricing workbook behaviour is unchanged.

| Row id         | Location / room | Type                             | Printed label used                  | Width mm | Height mm | Area m2 | Status                   | Reason                                                                                                  | Evidence                                                                                                                     |
| -------------- | --------------- | -------------------------------- | ----------------------------------- | -------: | --------: | ------: | ------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `fenner-sc-01` | Bed 1           | window, qty 2                    | `floorplan-label-11/12: 1100 x 800` |      800 |      1100 |    1.76 | `auto_recovered_clean`   | Two clean labels assigned to `MASTERBED` by unique room proximity/order.                                | floor-plan text labels with page+bbox; no assumed height; no pricing write.                                                  |
| `fenner-sc-02` | Bed 1           | slider                           | none clean                          |     null |      null |    null | `recovered_needs_review` | Large opening has width/elevation evidence but no clean floor-plan HxW label assignment.                | width-only `2400`; elevation sliders around `2400 x 2050/2070`; floor bbox not row-safe.                                     |
| `fenner-sc-03` | Ensuite         | window                           | `floorplan-label-7: 2150 x 600`     |      600 |      2150 |    1.29 | `auto_recovered_clean`   | Post-commit follow-up proved this is a clean full-height narrow exterior opening label.                 | floor-plan text label with page+bbox; unique ENSUITE room proximity; elevation `601 x 2049` corroboration; no pricing write. |
| `fenner-sc-04` | Bed 2           | window                           | `floorplan-label-10: 1300 x 1500`   |     1500 |      1300 |    1.95 | `auto_recovered_clean`   | Clean W x H label assigned to `BED2` by unique room proximity/order.                                    | floor-plan text label with page+bbox; no assumed height; no pricing write.                                                   |
| `fenner-sc-05` | Bed 3           | window                           | `floorplan-label-13: 1300 x 2400`   |     2400 |      1300 |    3.12 | `auto_recovered_clean`   | Clean W x H label assigned to `BED3` by unique room proximity/order.                                    | floor-plan text label with page+bbox; no assumed height; no pricing write.                                                   |
| `fenner-sc-06` | Bed 4           | window                           | `floorplan-label-6: 1300 x 1500`    |     1500 |      1300 |    1.95 | `auto_recovered_clean`   | Clean W x H label assigned to `STUDY/BED4` by unique room proximity/order.                              | floor-plan text label with page+bbox; no assumed height; no pricing write.                                                   |
| `fenner-sc-07` | Toilet          | window                           | `floorplan-label-8: 1100 x 600`     |      600 |      1100 |    null | `recovered_needs_review` | Small/narrow label remains visible but outside the clean dimension band.                                | floor-plan text label retained as needs-review evidence; no clean area.                                                      |
| `fenner-sc-08` | Bathroom        | window                           | `floorplan-label-9: 1100 x 1200`    |     1200 |      1100 |    1.32 | `auto_recovered_clean`   | Clean W x H label assigned to `BATH` by unique room proximity/order.                                    | floor-plan text label with page+bbox; no assumed height; no pricing write.                                                   |
| `fenner-sc-09` | Kitchen         | window                           | `floorplan-label-3: 1100 x 1500`    |     1500 |      1100 |    null | `recovered_needs_review` | Label is usable evidence but room/order assignment is ambiguous near Dining/Kitchen.                    | floor-plan text label retained as needs-review evidence; no clean area.                                                      |
| `fenner-sc-10` | Family          | window                           | `floorplan-label-1: 1300 x 2400`    |     2400 |      1300 |    3.12 | `auto_recovered_clean`   | Clean W x H label assigned to `FAMILY` by unique room proximity/order.                                  | floor-plan text label with page+bbox; no assumed height; no pricing write.                                                   |
| `fenner-sc-11` | Family          | slider / overlight assembly      | malformed/width-only, no clean HxW  |     null |      null |    null | `dirty_assembly_review`  | Expected dirty architect target. The label/assembly is not a clean single opening row.                  | drafting issue `1300x175036001300x1750`; width-only `3000`; no row-safe clean HxW label.                                     |
| `fenner-sc-12` | Dining          | window                           | `floorplan-label-2: 1300 x 2400`    |     2400 |      1300 |    3.12 | `auto_recovered_clean`   | Clean W x H label assigned to `DINING` by unique room proximity/order.                                  | floor-plan text label with page+bbox; no assumed height; no pricing write.                                                   |
| `fenner-sc-13` | Lounge          | slider                           | none clean                          |     null |      null |    null | `recovered_needs_review` | Elevation and width-only evidence exist, but no clean floor-plan HxW label row is assigned.             | width-only `3600`; elevation face-4 sliders around `3581/3598 x 2050/2125`.                                                  |
| `fenner-sc-14` | Garage Windows  | window                           | none clean                          |     2000 |      null |    null | `missing_evidence`       | Width-only text exists, but height is not proven by a current clean floor-plan/elevation row.           | width-only `2000`; no safe HxW label; no close elevation check.                                                              |
| `fenner-sc-15` | Garage Windows  | window                           | `floorplan-label-4: 700 x 3000`     |     3000 |       700 |    null | `recovered_needs_review` | Large/narrow garage-window label remains review-only and excluded from clean area.                      | floor-plan text label with page+bbox; no clean area.                                                                         |
| `fenner-sc-16` | Garage Door 1   | garage door                      | none clean                          |     null |      null |    null | `recovered_needs_review` | Type and dimensions are visible in elevation/width-only evidence, but garage-door handling is separate. | width-only `4800`; elevation face-5 garage door approx `4873 x 2100`.                                                        |
| `fenner-sc-17` | Entrance        | front entry / sidelight assembly | none clean                          |     null |      null |    null | `dirty_assembly_review`  | Expected dirty architect target. Current floor-plan text does not provide a safe clean row.             | width-only `1400` nearby; no clean HxW; no safe elevation correspondence.                                                    |

## False-Positive / Conflict Candidates

| Candidate       | Parsed text                 | Status    | Reason                                                                             |
| --------------- | --------------------------- | --------- | ---------------------------------------------------------------------------------- |
| Skylight labels | `780 x 1400`, two instances | `ignored` | Nearby `Skylight` text excludes both labels from exterior wall opening candidates. |

## Exact Review Targets

Highest-value review targets:

1. `fenner-sc-11` - Family slider / overlight assembly.
2. `fenner-sc-17` - Front entry / sidelight assembly.
3. `fenner-sc-09` - Kitchen `1100 x 1500`, because room/order assignment remains ambiguous near Dining/Kitchen.

Secondary review targets:

- `fenner-sc-07` Toilet `1100 x 600`, retained because the narrow 600 mm label is outside the current clean band;
- large sliders and garage openings that rely on width-only/elevation evidence.

## Product Decision

Slice 2H.5 moved Fenner from:

- automatic clean recovery rate: 0/17 rows;
- skylight false positives: 2.

to:

- automatic clean recovery rate: 8/17 rows, 9/18 units;
- clean floor-plan W x H labels recovered: 9;
- skylight false positives: 0;
- dirty assemblies still review-only;
- no guessed heights;
- no assumed 2100;
- no legacy authority used;
- no pricing behaviour changed.

PASS WITH WARNINGS because the clean recovery is deliberately narrow. Several real openings still need
schedule/elevation/visual proof or human review before they can become clean ledger rows.

Recommended next product slice:

`2H.6 - recover or flag the remaining review targets by evidence class`

Do not broaden the clean floor-plan label rule. The next useful improvements should be one of:

- elevation/face-order proof for large sliders and garage openings;
- explicit dirty-assembly review labelling for Family slider/overlight and front entry/sidelight;
- a targeted small-window review rule for `1100 x 600` only if backed by stronger face/elevation proof.

## Post-Commit Follow-Up Audit

Date: 2026-06-29 NZT

Result: PASS WITH WARNINGS

This follow-up audited commit `5bb0dfdacc1f120c5bc683e60320ccc254b33c46` and then applied one
narrow safe fix for the Ensuite `2150 x 600` label. No detector, pricing, correction UI,
`opening_schedule`, `visual_opening_audit`, or `door_hits` authority was used.

Automatic Recovery Rate after follow-up:

- Auto recovered clean: 8 rows / 9 units.
- Review required: 8 rows.
- Missing/conflict: 1 row.
- False positives: 0.

### Recovered Clean Row Audit

All rows below enter the active Extracted Quantity ledger as `pdf_text` evidence-only opening
rows with `priced: false`. Source authority is the current floor-plan text label. Nearest
floor-gap and elevation notes are audit context only unless explicitly stated; they do not write
QS/pricing cells.

| Row             | Label evidence                      | Width | Height | Area | Page/bbox                          | Association audit                                                                                                                                                                                        | Authority check                                                                               |
| --------------- | ----------------------------------- | ----: | -----: | ---: | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Family window   | `floorplan-label-1`, `1300 x 2400`  |  2400 |   1300 | 3.12 | p1 `[345.17,168.32,381.17,182.32]` | Unique room proximity to `FAMILY`; no nearby drafting issue; nearest floor-gap mismatch is ignored rather than used.                                                                                     | `pdf_text` only; no schedule, visual audit, or door-hit authority.                            |
| Dining window   | `floorplan-label-2`, `1300 x 2400`  |  2400 |   1300 | 3.12 | p1 `[459.41,168.32,495.41,182.32]` | Unique room proximity to `DINING`; no nearby drafting issue; nearest floor-gap mismatch is ignored rather than used.                                                                                     | `pdf_text` only; no schedule, visual audit, or door-hit authority.                            |
| Bed 4 window    | `floorplan-label-6`, `1300 x 1500`  |  1500 |   1300 | 1.95 | p1 `[631.92,463.11,667.92,477.11]` | Unique room proximity to `STUDY/BED4`; normal clean dimension band; no contaminated assembly text nearby.                                                                                                | `pdf_text` only; no schedule, visual audit, or door-hit authority.                            |
| Ensuite window  | `floorplan-label-7`, `2150 x 600`   |   600 |   2150 | 1.29 | p1 `[326.19,646.52,362.19,660.52]` | Unique room proximity to `ENSUITE`; clean full-height narrow band; nearest exterior gap is `V-52`/`floorplan-gap-2`; elevation vector candidate `601 x 2049` corroborates a same-sized external opening. | `pdf_text` clean row; no assumed height, no schedule, no visual audit, no door-hit authority. |
| Bathroom window | `floorplan-label-9`, `1100 x 1200`  |  1200 |   1100 | 1.32 | p1 `[449.09,646.52,485.09,660.52]` | Unique room proximity to `BATH`; normal clean dimension band; elevation vector candidates around `1177/1181 x 1190` provide supporting context.                                                          | `pdf_text` only; no schedule, visual audit, or door-hit authority.                            |
| Bed 2 window    | `floorplan-label-10`, `1300 x 1500` |  1500 |   1300 | 1.95 | p1 `[529.97,646.52,565.97,660.52]` | Unique room proximity to `BED2`; normal clean dimension band; no contaminated assembly text nearby.                                                                                                      | `pdf_text` only; no schedule, visual audit, or door-hit authority.                            |
| Bed 1 window A  | `floorplan-label-11`, `1100 x 800`  |   800 |   1100 | 0.88 | p1 `[182.76,612.77,218.76,626.77]` | Unique room proximity to `MASTERBED`; normal clean dimension band; elevation vector candidate `821 x 1079` supports same opening size.                                                                   | `pdf_text` only; no schedule, visual audit, or door-hit authority.                            |
| Bed 1 window B  | `floorplan-label-12`, `1100 x 800`  |   800 |   1100 | 0.88 | p1 `[182.76,528.77,218.76,542.77]` | Unique room proximity to `MASTERBED`; normal clean dimension band; elevation vector candidate `821 x 1079` supports same opening size.                                                                   | `pdf_text` only; no schedule, visual audit, or door-hit authority.                            |
| Bed 3 window    | `floorplan-label-13`, `1300 x 2400` |  2400 |   1300 | 3.12 | p1 `[705.24,571.11,741.24,585.11]` | Unique room proximity to `BED3`; normal clean dimension band; no contaminated assembly text nearby.                                                                                                      | `pdf_text` only; no schedule, visual audit, or door-hit authority.                            |

### Remaining Review Row Audit

- Family slider/overlight remains review-required. Evidence includes malformed/contaminated text
  `1300x175036001300x1750` plus width-only `3600`; this is a multi-part assembly-style annotation,
  not one clean W x H row, so no merged glass area is created.
- Front entry/sidelight remains review-required. Raw text includes `1030`, `1400`, and
  `2150x400`; `1030` is not used as an assumed height or width, and `2150 x 400` remains too narrow
  for the clean full-height band.
- Kitchen `1100 x 1500` remains review-required because nearest room/order assignment is ambiguous
  near Dining/Kitchen, and the nearest exterior gap width is a poor match.
- Toilet `1100 x 600` remains review-required because the label is narrow but not a full-height
  1900-2200 mm opening, and it has ambiguous room proximity around Ensuite/Bath.
- Garage `700 x 3000`, garage door, and large sliders remain review-required because they rely on
  width-only or elevation/garage evidence classes outside this clean floor-plan label slice.

### Missing/Conflict Audit

- `fenner-sc-14` Garage Windows remains the single missing/conflict row. The current safe evidence is
  width-only `2000`; there is no clean current floor-plan W x H row and no direct safe height witness
  in this slice. Height and area remain null.

### False-Positive Audit

- Raw `780 x 1400` labels with nearby `Skylight` text are present in the source PDF, but parser
  output contains zero `780 x 1400` exterior opening window codes. They produce no clean row, no
  exterior opening review target, no pricing write, and false positives remain 0.

### Follow-Up Decision

The score changed after the follow-up:

- before: 7 clean rows / 8 units, 9 review rows, 1 missing/conflict;
- after: 8 clean rows / 9 units, 8 review rows, 1 missing/conflict.

Ensuite `2150 x 600` is now clean recovered because it is a witnessed floor-plan label with unique
room assignment and corroborating same-size elevation evidence. The dirty assemblies and skylights
remain contained.

## Remaining Review / Conflict Inventory

Date: 2026-06-29 NZT

Result: PASS WITH WARNINGS

This inventory rechecked every remaining non-clean Fenner benchmark row after the safe Ensuite
recovery. It used current floor-plan text, floor-gap candidates, and vector elevation candidates as
diagnostic context. It did not use `opening_schedule`, `visual_opening_audit`, or `door_hits` as
authority, and it did not change pricing, detector tolerances, or correction UI.

Automatic Recovery Rate after this inventory:

- Auto recovered clean: 8 rows / 9 units.
- Review required: 8 rows.
- Missing/conflict: 1 row.
- False positives: 0.

Remaining review classifications:

- Correctly review-required: 5 rows.
- Safely recoverable misses fixed: 0 rows.
- Missing usable evidence: 3 rows.
- Benchmark/source ambiguity: 1 row.
- Non-exterior/excluded: 0 rows.

Dirty architect annotations among the remaining rows: 2 rows (`fenner-sc-11`, `fenner-sc-17`).
Realistic clean floor-plan label recovery ceiling on Fenner under the current rule is therefore
8/17 benchmark rows, 9/18 units. Further recovery needs a separate evidence-class slice
(face/elevation/garage anchors or human review), not wider label matching.

| Row            | Benchmark opening                         | Qty | Current status   | Source label / text                                                    | Parsed W x H                                | Area | Page/bbox                                                                    | Nearby room / annotation text                                                                           | Exterior wall / face relationship                                                                                                                         | Associated opening candidate                                                                                                                                                         | Why not clean-recovered                                        | Classification                                                                                       | Authority check                                                                               |
| -------------- | ----------------------------------------- | --: | ---------------- | ---------------------------------------------------------------------- | ------------------------------------------- | ---- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `fenner-sc-02` | Bed 1 slider                              |   1 | review-required  | width-only `2400`                                                      | width 2400, height null                     | null | width text p1 near `(258.2,504.5)`                                           | nearest room `MASTERBED`; nearby `1100x800` and room footprint text                                     | vector elevation has slider candidates around `2400 x 2049/2070`; nearest floor gap routes elsewhere and does not prove this opening row                  | no clean floor-plan W x H label row; width-only text cannot calculate area                                                                                                           | Needs a height/type/face witness outside the clean-label rule. | missing usable evidence                                                                              | floor-plan width/elevation diagnostic only; no schedule, visual audit, or door-hit authority. |
| `fenner-sc-07` | Toilet window                             |   1 | review-required  | `floorplan-label-8: 1100 x 600`                                        | 600 x 1100                                  | null | p1 `[402.39,646.52,438.39,660.52]`                                           | nearby `WC`, `ENSUITE`, `BATH`; nearest parsed rooms are `ENSUITE` 65 pt and `BATH` 73 pt               | nearest exterior gap `floorplan-gap-11` is low-confidence/ambiguous near `BATH`/`BED2`; elevation has several `656 x 1143` candidates                     | label is explicit, but it is a narrow low-height row with ambiguous room/face assignment; accepting it would turn a likely toilet/bath cluster into a clean row without enough proof | correctly review-required                                      | floor-plan label exists; no schedule, visual audit, or door-hit authority used.                      |
| `fenner-sc-09` | Kitchen window                            |   1 | review-required  | `floorplan-label-3: 1100 x 1500`                                       | 1500 x 1100                                 | null | p1 `[565.61,168.32,601.61,182.32]`                                           | nearby `PANTRY`, `DINING`, `KITCHEN`; closest parsed room is `PANTRY`, with Dining/Kitchen split nearby | nearest exterior gap `floorplan-gap-1` routes to `PANTRY` and measures 2747 mm, not the printed 1500 mm width; elevation has only loose dimension matches | room/order and gap relationship are ambiguous; the label is useful review evidence but not a clean Kitchen row                                                                       | correctly review-required                                      | floor-plan label exists; no schedule, visual audit, or door-hit authority used.                      |
| `fenner-sc-11` | Family slider / overlight assembly        |   1 | review-required  | malformed `1300x175036001300x1750`; width-only `3600`/assembly context | null                                        | null | malformed text p1 near `(299.6,271.8)`                                       | nearby `FAMILY`, `Skylight`, `780 x 1400`, plus the contaminated jammed annotation                      | no clean single-row floor-plan/elevation association; the printed text is a multi-part assembly-style annotation                                          | the evidence is not one clean W x H label; no fake merge of two `1300 x 1750` parts plus width-only `3600` is allowed                                                                | correctly review-required                                      | contaminated floor-plan text preserved; no schedule, visual audit, or door-hit authority used.       |
| `fenner-sc-13` | Lounge slider                             |   1 | review-required  | width-only `3600`                                                      | width 3600, height null                     | null | width text p1 near `(358.2,436.1)`                                           | nearest room `LOUNGE`; another `3600` exists near the lower page edge                                   | vector elevation has sliders around `3581/3598 x 2049/2125`; floor gap relationship is not row-safe                                                       | no clean floor-plan W x H label row; future face-signature/elevation proof may recover it, but this clean-label slice cannot                                                         | missing usable evidence                                        | floor-plan width/elevation diagnostic only; no schedule, visual audit, or door-hit authority.        |
| `fenner-sc-14` | Garage window                             |   1 | missing/conflict | width-only `2000`                                                      | width 2000, height null                     | null | width text p1 near `(709.9,175.3)`                                           | nearby text includes garage services notes; nearest rooms `PANTRY`/`GARAGE` are close but not decisive  | nearest exterior gap routes to `PANTRY`; only soft elevation context exists                                                                               | there is no clean current floor-plan W x H label and no direct safe height witness in this slice; height and area remain null                                                        | missing usable evidence                                        | floor-plan width/elevation diagnostic only; no schedule, visual audit, or door-hit authority.        |
| `fenner-sc-15` | Garage window                             |   1 | review-required  | `floorplan-label-4: 700 x 3000`                                        | 3000 x 700                                  | null | p1 `[695.13,363.08,731.13,377.08]`                                           | nearest room `LAUNDRY/MUDROOM`, second-nearest `GARAGE`; nearby `attic stairs` and laundry text         | nearest exterior gap is low-confidence/ambiguous near `LAUNDRY/MUDROOM`/`ENTRY`; vector elevation has `3048 x 597` context                                | dimensions likely describe a real opening, but benchmark says Garage while floor text/room/gap context points to a garage/laundry boundary; clean association is not safe            | benchmark/source ambiguity                                     | floor-plan label exists; no schedule, visual audit, or door-hit authority used.                      |
| `fenner-sc-16` | Garage Door 1                             |   1 | review-required  | width-only `4800`; nearby `Insulated garage door`                      | width 4800, height null                     | null | width text p1 near `(850.4,271.4)`                                           | nearest room `GARAGE`; marker text says `Insulated garage door`                                         | vector elevation has `4873 x 2100` sectional garage-door candidate                                                                                        | this is a garage-door/face-anchor evidence class, not a clean floor-plan W x H exterior-window label; keep out of this recovery slice                                                | correctly review-required                                      | garage marker/elevation diagnostic only; no schedule, visual audit, or door-hit authority.           |
| `fenner-sc-17` | Entrance front entry / sidelight assembly |   1 | review-required  | width-only `1400`; nearby `1030`; `floorplan-label-5: 2150 x 400`      | label piece 400 x 2150, assembly width 1400 | null | `2150 x 400` p1 `[595.32,392.93,631.32,406.93]`; `1400` near `(505.8,382.8)` | nearby `ENTRY`, `1030`, `2150x400`, `810`, coat cupboard and room footprint text                        | nearest exterior gap is low-confidence/ambiguous near `LAUNDRY/MUDROOM`/`ENTRY`                                                                           | split entry/sidelight evidence is not one clean opening label; `1030` is not used as an assumed height or width, and `2150 x 400` remains a sidelight piece                          | correctly review-required                                      | floor-plan text preserved as review evidence; no schedule, visual audit, or door-hit authority used. |

Skylight check:

- Raw `780 x 1400` labels with nearby `Skylight` text remain excluded by the parser.
- They produce no clean exterior wall opening row and no exterior-wall review target.
- False positives remain 0.

Inventory decision:

- No additional implementation is justified in this slice.
- There are 0 safely recoverable clean-label misses left under the current evidence rules.
- Rows with width-only plus elevation context should move to a separate face/elevation/garage-anchor
  audit, not into the clean W x H label matcher.

## Commands Run

```powershell
git status --short
git branch --show-current
git log --oneline -5
npx tsx scripts/fenner-opening-ledger.mts
npx vitest run tests/takeoff/floor-plan-label-recovery.test.ts tests/takeoff/opening-evidence-label-recovery.test.ts tests/takeoff/plan-text.test.ts tests/takeoff/plan-text-compose.test.ts tests/takeoff/floor-plan-text-height-witness.test.ts
npx tsx - # parsed Fenner floor text and floor-plan label recovery assignments
npx tsx - # post-commit follow-up audit over Fenner labels, gaps, elevation candidates, and ledger rows
npx tsx - # remaining review/conflict inventory over Fenner benchmark rows
```
