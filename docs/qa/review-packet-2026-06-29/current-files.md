

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
FILE: src/lib/takeoff/floor-plan-label-recovery.ts
============================================================

import type { PlanText, PlanWindowCode, PlanRoom } from "./plan-text";

export type FloorPlanLabelRecoveryStatus = "extracted" | "review";

export type FloorPlanLabelRecoveryAssignment = {
  id: string;
  status: FloorPlanLabelRecoveryStatus;
  room: string | null;
  text: string;
  page?: number;
  bbox: [number, number, number, number];
  widthMm: number;
  heightMm: number;
  areaM2: number;
  confidence: "medium" | "low";
  reason: string;
  reviewFlags: string[];
};

const NON_WINDOW_ROOMS = /^(HWC|LINEN|STORE|WIR|ROBE|PANTRY|ENTRY)\b/i;
const LABEL_HALF_WIDTH_PT = 18;
const LABEL_HALF_HEIGHT_PT = 7;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function dimensionText(code: PlanWindowCode): string {
  return `${code.heightMm} x ${code.widthMm}`;
}

function labelBbox(code: PlanWindowCode): [number, number, number, number] {
  return [
    round2(code.x - LABEL_HALF_WIDTH_PT),
    round2(code.y - LABEL_HALF_HEIGHT_PT),
    round2(code.x + LABEL_HALF_WIDTH_PT),
    round2(code.y + LABEL_HALF_HEIGHT_PT),
  ];
}

function cleanDimensionBand(code: PlanWindowCode): boolean {
  const min = Math.min(code.heightMm, code.widthMm);
  const max = Math.max(code.heightMm, code.widthMm);
  const normalWindow = min >= 800 && max <= 2400 && code.heightMm <= 1800;
  const fullHeightNarrowWindow =
    code.heightMm >= 1900 && code.heightMm <= 2200 && code.widthMm >= 550 && code.widthMm <= 700;
  return normalWindow || fullHeightNarrowWindow;
}

function roomCandidates(code: PlanWindowCode, rooms: readonly PlanRoom[]) {
  return rooms
    .filter((room) => !NON_WINDOW_ROOMS.test(room.name))
    .map((room) => ({
      room,
      distance: Math.hypot(room.x - code.x, room.y - code.y),
    }))
    .sort((a, b) => a.distance - b.distance);
}

function uniqueRoomAssignment(candidates: ReturnType<typeof roomCandidates>): boolean {
  const best = candidates[0];
  if (!best || best.distance > 130) return false;
  const second = candidates[1];
  if (!second) return true;
  const gap = second.distance - best.distance;
  const ratio = best.distance / second.distance;
  return (best.distance <= 90 && gap >= 25) || ratio <= 0.7;
}

function nearDraftingIssue(code: PlanWindowCode, planText: PlanText): string | null {
  const issue = (planText.draftingIssues ?? [])
    .map((candidate) => ({
      candidate,
      distance: Math.hypot(candidate.x - code.x, candidate.y - code.y),
    }))
    .filter((candidate) => candidate.distance <= 110)
    .sort((a, b) => a.distance - b.distance)[0]?.candidate;
  return issue?.text ?? null;
}

function reviewReason(args: {
  code: PlanWindowCode;
  planText: PlanText;
  candidates: ReturnType<typeof roomCandidates>;
}): string | null {
  const issueText = nearDraftingIssue(args.code, args.planText);
  if (issueText) {
    return `near malformed/contaminated drafting label "${issueText}"`;
  }
  if (!cleanDimensionBand(args.code)) {
    return "dimension band is large, narrow, or door-like; keep for review";
  }
  if (!uniqueRoomAssignment(args.candidates)) {
    return "room/order assignment is ambiguous";
  }
  return null;
}

export function recoverFloorPlanLabelAssignments(args: {
  planText: PlanText | null | undefined;
  page?: number | null;
}): FloorPlanLabelRecoveryAssignment[] {
  const planText = args.planText;
  if (!planText?.windowCodes.length) return [];

  return planText.windowCodes.map((code, index) => {
    const candidates = roomCandidates(code, planText.rooms);
    const best = candidates[0]?.room ?? null;
    const reason = reviewReason({ code, planText, candidates });
    const widthM = code.widthMm / 1000;
    const heightM = code.heightMm / 1000;
    const areaM2 = round2(widthM * heightM);
    const status: FloorPlanLabelRecoveryStatus = reason ? "review" : "extracted";
    const text = dimensionText(code);
    return {
      id: `floorplan-label-${index + 1}`,
      status,
      room: best?.name ?? null,
      text,
      ...(args.page != null ? { page: args.page } : {}),
      bbox: labelBbox(code),
      widthMm: code.widthMm,
      heightMm: code.heightMm,
      areaM2,
      confidence: status === "extracted" ? "medium" : "low",
      reason:
        status === "extracted"
          ? `clean floor-plan opening label ${text} assigned to ${best?.name ?? "unknown"} by unique room proximity/order`
          : `floor-plan opening label ${text} retained for review: ${reason}`,
      reviewFlags:
        status === "extracted"
          ? []
          : [
              `Floor-plan opening label ${text} is not clean enough for automatic recovery: ${reason}.`,
            ],
    };
  });
}



============================================================
FILE: src/lib/takeoff/compose-takeoff.ts
============================================================

/**
 * composeTakeoff — the shared, PURE plan-to-takeoff seam (Convergence Slices 1–2).
 *
 * This is the single implementation of "given the (already-fetched) vision takeoff +
 * geometry + window schedule, produce the reconciled takeoff". It was extracted from the
 * interactive `/upload` flow (Pipeline B) so the production path (`run.ts`, Pipeline A) can
 * call the exact same logic — the two paths then differ ONLY in I/O (ephemeral vs
 * persisted), and the divergence the audit found becomes impossible to recur. See
 * CONVERGENCE_DESIGN.md.
 *
 * Slice 2: the output is now an `EnrichedTakeoff` — every QS field wrapped in a
 * `FieldValue` (value + source + confidence + discrepancy_flags). VALUES are unchanged from
 * Slice 1 (unwrapTakeoff(enriched) deep-equals the Slice 1 golden); the enrichment only
 * ADDS provenance and migrates the global flags onto the field they belong to. A global
 * `notes` view is preserved byte-for-byte for backward-compat.
 *
 * PURITY CONTRACT (unchanged):
 *   - Inputs → output, nothing else. NO model/vision call, NO geometry fetch, NO network,
 *     NO clock, NO Math.random, NO Supabase/IO, NO React state, NO toast.
 *   - Every impure dependency (the AI passes, the geometry measurement, the schedule read)
 *     is performed by the CALLER and handed in as data; the caller owns all side-effects.
 *   - Identical inputs ⇒ deterministic output.
 */
import type { Opening, TakeoffData } from "./takeoff-types";
import type { GeometryApiResult } from "./geometry-api";
import type { WindowScheduleData } from "./extract-window-schedule";
import {
  preferVectorGarage,
  safeguardScheduleHeights,
  headDatumSafeguardNote,
  preferVectorOpenings,
  preferVectorEntrance,
  entranceAssumptionNote,
  type ScheduleSafeguardResult,
} from "./vector-annotations";
import { aggregateWindows, applyWindowAggregate } from "./aggregate-windows";
import { correctWindowsByRoom, routeWindowCodes } from "./plan-text";
import {
  deriveOpenings,
  deriveOpeningTotals,
  foldSymbolOpenings,
  foldScheduleEntrance,
  normaliseOpeningsForQs,
  computeExternalWallAreaM2,
} from "./derive-fields";
import {
  reconcileVectorVision,
  type ReconciliationReport,
  type FieldReconciliation,
} from "./reconcile-annotations";
import { reconcileGeometryPage, type PageReconciliation } from "./page-of-truth";
import {
  fv,
  type EnrichedTakeoff,
  type FieldConfidence,
  type FieldSource,
} from "./enriched-takeoff";
import type { VisualOpeningAudit } from "./visual-opening-audit";
import type { ElevationData } from "./extract-elevations";
import {
  reconcileVisualOpenings,
  visualReconciliationFlags,
} from "./visual-opening-reconciliation";
import { recoverVisualAuditFromElevationLedger } from "./visual-opening-elevation-recovery";
import { promoteVisualOpenings } from "./visual-opening-promotion";
import { buildOpeningEvidenceLedger } from "./opening-evidence";
import { matchElevationToFloorPlanGaps } from "./elevation-gap-match";
import { matchPlanTextDimensionsToFloorPlanGaps } from "./floor-plan-text-height-witness";
import { promoteFloorPlanGapOpenings } from "./floor-plan-gap-promotion";
import { promoteOrderedFaceSignatureOpenings } from "./opening-face-promotion";
import { buildOpeningFaceMap } from "./opening-face-map";
import type { ElevationVectorOpening } from "./elevation-vector-openings";
import { classifyGarageDoorAnnotation } from "./classify";
import { normaliseGarageDoorSizeLabel } from "./garage-door-size";
import {
  adjudicateOpeningPricing,
  applyOpeningPricingBlock,
  combineOpeningPricingBlocks,
  pricingBlockFromMissingAiOpeningCheck,
  pricingBlockFromVisualReconciliation,
} from "./opening-pricing-adjudication";
import { buildExtractedQuantityLedger } from "./extracted-quantity-ledger";

