# Jennian IQ — Specifications Contract (v1)

_Generated from `src/lib/specs/spec-schema.ts` — do not edit by hand._
_Regenerate: `UPDATE_SPEC_CONTRACT=1 npx vitest run tests/specs/spec-contract.test.ts`_

## How the QS reads it

The IQ Import paste lands at `'IQ Import'!A1`. The SPECIFICATIONS block header
sits at row 100; every spec owns a fixed row below it, forever (append-only).
Read the **code from column B at that absolute row** — e.g. heating is
`='IQ Import'!B162`. Column C carries the human-readable selection,
column D the group.

**Code semantics:** blank = not answered (the export never invents a selection),
`0` = explicitly N/A, `1+` = a real selection. Codes follow the meeting form's
printed order, except HEATING which follows Haydon's brief (1 = Fully Ducted,
2 = High Wall). Option *labels* marked (verify) came from truncated form text —
labels may be corrected later; **codes and rows are permanent**.

Note: distinct from `specItems` (text values extracted from spec PDFs) — this
block is the coded client selections made in the app at job load.

## Job

| Spec | QS cell | Codes |
|---|---|---|
| Priority (`priority`) | `'IQ Import'!B101` | **1** Green · **2** Yellow · **3** Red |

## Site & Services

| Spec | QS cell | Codes |
|---|---|---|
| Property type (`property_type`) | `'IQ Import'!B102` | **1** Residential · **2** Rural |
| Soil test required (`soil_test`) | `'IQ Import'!B103` | **1** Yes · **2** No |
| Survey required (`survey`) | `'IQ Import'!B104` | **1** Yes · **2** No |
| Council services (`council_services`) | `'IQ Import'!B105` | **1** Yes · **2** No |
| Septic tank (`septic_tank`) | `'IQ Import'!B106` | **0** N/A · **1** Hynds · **2** Other |
| Water tanks (`water_tanks`) | `'IQ Import'!B107` | **0** N/A · **1** Plastic · **2** Concrete |
| Water tank base (`water_tank_base`) | `'IQ Import'!B108` | **0** N/A · **1** Level base · **2** Half buried (verify) |
| Water pump (`water_pump`) | `'IQ Import'!B109` | **0** N/A · **1** External with shed · **2** Grundfos submersible |
| Rural access way / hardfill (`rural_access`) | `'IQ Import'!B110` | **0** N/A · **1** Yes · **2** No |
| Vehicle crossing required (`vehicle_crossing`) | `'IQ Import'!B111` | **1** Yes · **2** No |
| Fencing required (`fencing`) | `'IQ Import'!B112` | **1** Yes · **2** No |

- _Property type: First question — branches the rural-only services set below._
- _Water tank base: Form text truncated after 'LEVEL BASE  1/2 B…' — labels to verify, codes fixed._

## Structure & Exterior

| Spec | QS cell | Codes |
|---|---|---|
| Foundations (`foundations`) | `'IQ Import'!B113` | **1** Standard · **2** Engineered · **3** Ribraft |
| Roof style (`roof_style`) | `'IQ Import'!B114` | **1** Hip · **2** Gable · **3** Mono |
| Roof material (`roof_material`) | `'IQ Import'!B115` | **1** Colourtile · **2** Longrun |
| Stud height (`stud_height`) | `'IQ Import'!B116` | **1** 2.4m · **2** 2.55m · **3** 2.7m |
| Ceiling (`ceiling_feature`) | `'IQ Import'!B117` | **1** Standard flat · **2** Vaulted · **3** Cathedral |
| Posts (`posts`) | `'IQ Import'!B118` | **0** N/A · **1** Timber, painted · **2** Clad |
| Garage door (`garage_door`) | `'IQ Import'!B119` | **1** Standard · **2** Insulated |
| Window glazing (`window_glazing`) | `'IQ Import'!B120` | **1** Standard · **2** Tinted · **3** Low-E Max · **4** Tinted + Low-E (verify) |
| Front door (`front_door`) | `'IQ Import'!B121` | **1** Standard · **2** Double · **3** Sidelights · **4** Double + sidelights |
| Cat flap (`cat_flap`) | `'IQ Import'!B122` | **1** Yes · **2** No |

