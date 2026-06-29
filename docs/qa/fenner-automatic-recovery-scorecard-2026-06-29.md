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
| Auto recovered clean | 7 rows / 8 units | Complete width + height + area recovered from clean floor-plan W x H label evidence.         |
| Review required      |           9 rows | Useful evidence exists, but assignment, assembly, or opening type proof is not clean enough. |
| Missing/conflict     |            1 row | Evidence is missing or not enough to construct the row.                                      |
| False positives      |                0 | Skylight labels are excluded from exterior wall opening candidates.                          |

Current parser/recovery detail:

- parsed floor-plan opening labels: 13;
- clean label evidence rows: 8;
- clean recovered label area: 16.34 m2;
- retained label-review rows: 5;
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

| Row id         | Location / room | Type                             | Printed label used                  | Width mm | Height mm | Area m2 | Status                   | Reason                                                                                                      | Evidence                                                                                 |
| -------------- | --------------- | -------------------------------- | ----------------------------------- | -------: | --------: | ------: | ------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `fenner-sc-01` | Bed 1           | window, qty 2                    | `floorplan-label-11/12: 1100 x 800` |      800 |      1100 |    1.76 | `auto_recovered_clean`   | Two clean labels assigned to `MASTERBED` by unique room proximity/order.                                    | floor-plan text labels with page+bbox; no assumed height; no pricing write.              |
| `fenner-sc-02` | Bed 1           | slider                           | none clean                          |     null |      null |    null | `recovered_needs_review` | Large opening has width/elevation evidence but no clean floor-plan HxW label assignment.                    | width-only `2400`; elevation sliders around `2400 x 2050/2070`; floor bbox not row-safe. |
| `fenner-sc-03` | Ensuite         | window                           | `floorplan-label-7: 2150 x 600`     |      600 |      2150 |    null | `recovered_needs_review` | Expected near-clean unresolved case. Tall/narrow label is retained for review and excluded from clean area. | floor-plan text label with page+bbox; floor-gap/elevation support remains review-only.   |
| `fenner-sc-04` | Bed 2           | window                           | `floorplan-label-10: 1300 x 1500`   |     1500 |      1300 |    1.95 | `auto_recovered_clean`   | Clean W x H label assigned to `BED2` by unique room proximity/order.                                        | floor-plan text label with page+bbox; no assumed height; no pricing write.               |
| `fenner-sc-05` | Bed 3           | window                           | `floorplan-label-13: 1300 x 2400`   |     2400 |      1300 |    3.12 | `auto_recovered_clean`   | Clean W x H label assigned to `BED3` by unique room proximity/order.                                        | floor-plan text label with page+bbox; no assumed height; no pricing write.               |
| `fenner-sc-06` | Bed 4           | window                           | `floorplan-label-6: 1300 x 1500`    |     1500 |      1300 |    1.95 | `auto_recovered_clean`   | Clean W x H label assigned to `STUDY/BED4` by unique room proximity/order.                                  | floor-plan text label with page+bbox; no assumed height; no pricing write.               |
| `fenner-sc-07` | Toilet          | window                           | `floorplan-label-8: 1100 x 600`     |      600 |      1100 |    null | `recovered_needs_review` | Small/narrow label remains visible but outside the clean dimension band.                                    | floor-plan text label retained as needs-review evidence; no clean area.                  |
| `fenner-sc-08` | Bathroom        | window                           | `floorplan-label-9: 1100 x 1200`    |     1200 |      1100 |    1.32 | `auto_recovered_clean`   | Clean W x H label assigned to `BATH` by unique room proximity/order.                                        | floor-plan text label with page+bbox; no assumed height; no pricing write.               |
| `fenner-sc-09` | Kitchen         | window                           | `floorplan-label-3: 1100 x 1500`    |     1500 |      1100 |    null | `recovered_needs_review` | Label is usable evidence but room/order assignment is ambiguous near Dining/Kitchen.                        | floor-plan text label retained as needs-review evidence; no clean area.                  |
| `fenner-sc-10` | Family          | window                           | `floorplan-label-1: 1300 x 2400`    |     2400 |      1300 |    3.12 | `auto_recovered_clean`   | Clean W x H label assigned to `FAMILY` by unique room proximity/order.                                      | floor-plan text label with page+bbox; no assumed height; no pricing write.               |
| `fenner-sc-11` | Family          | slider / overlight assembly      | malformed/width-only, no clean HxW  |     null |      null |    null | `dirty_assembly_review`  | Expected dirty architect target. The label/assembly is not a clean single opening row.                      | drafting issue `1300x175036001300x1750`; width-only `3000`; no row-safe clean HxW label. |
| `fenner-sc-12` | Dining          | window                           | `floorplan-label-2: 1300 x 2400`    |     2400 |      1300 |    3.12 | `auto_recovered_clean`   | Clean W x H label assigned to `DINING` by unique room proximity/order.                                      | floor-plan text label with page+bbox; no assumed height; no pricing write.               |
| `fenner-sc-13` | Lounge          | slider                           | none clean                          |     null |      null |    null | `recovered_needs_review` | Elevation and width-only evidence exist, but no clean floor-plan HxW label row is assigned.                 | width-only `3600`; elevation face-4 sliders around `3581/3598 x 2050/2125`.              |
| `fenner-sc-14` | Garage Windows  | window                           | none clean                          |     2000 |      null |    null | `missing_evidence`       | Width-only text exists, but height is not proven by a current clean floor-plan/elevation row.               | width-only `2000`; no safe HxW label; no close elevation check.                          |
| `fenner-sc-15` | Garage Windows  | window                           | `floorplan-label-4: 700 x 3000`     |     3000 |       700 |    null | `recovered_needs_review` | Large/narrow garage-window label remains review-only and excluded from clean area.                          | floor-plan text label with page+bbox; no clean area.                                     |
| `fenner-sc-16` | Garage Door 1   | garage door                      | none clean                          |     null |      null |    null | `recovered_needs_review` | Type and dimensions are visible in elevation/width-only evidence, but garage-door handling is separate.     | width-only `4800`; elevation face-5 garage door approx `4873 x 2100`.                    |
| `fenner-sc-17` | Entrance        | front entry / sidelight assembly | none clean                          |     null |      null |    null | `dirty_assembly_review`  | Expected dirty architect target. Current floor-plan text does not provide a safe clean row.                 | width-only `1400` nearby; no clean HxW; no safe elevation correspondence.                |

