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

| Metric | Count | Meaning |
| --- | ---: | --- |
| Auto recovered clean | 0 | Complete width + height + area can enter clean ledger from current safe evidence. |
| Review required | 16 | Dimensions or opening evidence exist, but assignment/assembly proof is not clean enough. |
| Missing/conflict | 1 | Evidence is missing or not enough to construct the row. |

Additional parser false-positive review targets:

- `780 x 1400` skylight label, instance 1;
- `780 x 1400` skylight label, instance 2.

These should not become exterior wall openings without review.

## Status Definitions

| Status | Meaning |
| --- | --- |
| `auto_recovered_clean` | Current safe evidence recovers row, dimensions, and area without review. |
| `recovered_needs_review` | Useful dimension evidence exists, but row/face/order/type assignment is not yet safe. |
| `dirty_assembly_review` | Assembly or drafting issue is visible; automatic split/merge would be unsafe. |
| `missing_evidence` | A benchmark opening lacks enough current-run evidence for dimensions or row assignment. |
| `conflict` | Parsed evidence likely describes something other than an exterior opening. |

## Scorecard Rows

Width/height/area below are diagnostic candidate values only. They are not active ledger
values unless the row status is `auto_recovered_clean`.

| Row id | Location / room | Type | Printed label used | Width mm | Height mm | Area m2 | Status | Reason | Evidence |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| `fenner-sc-01` | Bed 1 | window, qty 2 | `L11/L12: 1100 x 800` | 800 | 1100 | 1.76 | `recovered_needs_review` | Clean labels and elevation-sized evidence exist, but nearest floor-gap is a 381 mm partial gap. | floor text L11/L12; floor-gap `floorplan-gap-3`; elevation face-4 approx `821 x 1079`. |
| `fenner-sc-02` | Bed 1 | slider | none clean | null | null | null | `dirty_assembly_review` | Large opening has elevation/width evidence but no clean floor-plan HxW label assignment. | width-only `2400`; elevation sliders around `2400 x 2050/2070`; floor bbox not row-safe. |
| `fenner-sc-03` | Ensuite | window | `L7: 2150 x 600` | 600 | 2150 | 1.29 | `recovered_needs_review` | Strongest non-clean candidate; 156 mm gap delta and dimension-order hazard need review. | floor text L7; floor-gap `floorplan-gap-2`; elevation face-10 approx `601 x 2049`. |
| `fenner-sc-04` | Bed 2 | window | `L6/L10: 1300 x 1500` | 1500 | 1300 | 1.95 | `recovered_needs_review` | Clean label exists but duplicate label assignment is not unique. | floor text L6 or L10; no safe gap bbox; no close elevation check. |
| `fenner-sc-05` | Bed 3 | window | `L1/L2/L13: 1300 x 2400` | 2400 | 1300 | 3.12 | `recovered_needs_review` | Clean label exists but three identical labels compete for multiple rooms. | floor text L1/L2/L13; no safe gap bbox; no close elevation check. |
| `fenner-sc-06` | Bed 4 | window | `L6/L10: 1300 x 1500` | 1500 | 1300 | 1.95 | `recovered_needs_review` | Clean label exists but duplicate assignment is not unique. | floor text L6 or L10; nearest exterior candidate low confidence. |
| `fenner-sc-07` | Toilet | window | `L8: 1100 x 600` | 600 | 1100 | 0.66 | `recovered_needs_review` | Clean label and elevation-sized evidence exist, but row assignment is not clean. | floor text L8; floor-gap `floorplan-gap-11` low-confidence/ambiguous; elevation face-1/10 approx `656 x 1143`. |
| `fenner-sc-08` | Bathroom | window | `L9: 1100 x 1200` | 1200 | 1100 | 1.32 | `recovered_needs_review` | Clean label and elevation-sized evidence exist, but row assignment is not clean. | floor text L9; floor-gap `floorplan-gap-11` low-confidence/ambiguous; elevation face-1 approx `1180 x 1190`. |
| `fenner-sc-09` | Kitchen | window | `L3: 1100 x 1500` | 1500 | 1100 | 1.65 | `recovered_needs_review` | Clean label has loose elevation evidence, but nearest floor-gap width is 2747 mm and likely wrong. | floor text L3; floor-gap `floorplan-gap-1`; elevation face-10 approx `1554 x 999`. |
| `fenner-sc-10` | Family | window | `L1/L2/L13: 1300 x 2400` | 2400 | 1300 | 3.12 | `recovered_needs_review` | Clean label exists but assignment conflicts with other 1300 x 2400 labels/rooms. | floor text L1/L2/L13; no safe gap bbox; no close elevation check. |
| `fenner-sc-11` | Family | slider / overlight assembly | malformed/width-only, no clean HxW | null | null | null | `dirty_assembly_review` | Expected dirty architect target. The label/assembly is not a clean single opening row. | drafting issue `1300x175036001300x1750`; width-only `3000`; no row-safe elevation correspondence. |
| `fenner-sc-12` | Dining | window | `L1/L2/L13: 1300 x 2400` | 2400 | 1300 | 3.12 | `recovered_needs_review` | Clean label exists but assignment conflicts with Family/Bed 3 candidates. | floor text L1/L2/L13; no safe gap bbox; no close elevation check. |
| `fenner-sc-13` | Lounge | slider | none clean | null | null | null | `recovered_needs_review` | Elevation and width-only evidence exist, but no clean floor-plan HxW label row is assigned. | width-only `3600`; elevation face-4 sliders around `3581/3598 x 2050/2125`. |
| `fenner-sc-14` | Garage Windows | window | none clean | 2000 | null | null | `missing_evidence` | Width-only text exists, but height is not proven by a current clean floor-plan/elevation row. | width-only `2000`; no safe HxW label; no close elevation check. |
| `fenner-sc-15` | Garage Windows | window | `L4: 700 x 3000` | 3000 | 700 | 2.10 | `recovered_needs_review` | Clean label and loose elevation-sized evidence exist, but assignment is not row-safe. | floor text L4; floor-gap `floorplan-gap-17` low-confidence/ambiguous; elevation face-20 approx `3048 x 597`. |
| `fenner-sc-16` | Garage Door 1 | garage door | none clean | null | null | null | `recovered_needs_review` | Type and dimensions are visible in elevation/width-only evidence, but garage-door exclusion/pricing handling is separate. | width-only `4800`; elevation face-5 garage door approx `4873 x 2100`. |
| `fenner-sc-17` | Entrance | front entry / sidelight assembly | none clean | null | null | null | `dirty_assembly_review` | Expected dirty architect target. Current floor-plan text does not provide a safe clean row. | width-only `1400` nearby; no clean HxW; no safe elevation correspondence. |