export type ComposeTakeoffInput = {
  /** The vision-extracted takeoff (already returned by extractConceptTakeoffs). */
  visionTakeoff: TakeoffData;
  /** The geometry measurement + vector_annotations (already fetched), or null. */
  geometry: GeometryApiResult | null | undefined;
  /** The (already-read) Door & Window Schedule, or null when there is no schedule page. */
  schedule: WindowScheduleData | null | undefined;
  /**
   * The 0-based page index we asked geometry to measure (the AI-classified floor plan),
   * or undefined when no page was pinned. Reconciled against `geometry.page_used`.
   */
  geometryPageIndex: number | undefined;
  /** Deterministic door-engine result for the working page; null/absent → no door pass. */
  doorEngine?:
    | (import("../doors/door-engine").DoorEngineResult & {
        pageMeta?: import("../doors/run-doors").DoorPageMeta;
        planText?: import("./plan-text").PlanText;
        wallTrace?: import("./wall-trace").WallTrace;
        floorPlanGaps?: import("./floor-plan-gaps").FloorPlanGapCandidate[];
        physicalOpeningWidthWitnesses?: import("./floor-opening-witnesses").PlanPhysicalOpeningWidthWitness[];
        floorSignatureRows?: import("./opening-face-map").OpeningSignatureFloorRow[];
        floorSideLengthWitnesses?: import("./opening-face-map").PlanSideLengthWitness[];
      })
    | null;
  /** Visual QS external-opening audit; promoted only through strict plausibility/recovery gates. */
  visualOpeningAudit?: VisualOpeningAudit | null;
  /**
   * True when the caller attempted/required the AI opening review for this run. If the review
   * is missing, opening-derived money fields fail closed instead of treating silence as approval.
   */
  visualOpeningAuditRequired?: boolean;
  /** Structured elevation opening ledger; used only for strict visual-recovery cases. */
  elevationData?: ElevationData | null;
  /** Optional persistence context for the additive Extracted Quantity Ledger. */
  jobId?: string;
  runId?: string;
  ledgerTimestamp?: string;
};

function roundArea(n: number): number {
  return Math.round(n * 100) / 100;
}

function elevationGarageDoorOpening(
  elevationData: ElevationData | null | undefined,
): Opening | null {
  const candidates = (elevationData?.elevationOpenings ?? [])
    .filter(
      (opening) =>
        opening.type === "garage_door" &&
        opening.widthMm != null &&
        opening.heightMm != null &&
        opening.confidence !== "low",
    )
    .map((opening) => {
      const classified = classifyGarageDoorAnnotation(`${opening.widthMm}x${opening.heightMm}`);
      return classified ? { opening, classified } : null;
    })
    .filter(
      (
        item,
      ): item is {
        opening: NonNullable<ElevationData["elevationOpenings"]>[number] & {
          widthMm: number;
          heightMm: number;
        };
        classified: NonNullable<ReturnType<typeof classifyGarageDoorAnnotation>>;
      } => item != null,
    )
    .sort((a, b) => b.opening.widthMm - a.opening.widthMm);
  const best = candidates[0];
  if (!best) return null;

  const height_m = best.classified.heightMm / 1000;
  const width_m = best.classified.widthMm / 1000;
  return {
    type: "sectional_door",
    room: "Garage",
    height_m,
    width_m,
    glazed: false,
    cladding: null,
    area_m2: roundArea(height_m * width_m),
    source: "vector",
    confidence: "medium",
    flags: [
      `Garage door recovered from ${best.opening.face} elevation vector candidate ${best.opening.widthMm}x${best.opening.heightMm}mm and snapped to QS size ${best.classified.label}.`,
    ],
  };
}

function vectorElevationOpenings(
  elevationData: ElevationData | null | undefined,
): ElevationVectorOpening[] {
  return (elevationData?.elevationOpenings ?? []).filter(
    (opening): opening is ElevationVectorOpening =>
      "source" in opening &&
      "faceBandId" in opening &&
      typeof (opening as { x?: unknown }).x === "number" &&
      typeof (opening as { y?: unknown }).y === "number",
  );
}

export type ComposeTakeoffResult = {
  /** The enriched takeoff — per-field value + source + confidence + discrepancy_flags. */
  enriched: EnrichedTakeoff;
  /** The F-022 vector↔vision cross-check report (its flags are also on the fields). */
  reconciliation: ReconciliationReport;
  /** Did geometry measure the page we pinned? Returned so the caller can surface a toast. */
  pageReconcile: PageReconciliation;
  /** The head-datum safeguard result (flagged window ids + detected datum). */
  scheduleSafeguard: ScheduleSafeguardResult;
};

/** Normalise geometry's confidence vocabulary ("medium") to the FieldValue vocabulary. */
function normConf(c: "high" | "medium" | "low" | null | undefined): FieldConfidence {
  if (c === "medium") return "mid";
  if (c === "high" || c === "low") return c;
  return null;
}

/** Map an F-022 reconciliation status to a field confidence. */
function reconConf(status: FieldReconciliation["status"] | undefined): FieldConfidence {
  if (status === "agree") return "high";
  if (status === "disagree") return "low";
  return null; // uncheckable / missing → we don't claim a confidence
}

/** The notes added by a step = the suffix `after` has beyond `before` (1 combined entry). */
function noteDelta(before: string, after: string): string[] {
  if (!after) return [];
  if (before && after.startsWith(before)) {
    const d = after.slice(before.length).trim();
    return d ? [d] : [];
  }
  return before === after ? [] : [after];
}

type FloorAreaDecision = {
  value: number | null;
  source: FieldSource;
  confidence: FieldConfidence;
  flags: string[];
};

function near(a: number | null | undefined, b: number | null | undefined, tolerance = 0.05) {
  return a != null && b != null && Math.abs(a - b) <= tolerance;
}

function foundationOrDefault(v: string | null | undefined): string {
  const cleaned = typeof v === "string" ? v.trim() : "";
  return cleaned || "TC1";
}

const round2Local = (v: number): number => Math.round(v * 100) / 100;

function openingsFromPlanTextCodes(
  planText: import("./plan-text").PlanText | null | undefined,
  vector: import("./geometry-api").VectorAnnotations | null | undefined,
): Opening[] | null {
  const entranceWidthMm =
    vector?.vector_usable && vector.entrance?.width_mm != null ? vector.entrance.width_mm : null;
  const codes = (planText?.windowCodes ?? []).filter((code) => {
    if (!code.id) return false;
    if (entranceWidthMm != null && Math.abs(code.widthMm - entranceWidthMm) <= 50) return false;
    return true;
  });
  const frameDoors = (planText?.frameOpenings ?? []).filter((frame) => {
    if (entranceWidthMm != null && Math.abs(frame.widthMm - entranceWidthMm) <= 50) return false;
    return true;
  });
  if (codes.length === 0 && frameDoors.length === 0) return null;
  const openings: Opening[] = codes.map((code) => {
    const height_m = round2Local(code.heightMm / 1000);
    const width_m = round2Local(code.widthMm / 1000);
    return {
      type: "window",
      room: code.id ?? null,
      height_m,
      width_m,
      glazed: true,
      cladding: null,
      area_m2: round2Local(height_m * width_m),
      source: "vector",
      confidence: "medium",
    };
  });
  for (const frame of frameDoors) {
    const height_m = 2.1;
    const width_m = round2Local(frame.widthMm / 1000);
    openings.push({
      type: "pa_door",
      room: null,
      height_m,
      width_m,
      glazed: true,
      cladding: null,
      area_m2: round2Local(height_m * width_m),
      source: "vector",
      height_source: "asserted",
      flags: ["height assumed standard 2.1m — confirm against the elevation/joinery schedule"],
      confidence: "medium",
    });
  }
  return openings;
}