## False-Positive / Conflict Candidates

| Candidate       | Parsed text                 | Status    | Reason                                                                             |
| --------------- | --------------------------- | --------- | ---------------------------------------------------------------------------------- |
| Skylight labels | `780 x 1400`, two instances | `ignored` | Nearby `Skylight` text excludes both labels from exterior wall opening candidates. |

## Exact Review Targets

Highest-value review targets:

1. `fenner-sc-11` - Family slider / overlight assembly.
2. `fenner-sc-17` - Front entry / sidelight assembly.
3. `fenner-sc-03` - Ensuite `2150 x 600`, because it is the strongest near-clean case but remains tall/narrow/ambiguous for automatic clean recovery.

Secondary review targets:

- `fenner-sc-07` Toilet `1100 x 600`, retained because the narrow 600 mm label is outside the current clean band;
- `fenner-sc-09` Kitchen `1100 x 1500`, retained because assignment is ambiguous near Dining/Kitchen;
- large sliders and garage openings that rely on width-only/elevation evidence.

## Product Decision

Slice 2H.5 moved Fenner from:

- automatic clean recovery rate: 0/17 rows;
- skylight false positives: 2.

to:

- automatic clean recovery rate: 7/17 rows, 8/18 units;
- clean floor-plan W x H labels recovered: 8;
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

## Commands Run

```powershell
git status --short
npx vitest run tests/takeoff/floor-plan-label-recovery.test.ts tests/takeoff/opening-evidence-label-recovery.test.ts tests/takeoff/plan-text.test.ts tests/takeoff/plan-text-compose.test.ts tests/takeoff/floor-plan-text-height-witness.test.ts
npx tsx - # parsed Fenner floor text and floor-plan label recovery assignments
```