## False-Positive / Conflict Candidates

| Candidate | Parsed text | Status | Reason |
| --- | --- | --- | --- |
| `fenner-fp-01` | `L14: 780 x 1400` | `conflict` | The nearby text says `Skylight`; parser sees an opening-like dimension but this is not an exterior wall opening. |
| `fenner-fp-02` | `L15: 780 x 1400` | `conflict` | Same skylight pattern; keep out of clean recovery. |

## Exact Review Targets

Highest-value review targets:

1. `fenner-sc-11` - Family slider / overlight assembly.
2. `fenner-sc-17` - Front entry / sidelight assembly.
3. `fenner-sc-03` - Ensuite `2150 x 600`, because it is the strongest near-clean case but has a dimension-order hazard.
4. `fenner-fp-01` and `fenner-fp-02` - Skylight labels misparsed as exterior opening candidates.

Secondary review targets:

- duplicate `1300 x 2400` labels: Family / Dining / Bed 3 assignment;
- duplicate `1300 x 1500` labels: Bed 2 / Bed 4 assignment;
- large sliders/garage openings that rely on width-only/elevation evidence.

## Product Decision

Current product baseline:

- automatic clean recovery rate is 0/17;
- the system is preserving uncertainty instead of guessing;
- most Fenner rows are not hopeless, but they need a narrow assignment improvement before
  they can become clean ledger rows;
- dirty assemblies are visible and should be flagged explicitly instead of hidden in totals.

Recommended next slice:

`2H.6 - Implement one narrow clean W x H label assignment improvement`

Target only normal, non-assembly rows with clean printed floor-plan labels and unique room/order
assignment. Do not include:

- Family slider / overlight assembly;
- front entry / sidelight assembly;
- skylight labels;
- garage-door pricing behavior;
- width-only/elevation-only openings.

After 2H.6, rerun this scorecard and compare:

- automatic clean recovery count;
- review-required count;
- missing/conflict count;
- exact review target list.

## Commands Run

```powershell
git status --short
rg -n "Family|Front entry|sidelight|overlight|dirty|assembly|Fenner" docs/qa tests/fixtures tests/doors scripts src/lib/takeoff
npx tsx - # parsed Fenner floor text, standalone widths, drafting issues
npx tsx - # matched Fenner benchmark rows to floor labels, standalone widths, and elevation vector evidence
```