function openingsFromRoutedPlanTextCodes(
  planText: import("./plan-text").PlanText | null | undefined,
  vector: import("./geometry-api").VectorAnnotations | null | undefined,
): Opening[] | null {
  if (!planText?.windowCodes.length) return null;
  const entranceWidthMm =
    vector?.vector_usable && vector.entrance?.width_mm != null ? vector.entrance.width_mm : null;
  const routed = routeWindowCodes(planText).filter((code) => {
    if (entranceWidthMm != null && Math.abs(code.widthMm - entranceWidthMm) <= 50) return false;
    return true;
  });
  if (routed.length === 0) return null;
  return routed.map((code) => {
    const height_m = round2Local(code.heightMm / 1000);
    const width_m = round2Local(code.widthMm / 1000);
    return {
      type: "window",
      room: code.roomName,
      height_m,
      width_m,
      glazed: true,
      cladding: null,
      area_m2: round2Local(height_m * width_m),
      source: "vector",
      confidence: "medium",
    };
  });
}

function openingRoomKey(room: string | null | undefined): string {
  const n = (room ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (n.includes("MASTER")) return "BED1";
  const bed = n.match(/BED(?:ROOM)?(\d)/);
  if (bed) return `BED${bed[1]}`;
  if (n.includes("FAMILY") || n.includes("LIVING")) return "FAMILY";
  if (n.includes("DINING")) return "DINING";
  if (n.includes("LOUNGE")) return "LOUNGE";
  if (n.includes("KITCHEN")) return "KITCHEN";
  if (n.includes("GARAGE")) return "GARAGE";
  if (n.includes("BATH")) return "BATH";
  if (n.includes("ENS")) return "ENSUITE";
  if (n.includes("TOILET") || n === "WC") return "WC";
  if (n.includes("PANTRY")) return "PANTRY";
  if (n.includes("WIR")) return "WIR";
  if (n.includes("LAUNDRY")) return "LAUNDRY";
  return n;
}

function sameOpeningDims(a: Opening, b: Opening, toleranceM = 0.06): boolean {
  const direct =
    Math.abs(a.height_m - b.height_m) <= toleranceM &&
    Math.abs(a.width_m - b.width_m) <= toleranceM;
  const swapped =
    Math.abs(a.height_m - b.width_m) <= toleranceM &&
    Math.abs(a.width_m - b.height_m) <= toleranceM;
  return direct || swapped;
}

function mergePlanTextAndVisualOpenings(primary: Opening[], visual: Opening[]): Opening[] {
  const merged = [...primary];
  const primaryRooms = new Set(
    primary
      .filter((o) => o.type === "window" || o.type === "garage_window" || o.type === "slider")
      .map((o) => openingRoomKey(o.room))
      .filter(Boolean),
  );
  let hasSectional = primary.some((o) => o.type === "sectional_door");

  for (const opening of visual) {
    if (opening.type === "sectional_door") {
      if (!hasSectional) {
        merged.push(opening);
        hasSectional = true;
      }
      continue;
    }

    const roomKey = openingRoomKey(opening.room);
    const hasPricedArea = opening.height_m > 0 && opening.width_m > 0 && opening.area_m2 > 0;

    if (opening.type === "window" || opening.type === "garage_window") {
      // Printed plan-text/window-code rows are the priced window source. Visual windows
      // in those rooms are placement evidence only; keeping both double-prices glazing.
      if (!hasPricedArea) continue;
      if (roomKey && primaryRooms.has(roomKey)) continue;
      merged.push(opening);
      continue;
    }

    if (opening.type === "slider") {
      // Sliders are often tagged by visual QS, but when the same room+dims already came
      // from plan text, treat visual as confirmation rather than a second opening.
      if (!hasPricedArea) continue;
      const duplicate = merged.some(
        (existing) =>
          openingRoomKey(existing.room) === roomKey && sameOpeningDims(existing, opening),
      );
      if (!duplicate) merged.push(opening);
      continue;
    }

    const duplicate = merged.some(
      (existing) =>
        existing.type === opening.type &&
        openingRoomKey(existing.room) === roomKey &&
        sameOpeningDims(existing, opening),
    );
    if (!duplicate) merged.push(opening);
  }

  return merged;
}

function recoverScheduleHeightsFromPlanText(
  schedule: WindowScheduleData | null,
  planText: import("./plan-text").PlanText | null | undefined,
  headDatumMm: number | null,
): WindowScheduleData | null {
  if (!schedule?.windows.length || !planText?.windowCodes.length) return schedule;
  let changed = false;
  const byId = new Map(planText.windowCodes.filter((c) => c.id).map((c) => [c.id, c]));
  const windows = schedule.windows.map((w) => {
    if (w.heightMm != null) return w;
    const code = byId.get(w.id);
    if (!code) return w;
    let heightMm = code.heightMm;
    let heightSource: "vector" | "asserted" = "vector";
    const flags = [
      ...(w.flags ?? []),
      `${w.id}: schedule height was rejected as a likely head-datum read; height recovered from the printed W-code on the floor plan.`,
    ];
    if (headDatumMm != null && Math.abs(heightMm - headDatumMm) <= 50) {
      heightMm = 2100;
      heightSource = "asserted";
      flags.push(
        `${w.id}: printed W-code height ${code.heightMm}mm matches the ${headDatumMm}mm head datum; normalised to standard 2100mm and must be confirmed against the joinery schedule.`,
      );
    }
    changed = true;
    return { ...w, heightMm, heightSource, flags };
  });
  return changed ? { ...schedule, windows } : schedule;
}

/**
 * Geometry is usually the best area source, but not when its own diagnostics prove the
 * floor-area candidate is contaminated. Harrison exposed the failure mode: OCR labelled
 * the printed perimeter (60.4) as living area, the API returned 60.4 as floor_area_m2,
 * and the old seam blindly overwrote the correct vision/title-block area.
 */
function selectFloorArea(
  visionTakeoff: TakeoffData,
  geoResult: GeometryApiResult | null,
  pageFlag: string | null,
): FloorAreaDecision {
  const geoValue = geoResult?.measurements?.floor_area_m2 ?? null;
  const visionValue = visionTakeoff.floor_area_m2 ?? null;
  const geoConfidence = normConf(geoResult?.confidence?.floor_area);
  const notes = geoResult?.confidence?.notes ?? [];

  if (geoValue == null) {
    return {
      value: visionValue,
      source: "vision",
      confidence: null,
      flags: pageFlag ? [pageFlag] : [],
    };
  }

  const floorMismatchNote = notes.find((n) => /^floor_area_m2:/i.test(n));
  const mismatchGeometryValue = floorMismatchNote?.match(/\bgeometry=([0-9]+(?:\.[0-9]+)?)/i);
  const rejectedGeometryCandidate = mismatchGeometryValue
    ? Number(mismatchGeometryValue[1])
    : geoValue;
  const floorLooksLikePerimeter =
    near(geoValue, geoResult?.measurements?.perimeter_m) ||
    near(geoResult?.ocr_raw?.living_area_m2, geoResult?.measurements?.perimeter_m);
  const materialVisionDisagreement =
    visionValue != null &&
    Math.abs(geoValue - visionValue) > Math.max(2, Math.abs(visionValue) * 0.02);

  const geometryContradicted =
    !!floorMismatchNote ||
    floorLooksLikePerimeter ||
    geoConfidence === "low" ||
    (geoConfidence === "mid" && materialVisionDisagreement);

  if (geometryContradicted && visionValue != null) {
    const reasons = [
      floorMismatchNote,
      floorLooksLikePerimeter
        ? `geometry floor-area candidate ${geoValue} matches/looks like the perimeter`
        : null,
      materialVisionDisagreement
        ? `vision/title-block floor area ${visionValue} differs materially from geometry ${geoValue}`
        : null,
    ].filter((x): x is string => !!x);
    return {
      value: visionValue,
      source: "vision",
      confidence: "mid",
      flags: [
        ...(pageFlag ? [pageFlag] : []),
        `Floor area: rejected geometry candidate ${rejectedGeometryCandidate}; ${reasons.join("; ")}. Using vision/title-block candidate ${visionValue}.`,
      ],
    };
  }

  return {
    value: geoValue,
    source: "geometry",
    confidence: geoConfidence,
    flags: pageFlag ? [pageFlag] : [],
  };
}

/**
 * Pure compose. Mirrors the `/upload` seam exactly (geometry overrides → vector garage →
 * head-datum safeguard → window aggregate → vector openings → asserted entrance → F-022),
 * then wraps the result in per-field provenance. Ext-wall area is NOT recomputed — it stays
 * gated on the per-window heights.
 */
export function composeTakeoff(input: ComposeTakeoffInput): ComposeTakeoffResult {
  const {
    visionTakeoff,
    geometry,
    schedule: scheduleRaw,
    geometryPageIndex,
    doorEngine,
    visualOpeningAudit,
    elevationData,
  } = input;

  const geoResult = geometry ?? null;
  const m = geoResult?.measurements;
  const geoRoomCount = m?.room_count ?? 0;
  const vectorAnnotations = geoResult?.vector_annotations;
  const aiRoomLabels = (visionTakeoff as { roomLabels?: string[] }).roomLabels;

  // ── Plan-text cross-checks (13 Jun 2026 — JM-0032 lessons, all three) ──────────
  const planText = doorEngine?.planText;
  const planGarage = planText?.rooms.find((r) => /^GARAGE\b/i.test(r.name)) ?? null;
  const titleVals = planText
    ? Object.values(planText.titleAreas).filter((v): v is number => v != null)
    : [];
  const visionGarage = (visionTakeoff as { garage_area_m2?: number | null }).garage_area_m2 ?? null;
  // Title-block grab: vision's garage area equals a title-block stat (the 46.7
  // CLADDING AREA grab). Deterministic room footprint wins when present.
  const garageTitleGrab =
    visionGarage != null && titleVals.some((v) => Math.abs(v - visionGarage) <= 0.3);
  const garageDisagrees =
    planGarage != null &&
    visionGarage != null &&
    Math.abs(visionGarage - planGarage.areaM2) / planGarage.areaM2 > 0.25;
  const garageOverride =
    planGarage != null && (garageTitleGrab || garageDisagrees || visionGarage == null);
  const garageFlags: string[] = [];
  if (garageOverride && planGarage) {
    garageFlags.push(
      `reconciliation: garage area taken from the plan's printed room dims (${planGarage.widthMm}×${planGarage.depthMm} = ${planGarage.areaM2} m²)` +
        (visionGarage != null ? ` — vision read ${visionGarage} m²` : "") +
        (garageTitleGrab ? " which equals a TITLE-BLOCK stat (cladding/total area grab)" : "") +
        ".",
    );
  } else if (garageTitleGrab) {
    garageFlags.push(
      "⚑ vision's garage area equals a title-block stat — likely a title-block grab; confirm against the plan.",
    );
  }
  // ── flags, tracked per-field as they are generated ──────────────────────────────
  // Phase 3 — page divergence: geometry measured a different page than we pinned.
  const pageReconcile = reconcileGeometryPage(geometryPageIndex, geoResult?.page_used);
  const pageFlag = !pageReconcile.agreed && pageReconcile.note ? pageReconcile.note : null;
  const floorAreaDecision = selectFloorArea(visionTakeoff, geoResult, pageFlag);

  // Internal-wall confidence note (geometry rooms vs AI room labels).
  const roomFlags: string[] = [];
  if (geoRoomCount > 0 && aiRoomLabels && aiRoomLabels.length > 0) {
    if (geoRoomCount > aiRoomLabels.length) {
      roomFlags.push(
        `Geometry found ${geoRoomCount} room dims; AI found ${aiRoomLabels.length} room labels.`,
      );
    }
  } else if (geoRoomCount === 0 && m != null) {
    roomFlags.push("Internal wall: not extracted — no room dimension annotations found in plan.");
  }

  // Same order the seam has always used: page note first, then the room note(s).
  const internalWallNotes = [pageFlag, ...roomFlags].filter(Boolean) as string[];

  // ── the value seam ──────────────────────────────────────────────────────────────
  // Geometry usually wins for measured fields, but floor area is candidate-selected:
  // geometry cannot override when its own diagnostics show a contaminated area read.
  const floorAreaNotes = floorAreaDecision.flags.filter((f) => f !== pageFlag);
  const merged: TakeoffData = {
    ...visionTakeoff,
    floor_area_m2: floorAreaDecision.value,
    ...(m?.perimeter_m != null ? { external_wall_lm: m.perimeter_m } : {}),
    ...(m?.internal_wall_length_m != null
      ? { internal_wall_lm: m.internal_wall_length_m }
      : { internal_wall_lm: null }),
    ...(m?.garage_area_m2 != null ? { garage_area_m2: m.garage_area_m2 } : {}),
    ...(m?.alfresco_area_m2 != null ? { alfresco_area_m2: m.alfresco_area_m2 } : {}),
    ...(m?.stud_height_mm != null ? { ceiling_height_m: m.stud_height_mm / 1000 } : {}),
    ...(internalWallNotes.length > 0 || floorAreaNotes.length > 0
      ? {
          notes: [visionTakeoff.notes, ...internalWallNotes, ...floorAreaNotes]
            .filter(Boolean)
            .join(" "),
        }
      : {}),
  };

  // Vector-first garage. Capture the VISION garage size BEFORE the override (F-022 + source).
  const visionGarageSize = merged.garage_door_size;
  const mergedVec = preferVectorGarage(merged, vectorAnnotations);
  const garageChanged = mergedVec.garage_door_size !== merged.garage_door_size;

  // Head-datum safeguard before aggregating.
  const scheduleSafeguard = safeguardScheduleHeights(scheduleRaw, vectorAnnotations);
  const schedule = recoverScheduleHeightsFromPlanText(
    scheduleSafeguard.schedule,
    planText,
    scheduleSafeguard.headDatumMm,
  );

  // Plan-text window auto-correction (13 Jun 2026, "flags aren't fixes"): on a
  // schedule-less job, the printed codes ARE the schedule the job never had --
  // spatially routed to their rooms and corrected INTO windows_by_room before
  // aggregation, so counts, openings, glazing and the QS slots all flow from
  // corrected routing. A real schedule still outranks everything. Every change
  // is logged verbatim onto the field's flags -- fixes are loud, never silent.
  let windowChanges: Array<{ room: string; change: string }> = [];
  let mergedVecW = mergedVec;
  if (!schedule?.windows?.length && planText) {
    const corrected = correctWindowsByRoom(mergedVec.windows_by_room, planText);
    if (corrected.changes.length > 0) {
      windowChanges = corrected.changes;
      mergedVecW = { ...mergedVec, windows_by_room: corrected.windowsByRoom };
    }
  }

  const windowAggregate = aggregateWindows(schedule, mergedVecW.windows_by_room);
  // Post-correction checks (13 Jun 2026): mismatch + bedroom alarms judge the
  // CORRECTED map — a fixed window must never be re-flagged as broken.
  const codeMismatch: string[] = [];
  const correctedWbr = (mergedVecW.windows_by_room ?? {}) as Record<
    string,
    { qty?: number; height_m?: number; width_m?: number }
  >;
  const codes = planText?.windowCodes ?? [];
  if (codes.length > 0) {
    for (const [room, w] of Object.entries(correctedWbr)) {
      if (w?.height_m == null || w?.width_m == null) continue;
      const h = Math.round(w.height_m * 1000),
        wd = Math.round(w.width_m * 1000);
      if (!codes.some((c) => c.heightMm === h && c.widthMm === wd))
        codeMismatch.push(
          `⚑ ${room} window ${w.height_m}×${w.width_m} matches NO printed joinery code on the plan — verify dims.`,
        );
    }
  }
  const bedNoWindow: string[] = [];
  if (planText) {
    const bedCanon = (raw: string): string | null => {
      const n = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (n.includes("MASTER")) return "BED1";
      const m = n.match(/BED(?:ROOM)?(\d)/);
      return m ? `BED${m[1]}` : null;
    };
    const wbrBeds = Object.keys(correctedWbr)
      .map(bedCanon)
      .filter((k): k is string => k != null);
    for (const r of planText.rooms) {
      const canon = bedCanon(r.name);
      if (!canon) continue;
      if (!wbrBeds.includes(canon))
        bedNoWindow.push(
          `⚑ ${r.name} is printed on the plan (${r.widthMm}×${r.depthMm}) but has NO routed window — bedrooms require natural light; check the takeoff.`,
        );
    }
  }
  const planDraftingFlags = (planText?.draftingIssues ?? []).map(
    (issue) =>
      `Drafting issue: malformed dimension label "${issue.text}" found on the floor plan; do not price from that label unless another source confirms the opening size.`,
  );
  const hasPrintedEnsuite =
    planText?.rooms.some((r) => /(^|[^A-Z])ENS(UITE)?($|[^A-Z])/.test(r.name.toUpperCase())) ??
    false;
  const ensuiteCountFlags =
    hasPrintedEnsuite && (mergedVecW.ensuite_count == null || mergedVecW.ensuite_count <= 0)
      ? [
          "ERROR: Ensuite is printed on the plan but ensuite_count was not found by the vision count. Review wet-area count before pricing.",
        ]
      : [];
  const noArcSingleCount =
    doorEngine?.hinged.filter((h) => /swing arc not vector-recovered/i.test(h.note ?? "")).length ??
    0;
  const doorCountFlags =
    noArcSingleCount > 0
      ? [
          `Internal door engine counted ${noArcSingleCount} single-leaf opening(s) from wall-gap/leaf fallback because swing arcs were not vector-recovered. Verify against the marked plan before pricing.`,
        ]
      : [];

  const notesBeforeAgg = mergedVecW.notes ?? "";
  let mergedWithWindows = applyWindowAggregate(mergedVecW, windowAggregate);
  // The ext-wall (in)complete / overshoot note, if the aggregate added one → ext-wall field.
  const extWallFlags = noteDelta(notesBeforeAgg, mergedWithWindows.notes ?? "");

  // Vector-preferred window COUNT. Capture the VISION count BEFORE the override.
  const visionWindowCount = mergedWithWindows.window_count;
  mergedWithWindows = preferVectorOpenings(mergedWithWindows, vectorAnnotations);
  const windowCountChanged = mergedWithWindows.window_count !== visionWindowCount;

  // Entry door: asserted standard HEIGHT (2.1m), data-driven-or-unresolved WIDTH. Capture
  // the VISION entry-door width BEFORE the override for F-022. Does NOT recompute ext-wall.
  const visionEntranceWidthMm =
    mergedWithWindows.windows_by_room?.entrance?.width_m != null
      ? Math.round(mergedWithWindows.windows_by_room.entrance.width_m * 1000)
      : null;
  mergedWithWindows = preferVectorEntrance(mergedWithWindows, vectorAnnotations);
  // Entry-door note: flags the asserted height + the width source (printed, or the assumed
  // last-resort fallback). The entrance is folded into the opening set on every path (route-2
  // symbol fold or the schedule entry fold), and the ext-wall area is recomputed accordingly,
  // so entranceAssumptionNote no longer claims "not added"/"not recomputed" — no clause to strip.
  const entranceNote = entranceAssumptionNote(vectorAnnotations);
  if (entranceNote) {
    mergedWithWindows = {
      ...mergedWithWindows,
      notes: [mergedWithWindows.notes, entranceNote].filter(Boolean).join(" "),
    };
  }

  const safeguardNote = headDatumSafeguardNote(scheduleSafeguard);
  if (safeguardNote) {
    mergedWithWindows = {
      ...mergedWithWindows,
      notes: [mergedWithWindows.notes, safeguardNote].filter(Boolean).join(" "),
    };
  }

  // F-022 — vector ↔ vision cross-check. Adds the missing SIGNAL by flagging any field
  // where the two paths materially disagreed. No value changes here.
  const reconciliation = reconcileVectorVision(
    visionGarageSize,
    visionWindowCount,
    vectorAnnotations,
    visionEntranceWidthMm,
  );
  if (reconciliation.note) {
    mergedWithWindows = {
      ...mergedWithWindows,
      notes: [mergedWithWindows.notes, reconciliation.note].filter(Boolean).join(" "),
    };
  }

  // ── enrichment: wrap the final bare values in per-field provenance ───────────────
  const t = mergedWithWindows;
  // Stage 2a — re-derive the flat opening list from the FINAL composed window set
  // (post vector + aggregate), so the persisted/exported openings reflect the same
  // window set the QS fields do. Additive passthrough — not yet written to any cell.
  const baseOpenings = deriveOpenings({
    windowsSchedule: t.windows_schedule ?? null,
    windowsByRoom: t.windows_by_room,
    garageDoorSize: t.garage_door_size,
  });
  // Route 2 — fold in the label-anchored single-width openings (no-schedule path only).
  // A no-op when the engine returns no symbol_openings (schedule/datum jobs) → those takeoffs
  // are unchanged. Reconciles the sectional callout against the garage door size.
  const folded = foldSymbolOpenings(
    baseOpenings,
    vectorAnnotations?.symbol_openings,
    t.garage_door_size,
    vectorAnnotations?.entrance,
  );
  // Schedule path — the windows-only Door & Window Schedule omits the entry door, so fold it
  // into openings[] from the SAME vector entrance + shared builder the route-2 path uses, so
  // glazed_sqm / total_opening_sqm / the ext-wall deduction all include it (counted once).
  // Strictly gated OFF when symbol_openings fired (route-2 already added the entrance) → no
  // double-count; foldScheduleEntrance's own dedup is a further backstop.
  const hasSymbolOpenings = !!(
    vectorAnnotations?.symbol_openings && vectorAnnotations.symbol_openings.length > 0
  );
  const rawComposedOpenings = hasSymbolOpenings
    ? folded.openings
    : foldScheduleEntrance(folded.openings, vectorAnnotations?.entrance);
  const planTextOpenings = !schedule?.windows?.length
    ? (openingsFromRoutedPlanTextCodes(planText, vectorAnnotations) ??
      openingsFromPlanTextCodes(planText, vectorAnnotations))
    : null;
  const planTextRecoveredOpenings = planTextOpenings
    ? [
        ...planTextOpenings,
        ...rawComposedOpenings.filter(
          (o) =>
            !["window", "slider", "garage_window"].includes(o.type) ||
            /entr|entry|porch/i.test(o.room ?? ""),
        ),
      ]
    : null;
  const recoveredVisualOpeningAudit = recoverVisualAuditFromElevationLedger(
    visualOpeningAudit,
    elevationData,
    {
      physicalOpeningWidthWitnesses: doorEngine?.physicalOpeningWidthWitnesses,
      page: doorEngine?.pageMeta
        ? { width: doorEngine.pageMeta.width, height: doorEngine.pageMeta.height }
        : null,
    },
  );
  const visualPromotion = promoteVisualOpenings(recoveredVisualOpeningAudit);
  const visualPromotedOpenings = visualPromotion?.openings.length ? visualPromotion.openings : null;
  const visualHasSectional = visualPromotedOpenings?.some((o) => o.type === "sectional_door");
  const rawSectionals = rawComposedOpenings.filter((o) => o.type === "sectional_door");
  const floorPlanGapElevationMatches = matchElevationToFloorPlanGaps({
    gaps: doorEngine?.floorPlanGaps,
    elevations: elevationData,
  });
  const floorPlanTextDimensionMatches = matchPlanTextDimensionsToFloorPlanGaps({
    gaps: doorEngine?.floorPlanGaps,
    planText,
    page: doorEngine?.pageMeta?.pageNumber ?? null,
  });
  const planTextPricedWindowBase =
    !schedule?.windows?.length && (planText?.windowCodes.length ?? 0) > 0
      ? (planTextRecoveredOpenings ?? rawComposedOpenings)
      : null;
  const elevationGarageDoor = elevationGarageDoorOpening(elevationData);
  const vectorElevationOpeningRows = vectorElevationOpenings(elevationData);
  const hasFaceMapEvidence =
    vectorElevationOpeningRows.length > 0 ||
    ((elevationData?.elevationFaceBands?.length ?? 0) > 0 &&
      (elevationData?.elevationOpeningSlots?.length ?? 0) > 0);
  const openingFaceMap = hasFaceMapEvidence
    ? buildOpeningFaceMap({
        planText,
        elevationOpenings: vectorElevationOpeningRows,
        faceBands: elevationData?.elevationFaceBands,
        physicalOpeningWitnesses: doorEngine?.physicalOpeningWidthWitnesses,
        openingSlots: elevationData?.elevationOpeningSlots,
        floorSignatureRows: doorEngine?.floorSignatureRows,
        floorSideLengthWitnesses: doorEngine?.floorSideLengthWitnesses,
      })
    : null;
  const selectedOpeningCandidates = visualPromotedOpenings
    ? planTextPricedWindowBase
      ? mergePlanTextAndVisualOpenings(planTextPricedWindowBase, visualPromotedOpenings)
      : visualHasSectional
        ? visualPromotedOpenings
        : [...visualPromotedOpenings, ...rawSectionals]
    : planTextRecoveredOpenings
      ? planTextRecoveredOpenings
      : rawComposedOpenings;
  const selectedOpenings = normaliseOpeningsForQs(
    elevationGarageDoor
      ? [
          ...selectedOpeningCandidates.filter((opening) => opening.type !== "sectional_door"),
          elevationGarageDoor,
        ]
      : selectedOpeningCandidates,
  );
  const orderedFaceSignaturePromotion = !schedule?.windows?.length
    ? promoteOrderedFaceSignatureOpenings({
        openings: selectedOpenings,
        faceMap: openingFaceMap,
      })
    : { openings: selectedOpenings, promotions: [] };
  const floorPlanGapPromotion = promoteFloorPlanGapOpenings({
    openings: orderedFaceSignaturePromotion.openings,
    floorPlanGaps: doorEngine?.floorPlanGaps,
    elevationMatches: floorPlanGapElevationMatches,
  });
  const composedOpenings = normaliseOpeningsForQs(floorPlanGapPromotion.openings);
  const floorPlanGapPromotionFlags = [...floorPlanGapPromotion.promotedByGapId.values()].flatMap(
    (opening) => opening.flags ?? [],
  );
  const rawComposedGarageDoorSize = elevationGarageDoor
    ? `${elevationGarageDoor.width_m}Ã—${elevationGarageDoor.height_m}`
    : (visualPromotion?.garageDoorSize ?? folded.garage_door_size);
  const composedGarageDoorSize = normaliseGarageDoorSizeLabel(rawComposedGarageDoorSize);
  const takeoffGarageDoorSize = normaliseGarageDoorSizeLabel(t.garage_door_size);
  const garageDoorConfirmedFromSectionalCallout =
    !visualPromotion && !elevationGarageDoor && composedGarageDoorSize !== takeoffGarageDoorSize;
  const garageDoorConfirmedFromVisual = !!visualPromotion?.garageDoorSize && !elevationGarageDoor;
  const garageDoorConfirmedFromElevation = !!elevationGarageDoor;
  const sanityOpeningPricing = adjudicateOpeningPricing(composedOpenings);
  const sanityPricedOpenings = normaliseOpeningsForQs(sanityOpeningPricing.pricedOpenings);
  const visualOpeningReconciliation = reconcileVisualOpenings({
    audit: recoveredVisualOpeningAudit,
    openings: sanityPricedOpenings,
    garageDoorSize: composedGarageDoorSize,
  });
  const aiOpeningCheckRequired = input.visualOpeningAuditRequired === true;
  const aiOpeningCheckFlags = [
    ...(recoveredVisualOpeningAudit
      ? []
      : aiOpeningCheckRequired
        ? [
            "AI opening check did not complete; external openings are review-only until rerun/reconciled.",
          ]
        : []),
    ...(visualOpeningReconciliation?.issues ?? [])
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.message),
  ];
  const aiOpeningCheck = {
    method: "ai_opening_review" as const,
    required: aiOpeningCheckRequired,
    visualAuditPresent: recoveredVisualOpeningAudit != null,
    status:
      aiOpeningCheckFlags.length > 0
        ? ("blocked" as const)
        : visualOpeningReconciliation?.status === "review"
          ? ("review" as const)
          : ("pass" as const),
    flags: aiOpeningCheckFlags,
  };
  const openingPricingAdjudication = applyOpeningPricingBlock(
    sanityOpeningPricing,
    combineOpeningPricingBlocks([
      pricingBlockFromVisualReconciliation(visualOpeningReconciliation),
      pricingBlockFromMissingAiOpeningCheck({
        required: aiOpeningCheckRequired,
        visualAuditPresent: recoveredVisualOpeningAudit != null,
      }),
    ]),
  );
  const pricedComposedOpenings = normaliseOpeningsForQs(openingPricingAdjudication.pricedOpenings);
  const localOpeningTotals = deriveOpeningTotals(pricedComposedOpenings);
  const composedOpeningTotals = openingPricingAdjudication.pricingBlocked
    ? { window_count: null, total_opening_sqm: null, glazed_sqm: null }
    : localOpeningTotals;
  const openingEvidence = buildOpeningEvidenceLedger({
    openings: pricedComposedOpenings,
    heldBlockedOpenings: openingPricingAdjudication.heldBlockedOpenings,
    quarantinedOpenings: openingPricingAdjudication.quarantinedOpenings,
    visualOpeningAudit: recoveredVisualOpeningAudit,
    planText,
    planPage: doorEngine?.pageMeta?.pageNumber ?? null,
    floorPlanGaps: doorEngine?.floorPlanGaps,
    floorPlanGapElevationMatches,
    floorPlanTextDimensionMatches,
    promotedFloorPlanGapOpenings: floorPlanGapPromotion.promotedByGapId,
  });
  const visualWindowCount =
    !openingPricingAdjudication.pricingBlocked &&
    visualPromotion &&
    composedOpeningTotals.window_count != null
      ? composedOpeningTotals.window_count
      : null;
  // Re-derive the external wall AREA from the now-richer opening total (perimeter × stud −
  // Σ opening area) whenever the opening set grew — the route-2 symbol fold OR the schedule
  // entry fold above — so external_wall_area_m2 and glazed_sqm move together by the same
  // amount. A strict no-op otherwise (composedOpenings === baseOpenings → same reference), so
  // jobs with neither fold keep their existing ext-wall value untouched.
  const composedExtWallAreaM2 = openingPricingAdjudication.pricingBlocked
    ? null
    : composedOpenings !== baseOpenings && composedOpeningTotals.total_opening_sqm != null
      ? computeExternalWallAreaM2(
          t.external_wall_lm,
          t.ceiling_height_m,
          composedOpeningTotals.total_opening_sqm,
        )
      : t.external_wall_area_m2;
  const extWallAreaFlags = [
    ...extWallFlags,
    ...(openingPricingAdjudication.pricingBlocked ? openingPricingAdjudication.flags : []),
  ];
  const reconFlag = (field: string): string | null =>
    reconciliation.fields.find((f) => f.field === field)?.flag ?? null;
  const reconStatusOf = (field: string): FieldReconciliation["status"] | undefined =>
    reconciliation.fields.find((f) => f.field === field)?.status;
  const flagsFor = (...xs: (string | null | undefined)[]): string[] =>
    xs.filter((x): x is string => typeof x === "string" && x.length > 0);

  // Sources inferred from the provenance the seam already tracks (which path SET the value).
  const measuredSrc = (present: boolean): FieldSource => (present ? "geometry" : "vision");
  const windowCountSrc: FieldSource = windowCountChanged
    ? "vector"
    : windowAggregate.source === "schedule"
      ? "schedule"
      : "vision";
  const windowsBySrc: FieldSource =
    windowAggregate.source === "schedule"
      ? "schedule"
      : windowChanges.length > 0
        ? "vector"
        : "vision";

  const enrichedBase: EnrichedTakeoff = {
    floor_area_m2: fv(
      t.floor_area_m2,
      floorAreaDecision.source,
      floorAreaDecision.confidence,
      floorAreaDecision.flags,
    ),
    garage_area_m2: fv(
      garageOverride && planGarage ? planGarage.areaM2 : t.garage_area_m2,
      garageOverride ? "vector" : measuredSrc(m?.garage_area_m2 != null),
      null,
      garageFlags.length ? garageFlags : undefined,
    ),
    alfresco_area_m2: fv(t.alfresco_area_m2, measuredSrc(m?.alfresco_area_m2 != null)),
    external_wall_lm: fv(
      t.external_wall_lm,
      measuredSrc(m?.perimeter_m != null),
      normConf(geoResult?.confidence?.perimeter),
    ),
    internal_wall_lm:
      doorEngine?.wallTrace != null && doorEngine.wallTrace.internalWallLm > 10
        ? fv(doorEngine.wallTrace.internalWallLm, "vector", "mid", [
            `⚑ ribbon-trace v1 — deterministic from the plan's wall pairs (${doorEngine.wallTrace.ribbonCount} ribbons); known ~+25% joinery bias, VERIFY before pricing. Not exported.`,
            ...roomFlags,
          ])
        : fv(
            t.internal_wall_lm,
            measuredSrc(m?.internal_wall_length_m != null),
            normConf(m?.internal_wall_confidence),
            roomFlags,
          ),
    // Gable span candidate = geometry envelope's SHORT side. Measured (not guessed);
    // the rectangular-envelope assumption is flagged at the consumer (cladding adapter).
    gable_span_m: fv(
      m?.bounding_box_m != null ? Math.min(m.bounding_box_m.width, m.bounding_box_m.height) : null,
      measuredSrc(m?.bounding_box_m != null),
    ),
    roof_area_m2: fv(t.roof_area_m2, "vision"),
    window_count: fv(
      visualWindowCount ??
        (floorPlanGapPromotionFlags.length ? composedOpeningTotals.window_count : t.window_count),
      visualWindowCount != null || floorPlanGapPromotionFlags.length ? "vector" : windowCountSrc,
      visualWindowCount != null
        ? "high"
        : floorPlanGapPromotionFlags.length
          ? "mid"
          : reconConf(reconStatusOf("window_count")),
      flagsFor(
        visualWindowCount != null ? null : reconFlag("window_count"),
        ...floorPlanGapPromotionFlags,
      ),
    ),
    external_door_count: fv(t.external_door_count, "vision"),
    internal_door_count: fv(
      t.internal_door_count,
      "vision",
      doorCountFlags.length > 0 ? "low" : null,
      doorCountFlags,
    ),
    bathroom_count: fv(t.bathroom_count, "vision"),
    ensuite_count: fv(
      t.ensuite_count,
      "vision",
      ensuiteCountFlags.length > 0 ? "low" : null,
      ensuiteCountFlags,
    ),
    laundry_count: fv(t.laundry_count, "vision"),
    kitchen_count: fv(t.kitchen_count, "vision"),
    ceiling_height_m: fv(t.ceiling_height_m, measuredSrc(m?.stud_height_mm != null)),
    foundation_type: fv(
      foundationOrDefault(t.foundation_type),
      t.foundation_type && t.foundation_type.trim() ? "vision" : "asserted",
    ),
    windows_by_room: fv(
      t.windows_by_room,
      windowsBySrc,
      null,
      visualPromotion
        ? flagsFor(
            ...visualPromotion.flags,
            ...openingPricingAdjudication.flags,
            ...visualReconciliationFlags(visualOpeningReconciliation, "windows_by_room"),
          )
        : flagsFor(
            entranceNote,
            safeguardNote,
            reconFlag("entrance_door_width"),
            ...windowChanges.map((c) => c.change),
            ...codeMismatch,
            ...bedNoWindow,
            ...planDraftingFlags,
            ...floorPlanGapPromotionFlags,
            ...openingPricingAdjudication.flags,
            ...visualReconciliationFlags(visualOpeningReconciliation, "windows_by_room"),
          ),
    ),
    windows_schedule: fv(t.windows_schedule ?? null, schedule ? "schedule" : "vision"),
    door_breakdown: fv(t.door_breakdown, "vision"),
    garage_door_size: fv(
      // Route 2 — the sectional callout reconciles the garage size (e.g. fixes a garbled vision
      // read); composedGarageDoorSize == t.garage_door_size when no sectional callout applied.
      composedGarageDoorSize,
      garageDoorConfirmedFromElevation
        ? "vector"
        : garageDoorConfirmedFromSectionalCallout
          ? "vector"
          : garageDoorConfirmedFromVisual
            ? "vision"
            : garageChanged
              ? "vector"
              : "vision",
      garageDoorConfirmedFromElevation ||
        garageDoorConfirmedFromSectionalCallout ||
        garageDoorConfirmedFromVisual
        ? "high"
        : reconConf(reconStatusOf("garage_door_width")),
      flagsFor(
        garageDoorConfirmedFromElevation ||
          garageDoorConfirmedFromSectionalCallout ||
          garageDoorConfirmedFromVisual
          ? null
          : reconFlag("garage_door_width"),
        ...(elevationGarageDoor?.flags ?? []),
        ...visualReconciliationFlags(visualOpeningReconciliation, "garage_door_size"),
      ),
    ),
    external_wall_area_m2: fv(composedExtWallAreaM2, "derived", null, extWallAreaFlags),
    total_area_m2: fv(t.total_area_m2, "derived"),
    // Global, backward-compatible view: identical to the bare TakeoffData.notes string.
    notes: t.notes,
    // Stage 2a — flat opening list + glazed-split totals (additive passthrough).
    openings: pricedComposedOpenings,
    opening_evidence: openingEvidence,
    total_opening_sqm: composedOpeningTotals.total_opening_sqm,
    glazed_sqm: composedOpeningTotals.glazed_sqm,
    ...(recoveredVisualOpeningAudit ? { visual_opening_audit: recoveredVisualOpeningAudit } : {}),
    ...(visualOpeningReconciliation
      ? { visual_opening_reconciliation: visualOpeningReconciliation }
      : {}),
    opening_ai_check: aiOpeningCheck,
    // Persist the geometry room footprints (labels + dims) — the crop-on-anomaly gate and
    // the crop localizer need them after the run. Conditional spread: payloads from
    // geometry-less runs stay byte-identical to today.
    ...(m?.rooms && m.rooms.length > 0 ? { rooms: m.rooms } : {}),
    // Door engine passthrough — counts + review flags persist with the takeoff. Conditional
    // spread: runs without a door pass stay byte-identical to today.
    ...(doorEngine
      ? {
          door_counts_auto: doorEngine.counts,
          door_flags: doorEngine.flags as unknown as Array<Record<string, unknown>>,
          // Plan-overlay slice (13 Jun): every hit (confirmed + flagged) with its page-space
          // position, for the verification printout's plan overlay. Additive: pre-overlay
          // payloads and goldens (which run without a doorEngine) are byte-identical.
          door_hits: [
            ...doorEngine.hinged,
            ...doorEngine.doubles,
            ...doorEngine.cavity,
            ...doorEngine.flags,
          ].map((h) => ({
            type: h.type,
            widthMm: h.widthMm,
            x: h.x,
            y: h.y,
            ...(h.arcMm != null ? { arcMm: h.arcMm } : {}),
            confidence: h.confidence,
            ...(h.note ? { note: h.note } : {}),
          })),
          ...(doorEngine.pageMeta ? { door_page: doorEngine.pageMeta } : {}),
          // Plan-text pass — additive; absent pre-pass payloads round-trip untouched.
          ...(doorEngine.planText
            ? {
                plan_text: {
                  rooms: doorEngine.planText.rooms.map(({ name, widthMm, depthMm, areaM2 }) => ({
                    name,
                    widthMm,
                    depthMm,
                    areaM2,
                  })),
                  windowCodes: doorEngine.planText.windowCodes.map(({ id, heightMm, widthMm }) => ({
                    ...(id ? { id } : {}),
                    heightMm,
                    widthMm,
                  })),
                  frameOpenings: (doorEngine.planText.frameOpenings ?? []).map(({ widthMm }) => ({
                    widthMm,
                  })),
                  draftingIssues: (doorEngine.planText.draftingIssues ?? []).map(
                    ({ kind, text, x, y }) => ({
                      kind,
                      text,
                      x,
                      y,
                    }),
                  ),
                  titleAreas: Object.fromEntries(
                    Object.entries(doorEngine.planText.titleAreas).filter(([, v]) => v != null),
                  ) as Record<string, number>,
                },
              }
            : {}),
        }
      : {}),
    // Pipeline safety (12 Jun): a geometry-less run must be LOUD, never silent — the
    // catch→null fallback hid a dead geometry service for two days while takeoffs ran
    // vision-only with no warning. Conditional spread: geometry-present runs stay
    // byte-identical; absence on older stored payloads simply reads as pre-flag era.
    ...(geoResult
      ? {}
      : {
          geometry_status: fv(
            "unavailable",
            "flagged-unknown",
            "low",
            flagsFor(
              "GEOMETRY LAYER UNAVAILABLE — deterministic measurement and cross-checks did not run; every value on this takeoff is vision-only. Investigate /api/geometry (health AND auth) before relying on or pricing from this takeoff.",
            ),
          ),
        }),
  };

  const enriched: EnrichedTakeoff = {
    ...enrichedBase,
    extracted_quantities: buildExtractedQuantityLedger({
      enriched: enrichedBase,
      jobId: input.jobId,
      runId: input.runId,
      now: input.ledgerTimestamp,
    }),
  };

  return { enriched, reconciliation, pageReconcile, scheduleSafeguard };
}