- _Roof style: Meeting-confirmed design intent; extraction also reports gables independently._
- _Stud height: Extraction also feeds ceiling height to B22 — QS can cross-check the two._
- _Garage door: Meeting-confirmed spec for the H175–180 block — retires the silent H176 insulated default once the QS reads it._
- _Window glazing: Form text truncated after 'TINTED  LOW-E MAX  BOXE…' — labels to verify, codes fixed._

## Interior

| Spec | QS cell | Codes |
|---|---|---|
| Insulation (`insulation`) | `'IQ Import'!B123` | **1** Standard · **2** Incl. garage · **3** 50mm Expol · **4** Garage + 50mm Expol |
| Acoustic system (`acoustic_system`) | `'IQ Import'!B124` | **1** Yes · **2** No |
| GIB cove (`gib_cove`) | `'IQ Import'!B125` | **1** Std 55mm · **2** Square stop · **3** Other |
| Interior door type (`interior_door_type`) | `'IQ Import'!B126` | **1** Std flush · **2** U groove · **3** V groove |
| Master robe (`master_robe`) | `'IQ Import'!B127` | **1** Standard · **2** Melteca · **3** PC sum |
| Ceiling hatch (`ceiling_hatch`) | `'IQ Import'!B128` | **1** Standard · **2** Fakro attic stair |

## Bathroom

| Spec | QS cell | Codes |
|---|---|---|
| Bathroom vanity (`bathroom_vanity`) | `'IQ Import'!B129` | **1** 900mm · **2** 1200mm · **3** 1500 double |
| Taps (`taps`) | `'IQ Import'!B130` | **1** Standard · **2** Milano · **3** Waipori |
| Mirror (`mirror`) | `'IQ Import'!B131` | **1** Standard · **2** Anti-fog |
| Bath (`bath`) | `'IQ Import'!B132` | **1** Standard · **2** Contro · **3** No bath |
| Tiles around bath (`tiles_around_bath`) | `'IQ Import'!B133` | **0** N/A · **1** Flush · **2** Plinth · **3** Full-wall |
| Shower (`shower`) | `'IQ Import'!B134` | **1** Standard acrylic · **2** Fully tiled |
| Towel rail (`towel_rail`) | `'IQ Import'!B135` | **1** Standard heated · **2** Not heated · **3** Two-rail |
| Toilet (`toilet`) | `'IQ Import'!B136` | **1** Standard · **2** Cygnet Neu · **3** Urbane |
| Basin in separate WC (`basin_in_toilet`) | `'IQ Import'!B137` | **1** Yes · **2** No |

## Ensuite

| Spec | QS cell | Codes |
|---|---|---|
| Ensuite vanity (`ensuite_vanity`) | `'IQ Import'!B138` | **1** 900mm · **2** 1200mm · **3** 1500 double |
| Ensuite mirror (`ensuite_mirror`) | `'IQ Import'!B139` | **1** Standard · **2** Anti-fog |
| Ensuite bath (`ensuite_bath`) | `'IQ Import'!B140` | **1** Standard · **2** Contro · **3** No bath |
| Ensuite tiles around bath (`ensuite_tiles_around_bath`) | `'IQ Import'!B141` | **0** N/A · **1** Flush · **2** Plinth · **3** Full-wall |
| Ensuite shower (`ensuite_shower`) | `'IQ Import'!B142` | **1** Standard acrylic · **2** Fully tiled |
| Ensuite towel rail (`ensuite_towel_rail`) | `'IQ Import'!B143` | **1** Standard heated · **2** Not heated · **3** Two-rail |
| Ensuite toilet (`ensuite_toilet`) | `'IQ Import'!B144` | **1** Standard · **2** Cygnet Neu · **3** Urbane |

- _Ensuite towel rail: Form lists towel rail twice (rows 39 & 69) — assumed second set is ensuite. Verify._
- _Ensuite toilet: Form lists toilet twice (rows 40 & 70) — assumed second set is ensuite. Verify._

## Kitchen & Laundry

