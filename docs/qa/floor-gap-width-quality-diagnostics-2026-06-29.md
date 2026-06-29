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