============================================================
FILE: tests/takeoff/floor-plan-label-recovery.test.ts
============================================================

import { describe, expect, it } from "vitest";
import {
  recoverFloorPlanLabelAssignments,
  type FloorPlanLabelRecoveryAssignment,
} from "../../src/lib/takeoff/floor-plan-label-recovery";
import type { PlanText } from "../../src/lib/takeoff/plan-text";

function planText(overrides: Partial<PlanText> = {}): PlanText {
  return {
    rooms: [
      { name: "FAMILY", widthMm: 4000, depthMm: 5000, areaM2: 20, x: 100, y: 100 },
      { name: "DINING", widthMm: 3000, depthMm: 3000, areaM2: 9, x: 260, y: 100 },
      { name: "ENSUITE", widthMm: 1800, depthMm: 2400, areaM2: 4.32, x: 100, y: 260 },
    ],
    windowCodes: [{ heightMm: 1300, widthMm: 1500, x: 112, y: 102 }],
    titleAreas: {},
    ...overrides,
  };
}

function onlyAssignment(assignments: FloorPlanLabelRecoveryAssignment[]) {
  expect(assignments).toHaveLength(1);
  return assignments[0]!;
}

describe("floor-plan W x H label recovery", () => {
  it("recovers a clean floor-plan opening label when room proximity is unique", () => {
    const assignment = onlyAssignment(
      recoverFloorPlanLabelAssignments({ planText: planText(), page: 1 }),
    );

    expect(assignment).toMatchObject({
      id: "floorplan-label-1",
      status: "extracted",
      room: "FAMILY",
      text: "1300 x 1500",
      page: 1,
      widthMm: 1500,
      heightMm: 1300,
      areaM2: 1.95,
      confidence: "medium",
      bbox: [94, 95, 130, 109],
    });
    expect(assignment.reviewFlags).toEqual([]);
  });

  it("recovers full-height narrow exterior opening labels when assignment is unique", () => {
    const assignment = onlyAssignment(
      recoverFloorPlanLabelAssignments({
        planText: planText({
          windowCodes: [{ heightMm: 2150, widthMm: 600, x: 100, y: 260 }],
        }),
      }),
    );

    expect(assignment).toMatchObject({
      status: "extracted",
      room: "ENSUITE",
      text: "2150 x 600",
      widthMm: 600,
      heightMm: 2150,
      areaM2: 1.29,
    });
  });

  it("keeps very narrow door-like labels in review", () => {
    const assignment = onlyAssignment(
      recoverFloorPlanLabelAssignments({
        planText: planText({
          windowCodes: [{ heightMm: 2150, widthMm: 400, x: 100, y: 260 }],
        }),
      }),
    );

    expect(assignment.status).toBe("review");
    expect(assignment.room).toBe("ENSUITE");
    expect(assignment.reason).toContain("dimension band is large, narrow, or door-like");
  });

  it("keeps narrow low-height bathroom labels in review", () => {
    const assignment = onlyAssignment(
      recoverFloorPlanLabelAssignments({
        planText: planText({
          windowCodes: [{ heightMm: 1100, widthMm: 600, x: 100, y: 260 }],
        }),
      }),
    );

    expect(assignment.status).toBe("review");
    expect(assignment.reason).toContain("dimension band is large, narrow, or door-like");
  });

  it("keeps ambiguous room/order assignments in review", () => {
    const assignment = onlyAssignment(
      recoverFloorPlanLabelAssignments({
        planText: planText({
          windowCodes: [{ heightMm: 1100, widthMm: 1500, x: 180, y: 100 }],
        }),
      }),
    );

    expect(assignment.status).toBe("review");
    expect(assignment.reason).toContain("room/order assignment is ambiguous");
  });

  it("keeps labels near malformed assembly text in review", () => {
    const assignment = onlyAssignment(
      recoverFloorPlanLabelAssignments({
        planText: planText({
          draftingIssues: [
            {
              kind: "malformed_dimension_label",
              text: "1300x175036001300x1750",
              x: 125,
              y: 115,
            },
          ],
        }),
      }),
    );

    expect(assignment.status).toBe("review");
    expect(assignment.reason).toContain("near malformed/contaminated drafting label");
  });
});



