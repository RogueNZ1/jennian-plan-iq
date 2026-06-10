# Jennian IQ — Specifications Contract (v2)

_Generated from `src/lib/specs/spec-schema.ts` — do not edit by hand._
_Regenerate: `UPDATE_SPEC_CONTRACT=1 npx vitest run tests/specs/spec-contract.test.ts`_

## How the QS reads it

The IQ Import paste lands at `'IQ Import'!A1`. The SPECIFICATIONS block header
sits at row 100; every spec owns a fixed row below it, forever (append-only).
Read the **code from column B at that absolute row** — e.g. heating is
`='IQ Import'!B108`. Column C carries the human-readable selection,
column D the group.

**Code semantics:** blank = not answered (the export never invents a selection),
`0` = explicitly N/A, `1+` = a real selection. Codes follow the meeting form's
printed order, except HEATING which follows Haydon's brief (1 = Fully Ducted,
2 = High Wall). Option *labels* marked (verify) came from truncated form text —
labels may be corrected later; **codes and rows are permanent**.

Note: distinct from `specItems` (text values extracted from spec PDFs) — this
block is the coded client selections made in the app at job load.

## Services

| Spec | QS cell | Codes |
|---|---|---|
| Services (`services`) | `'IQ Import'!B101` | **1** Residential · **2** Rural |

## Kitchen

| Spec | QS cell | Codes |
|---|---|---|
| Kitchen PC sum (`kitchen_pc`) | `'IQ Import'!B102` | **1** $10K · **2** $15K · **3** $20K · **4** $25K · **5** $30K |

## Laundry

| Spec | QS cell | Codes |
|---|---|---|
| Laundry PC sum (`laundry_pc`) | `'IQ Import'!B103` | **1** $2K · **2** $4K · **3** Robinhood |

## Appliances

| Spec | QS cell | Codes |
|---|---|---|
| Cooktop (`cooktop`) | `'IQ Import'!B104` | **1** Standard · **2** Gas · **3** Induction |
| Oven (`oven`) | `'IQ Import'!B105` | **1** Standard · **2** Double · **3** Freestanding |
| Dishwasher (`dishwasher`) | `'IQ Import'!B106` | **1** Standard · **2** Double draw · **3** Single draw |

## Hot Water

| Spec | QS cell | Codes |
|---|---|---|
| Hot water (`hot_water`) | `'IQ Import'!B107` | **1** Standard · **2** Rinnai 26 · **3** Hot water heat pump |

## Heating

| Spec | QS cell | Codes |
|---|---|---|
| Heating (`heating`) | `'IQ Import'!B108` | **1** Fully ducted · **2** High wall heat pump · **3** Gas fire · **4** Log fire |

- _Heating: Codes fixed by Haydon's brief — ducted=1, high wall=2._

## Bathrooms

| Spec | QS cell | Codes |
|---|---|---|
| Shower (`shower`) | `'IQ Import'!B109` | **1** Acrylic · **2** Tiled wet-floor |
| Bath (`bath`) | `'IQ Import'!B110` | **1** Tiled-in cradle · **2** Freestanding |

## Interior

| Spec | QS cell | Codes |
|---|---|---|
| Interior door type (`interior_door_type`) | `'IQ Import'!B111` | **1** Std flush · **2** U groove · **3** V groove |
| Ceiling hatch (`ceiling_hatch`) | `'IQ Import'!B112` | **1** Standard · **2** Fakro attic stairs |

## Insulation

| Spec | QS cell | Codes |
|---|---|---|
| Acoustic insulation (`insulation_acoustic`) | `'IQ Import'!B113` | **1** No (standard) · **2** Yes |
| Underslab insulation (`insulation_underslab`) | `'IQ Import'!B114` | **1** No (standard) · **2** Yes |
| Hot edge insulation (`insulation_hot_edge`) | `'IQ Import'!B115` | **1** No (standard) · **2** Yes |

## Flooring

| Spec | QS cell | Codes |
|---|---|---|
| Garage carpet (`garage_carpet`) | `'IQ Import'!B116` | **1** No (standard) · **2** Yes |

