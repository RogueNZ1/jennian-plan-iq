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