============================================================
FILE: tests/takeoff/opening-evidence-label-recovery.test.ts
============================================================

import { describe, expect, it } from "vitest";
import { fv, type EnrichedTakeoff } from "../../src/lib/takeoff/enriched-takeoff";
import { buildExtractedQuantityLedger } from "../../src/lib/takeoff/extracted-quantity-ledger";
import { buildOpeningEvidenceLedger } from "../../src/lib/takeoff/opening-evidence";
import type { PlanText } from "../../src/lib/takeoff/plan-text";

function planText(windowCode: PlanText["windowCodes"][number]): PlanText {
  return {
    rooms: [
      { name: "BED 3", widthMm: 3000, depthMm: 3000, areaM2: 9, x: 100, y: 100 },
      { name: "DINING", widthMm: 3000, depthMm: 3000, areaM2: 9, x: 300, y: 100 },
    ],
    windowCodes: [windowCode],
    titleAreas: {},
  };
}

function extractedRows(openingEvidence: ReturnType<typeof buildOpeningEvidenceLedger>) {
  return buildExtractedQuantityLedger({
    enriched: {
      external_wall_lm: fv(40, "geometry", "high"),
      door_counts_auto: null,
      opening_evidence: openingEvidence,
    } as unknown as EnrichedTakeoff,
    jobId: "job-1",
    runId: "run-1",
  });
}

