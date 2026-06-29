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

## Commands Run

```powershell
git status --short
npx vitest run tests/takeoff/floor-plan-label-recovery.test.ts tests/takeoff/opening-evidence-label-recovery.test.ts tests/takeoff/plan-text.test.ts tests/takeoff/plan-text-compose.test.ts tests/takeoff/floor-plan-text-height-witness.test.ts
npx tsx - # parsed Fenner floor text and floor-plan label recovery assignments
npx tsx - # post-commit follow-up audit over Fenner labels, gaps, elevation candidates, and ledger rows
```
