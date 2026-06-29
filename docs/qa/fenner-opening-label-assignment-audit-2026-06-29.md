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