describe("floor-plan label recovery into opening evidence", () => {
  it("surfaces clean W x H labels as extracted quantity rows without pricing them", () => {
    const evidence = buildOpeningEvidenceLedger({
      openings: [],
      planText: planText({ heightMm: 1300, widthMm: 1500, x: 105, y: 100 }),
      planPage: 2,
    });
    const candidate = evidence.find((item) => item.id === "floorplan-label-1");
    const row = extractedRows(evidence).find((item) => item.id === "opening-floorplan-label-1");

    expect(candidate).toMatchObject({
      status: "extracted",
      priced: false,
      type: "window",
      room: "BED 3",
      width_m: 1.5,
      height_m: 1.3,
      area_m2: 1.95,
    });
    expect(candidate?.evidence[0]).toMatchObject({
      source: "floorplan_text",
      role: "dimension",
      page: 2,
      bbox: [87, 93, 123, 107],
      text: "1300 x 1500",
    });
    expect(row).toMatchObject({
      category: "window",
      status: "extracted",
      source: "pdf_text",
      widthMm: 1500,
      heightMm: 1300,
      areaM2: 1.95,
      warnings: [],
    });
  });

  it("keeps dirty/tall labels visible as needs_review and out of clean area", () => {
    const evidence = buildOpeningEvidenceLedger({
      openings: [],
      planText: planText({ heightMm: 2150, widthMm: 400, x: 105, y: 100 }),
      planPage: 2,
    });
    const candidate = evidence.find((item) => item.id === "floorplan-label-1");
    const row = extractedRows(evidence).find((item) => item.id === "opening-floorplan-label-1");

    expect(candidate).toMatchObject({
      status: "review",
      priced: false,
      width_m: 0.4,
      height_m: 2.15,
      area_m2: null,
    });
    expect(row).toMatchObject({
      status: "needs_review",
      widthMm: 400,
      heightMm: 2150,
      areaM2: null,
      warnings: ["area_not_calculated"],
    });
  });

  it("surfaces full-height narrow labels as clean extracted rows when assignment is unique", () => {
    const evidence = buildOpeningEvidenceLedger({
      openings: [],
      planText: planText({ heightMm: 2150, widthMm: 600, x: 105, y: 100 }),
      planPage: 2,
    });
    const candidate = evidence.find((item) => item.id === "floorplan-label-1");
    const row = extractedRows(evidence).find((item) => item.id === "opening-floorplan-label-1");

    expect(candidate).toMatchObject({
      status: "extracted",
      priced: false,
      width_m: 0.6,
      height_m: 2.15,
      area_m2: 1.29,
    });
    expect(row).toMatchObject({
      status: "extracted",
      widthMm: 600,
      heightMm: 2150,
      areaM2: 1.29,
      warnings: [],
    });
  });
});