| Spec | QS cell | Codes |
|---|---|---|
| Kitchen PC sum (`kitchen_pc`) | `'IQ Import'!B145` | **1** $9K · **2** $12K · **3** $15K · **4** $18K · **5** $22K |
| Walk-in pantry (`walkin_pantry`) | `'IQ Import'!B146` | **0** None · **1** $2.5K · **2** $3.5K · **3** $5.0K · **4** $7.0K |
| Benchtop (`benchtop`) | `'IQ Import'!B147` | **1** Laminate · **2** Engineered stone |
| Splashback (`splashback`) | `'IQ Import'!B148` | **1** Standard · **2** Tiled |
| Waste (`waste_disposal`) | `'IQ Import'!B149` | **1** Standard · **2** Other (verify) |
| Dishwasher (`dishwasher`) | `'IQ Import'!B150` | **1** Standard · **2** Single drawer · **3** Double drawer |
| Cooktop (`cooktop`) | `'IQ Import'!B151` | **1** Standard · **2** Touch & slide · **3** Gas · **4** Induction |
| Oven (`oven`) | `'IQ Import'!B152` | **1** Standard · **2** Two ovens · **3** Double · **4** Freestanding 900 |
| Fridge water connection (`fridge_plumbing`) | `'IQ Import'!B153` | **1** No · **2** Water |
| Laundry unit (`laundry_unit`) | `'IQ Import'!B154` | **1** Standard · **2** $2.5K · **3** Client supplied |
| Hot water (`hot_water`) | `'IQ Import'!B155` | **1** Standard · **2** Rinnai 26 |

- _Waste: Form prints only 'STD' — option 2 reserved. Verify._

## Electrical & Heating

| Spec | QS cell | Codes |
|---|---|---|
| Electrical spec (`electrical_spec`) | `'IQ Import'!B156` | **1** Residential · **2** Rural |
| Home hub (`home_hub`) | `'IQ Import'!B157` | **1** Yes · **2** No |
| Alarm system (`alarm`) | `'IQ Import'!B158` | **0** None · **1** Prewire · **2** Full installation |
| Doorbell (`doorbell`) | `'IQ Import'!B159` | **1** Yes · **2** No |
| Solar power (`solar_power`) | `'IQ Import'!B160` | **1** Yes · **2** No |
| Feature lighting (`feature_lighting`) | `'IQ Import'!B161` | **1** Yes · **2** No |
| Heating (`heating`) | `'IQ Import'!B162` | **1** Fully ducted heatpump · **2** High wall heatpump · **3** Gas fire · **4** Log fire |
| Heat transfer kit (`heat_transfer_kit`) | `'IQ Import'!B163` | **1** Yes · **2** No |
| Ventilation (`ventilation`) | `'IQ Import'!B164` | **1** Yes · **2** No |
| Solatube (`solatube`) | `'IQ Import'!B165` | **0** N/A · **1** Yes · **2** No |
| Beam vacuum (`beam_vacuum`) | `'IQ Import'!B166` | **0** N/A · **1** Yes · **2** No |
| Skylights (`skylights`) | `'IQ Import'!B167` | **0** N/A · **1** Yes · **2** No |

- _Electrical spec: Own form line (D52); picker pre-suggests from property type but it is its own answer._
- _Heating: Code order set by Haydon's brief (ducted=1, high wall=2) — the one deliberate deviation from form print order._

## Flooring

| Spec | QS cell | Codes |
|---|---|---|
| Carpet (`carpet`) | `'IQ Import'!B168` | **1** Standard · **2** Entry · **3** Other |
| Vinyl (`vinyl`) | `'IQ Import'!B169` | **1** Std planking · **2** Sheet vinyl · **3** Other |
| Underlay (`underlay`) | `'IQ Import'!B170` | **1** 9.5mm · **2** 11mm |
| Tiled floor — Entry (`tiled_floor_entry`) | `'IQ Import'!B171` | **0** N/A · **1** Yes · **2** No |
| Tiled floor — Bathroom (`tiled_floor_bath`) | `'IQ Import'!B172` | **0** N/A · **1** Yes · **2** No |
| Tiled floor — Ensuite (`tiled_floor_ensuite`) | `'IQ Import'!B173` | **0** N/A · **1** Yes · **2** No |
| Tiled floor — Kitchen (`tiled_floor_kitchen`) | `'IQ Import'!B174` | **0** N/A · **1** Yes · **2** No |
| Tiled floor — Dining (`tiled_floor_dining`) | `'IQ Import'!B175` | **0** N/A · **1** Yes · **2** No |
| Tiled floor — Laundry (`tiled_floor_laundry`) | `'IQ Import'!B176` | **0** N/A · **1** Yes · **2** No |
| Garage carpet (`garage_carpet`) | `'IQ Import'!B177` | **1** Yes · **2** No |
| Wall tiling (`wall_tiling`) | `'IQ Import'!B178` | **1** Yes · **2** No |

