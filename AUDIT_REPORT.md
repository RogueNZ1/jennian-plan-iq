# Jennian IQ — Full Data Integrity Audit

**Mode:** Audit only. No code was changed during this audit. Every finding below
cites `file:line` and, where possible, a real intermediate value taken from an
actual run.

**Date:** 2026-05-30
**Repos audited:**
- `jennian-plan-iq` (TypeScript / TanStack Start / Cloudflare) — main IQ app
- `jennian-iq-geometry-api` (Python / FastAPI / Railway) — geometry measurement

**Live evidence base:** three real JM-0003 export workbooks found in
`~/Downloads/` were opened and their cells dumped:
- `JM-0003-SRTH-takeoffs-2026-05-26.xlsx`
- `JM-0003-ADSTGH-takeoffs-2026-05-26.xlsx`
- `JM-0003-etdyj-takeoffs-2026-05-26.xlsx`

All three are exports of the **same plan (JM-0003)** produced by the concept /
Detailed-Review pipeline (`upload.tsx`). Their sheets are `Takeoffs` +
`IQ Data Input` (the `writeIQDataSheetFull` Quick-Export path instead produces
`Cover` + `5. Data Input House ` + `IQ Data Input`, confirming these came from
the concept path).

---

## 0. Executive Summary

The IQ pipeline produces **structurally well-organised but numerically
unreliable** output. The most serious problem is **non-determinism**: the same
plan (JM-0003) run three times produced materially different quantities — window
count 13 vs 7, internal-wall length 3.01 lm vs 15.56 lm, garage-door dimension
"610x3000" vs "2000". A QS cannot trust a number that changes by 80% between runs
of the same drawing.

Underneath that headline sit a cluster of concrete, reproducible defects: a
string-key mismatch that silently drops **all** internal doors from the QS export
(`"interior_door"` vs `"internal_door"`), a garage-door classifier that emits raw
junk dimensions when it cannot match a size band, a roof area that is always just
`floor × 1.15` regardless of pitch, an internal-wall estimator that collapses to a
near-zero value, a QS-export reader that ignores **approved** values and re-exports
raw extractions, a `val()` writer that cannot distinguish "zero" from "missing",
and several windows-by-room targets (`toilet`, `kitchenExtra`, `garageDoor2`,
`laundry`) that are computed but never written to any QS cell.

The v5.3 "main room vs service room" internal-wall confidence feature is **dead
code on the real geometry path**, because the OCR never assigns room labels.

**Severity tally:** 4 Critical, 7 High, 6 Medium, 4 Low.

Nothing in this report has been fixed. The ranked fix list is in §10.

---

## 1. System Map & Inventory

### 1.1 Two independent pipelines (the central architectural fact)

There are **two separate takeoff pipelines that do not share a data path**:

| | Pipeline A — "Quick / Automatic Takeoff" | Pipeline B — "Concept / Detailed Review" |
|---|---|---|
| Entry | `src/lib/takeoff/run.ts` | `src/routes/upload.tsx` → `concept.functions.ts` |
| Method | Deterministic regex over PDF text | 3-pass AI (Anthropic) + geometry API |
| Output store | **Supabase** tables (`module_items`, `opening_schedule`, `extracted_quantities`, `door_counts`) | **In-memory** `TakeoffData`, written straight to an `.xlsx` |
| Export reads from | Supabase (`buildQSExportData`) | the in-memory `TakeoffData` it just built |

The QS export route `src/routes/jobs.$jobId_.export.tsx` reads **exclusively from
Supabase** via `buildQSExportData` (`iq-qs-export.ts:148`). The concept pipeline's
richer AI output never lands in Supabase, so the Quick Export and the concept
export can disagree for the same job. (See §8.)

### 1.2 Geometry API surface (`jennian-iq-geometry-api`)

- `pipeline/ocr.py` — OCR text values, room-dimension extraction, internal-wall estimate, MAIN/SERVICE keyword lists.
- `pipeline/measure.py` — OpenCV polygon geometry (floor area, perimeter, external wall).
- `pipeline/result.py` — reconciles geometry vs OCR; `score_internal_wall_confidence`.
- Reached from the app via Cloudflare proxy `/api/geometry/` (injects `GEOMETRY_API_KEY`).

### 1.3 AI passes (concept pipeline)

- Pass 0 `recognise-plan.ts` — `recognisePlan` → `PlanContext` (dimension format, stud height…).
- Pass 1 `extract-annotations.ts` — `extractAnnotations` → raw opening/room annotations.
- Pass 2 `classify-annotations.ts` — **deterministic**, no AI; turns raw annotations into `TakeoffData`.

Model is pinned to `claude-opus-4-5` (per code comment — not to be changed).

---

## 2. Field Lineage Register

Legend: ✅ measured/extracted · ⚠ derived/assumed · ❌ broken or lossy link.

| QS field | Origin | Path | Status |
|---|---|---|---|
| Floor area | OCR "living/over-frame area" or OpenCV polygon | `ocr.py` → `result.py:_reconcile` → `floor_area_m2` → `upload.tsx` merge → `D12` | ✅ (but non-deterministic, §4) |
| Perimeter / Ext wall length | OpenCV perimeter | `measure.py` → `perimeter_m` → `external_wall_lm` (same value duplicated to `D15` **and** `D19`) | ⚠ duplicate |
| Internal wall length | Room-dim estimate | `ocr.py:compute_internal_wall_length_m` → `internal_wall_m` | ❌ collapses (3.01 lm, §5.3) |
| Roof area | **Always** `floor × 1.15` | `classify-annotations.ts:91` | ⚠ never measured |
| Window count / windows-by-room | AI Pass 1 → Pass 2 `windowsMap` | `classify-annotations.ts:27-51` | ❌ non-deterministic + lossy mapping (§6) |
| Internal doors | AI / text | `internal_door_count`; QS opening path filters `"interior_door"` | ❌ dropped (§5.5) |
| Garage door size | AI annotation → `classifyGarageDoor` | `classify.ts:243`, `classify-annotations.ts:55-64` | ❌ junk passthrough (§5.4) |
| Ceiling/stud height | `PlanContext.studHeightMm` / OCR | `classify-annotations.ts:107` → `D20` | ✅ |
| Alfresco / garage area | OCR area patterns | `ocr.py` → `result.py` | ✅ when present |
| Approved/confirmed values | `module_items.approved_value` | **not read by QS export** | ❌ (§5.6) |
| Cladding type code | Elevation PDF only | `cross-reference.ts:63` | ⚠ null without elevations |

---

## 3. Layer-by-Layer Failure-Mode Audit

### 3A. Geometry / Railway (`ocr.py`, `result.py`)

- **Internal-wall dedup over-collapses.** `compute_internal_wall_length_m`
  (`ocr.py:326-362`) sorts all room dimensions ascending, then keeps a value only
  if it differs from **the previous kept value** by >10% (`ocr.py:354-359`). On a
  sorted list this chains: a run of dimensions each within 10% of its neighbour
  collapses to a single value, so the sum badly under-counts. Live result:
  JM-0003 internal wall = **3.01 lm** (run SRTH) for a 136 m² house. (§5.3)
- **Room labels are never populated.** `extract_room_dimensions` constructs every
  `RoomDimension(width_mm=w, depth_mm=d)` with the default `label=""`
  (`ocr.py:295, 306`). Therefore in `result.py:score_internal_wall_confidence`
  the `MAIN_ROOM_KEYWORDS`/`SERVICE_ROOM_KEYWORDS` branch is never reached — the
  `not (label).strip()` rule (`result.py:182`) makes **every** room count as a
  "main" room. The v5.3 service-room feature is dead on this path. (§5.8)
- **OCR area "smart scan" picks `min()`** of all area candidates
  (`ocr.py:128`, `_scan_area_values`). When a plan prints several m² values, the
  smallest wins. This explains floor area drifting 136.69 vs 136.3 between runs
  if OCR catches a different candidate set.

### 3B. AI three passes (`recognise-plan.ts`, `extract-annotations.ts`, `classify-annotations.ts`)

- **Silent fallbacks hide failure.** Pass 0 returns a synthetic fallback
  `PlanContext` on any error (`recognise-plan.ts:66-91`, silent `catch`); Pass 1
  returns `EMPTY_ANNOTATIONS` on error (`extract-annotations.ts`). No raw AI
  response is persisted, so a degraded run is indistinguishable from a good one.
- **No determinism control / no retry.** `concept.functions.ts:306-340` runs each
  pass once. AI output is stochastic; nothing pins or records a seed. This is the
  mechanism behind §4's non-determinism.
- **Pass 2 room-dim guard** (`classify-annotations.ts:33`): skips an annotation
  only when **both** dims > 2000 mm. A misread like `610 × 3000` (one dim < 2000)
  is therefore **not** treated as a room box and leaks into window/garage logic.

### 3C. Reconciliation (`result.py`)

- `_reconcile` (`result.py:121-153`) returns the **printed** value whenever both
  printed and geometry exist and agree within `TOLERANCE = 0.10`. Sound, but the
  10% band is wide enough that a 9% geometry error is reported as "high"
  confidence.

### 3D. Export (`iq-qs-export.ts`, `jobs.$jobId_.export.tsx`)

- `getVal`/`getNum` read **`extracted_value` only** (`iq-qs-export.ts:171-173`),
  never `approved_value`. (§5.6)
- `val()` skips `0` (`iq-qs-export.ts:755`). (§5.1)
- `interiorDoors` filter uses `"interior_door"`; producers emit `"internal_door"`.
  (§5.5)
- Job-info values are written to `I3/I4/I5/I8` while their labels sit at
  `A5/A6/A7/A8` — a 2-row visual offset. (§5.7)
- Computed-but-unmapped windows-by-room keys: `toilet`, `kitchenExtra`,
  `garageDoor2`, plus `laundry` (no key at all). (§6)

### 3E. Supabase persistence (`populate-modules.ts`, `extract-*.ts`, `iq-measurements.ts`)

- Persistence logic is careful: approved values are never silently overwritten;
  drift >2% flags `review_required` (`populate-modules.ts:191`,
  `extract-quantities.ts:253`). This layer is the **healthiest** in the system.
- But it only feeds **Pipeline A**. Pipeline B's AI output never reaches these
  tables, so the safety here doesn't protect the concept export.

---

## 4. Live Data-Integrity Run — JM-0003 (three real exports)

I could not invoke the running app/Geometry API against the original JM-0003 PDF
from this environment, so I used the **three real JM-0003 workbooks** already on
disk as the live evidence. They are exports of the same plan.

| Field | SRTH run | ADSTGH run | etdyj run | Verdict |
|---|---|---|---|---|
| Floor area (m²) | **136.69** | 136.3 | 136.3 | drifts |
| External wall (lm) | **56.06** | 54.8 | 54.8 | drifts |
| Internal wall (lm) | **3.01** | 15.56 | 15.56 | **5× swing** |
| Roof area (m²) | 157.19 | 156.75 | 156.75 | = floor×1.15 |
| Window count | **13** | 7 | 7 | **86% swing** |
| Internal doors | 5 | 8 | 8 | swing |
| Garage door | **"610x3000"** | "2000" | "2000" | both wrong |

**This is the single most important finding: the concept pipeline is not
reproducible.** Two runs (ADSTGH, etdyj) agree exactly; a third (SRTH) diverges
on almost every quantity. A QS exporting JM-0003 gets a different bill of
quantities depending on which run they happen to open.

Intermediate evidence from `JM-0003-SRTH` `IQ Data Input` sheet (cells dumped):
- `D12=136.69`, `D15=56.06`, `D19=56.06` (perimeter duplicated as ext-wall),
  `D20=2.41`.
- `I3='SRTH'` (client value) but label `A5='Client Name'`; `I4='SRETH'` (address)
  label `A6`; `I5='Palmerston North'` (defaulted city) label `A7`.
- Window rows present: Bed1 `D41=1 E41=2.11 F41=1.98`, Bed2 `D45=2 E45=1.3
  F45=1.5`, Bathroom `D52=1 F52=0.61` (**E52 height blank — height was 0**),
  Kitchen `D54=1 E54=1.8 F54=0.8`, Dining `D59=2 E59=1.3 F59=1.5`, Lounge
  `D62=3 E62=1.3 F62=1.5`, Entrance `D72=1 E72=2.1 F72=1.17`.
- `④ DOORS & GARAGE` (`H176`–`H181`) — **all blank**. The detected garage door
  ("610x3000") produced **no** QS garage-door entry.
- `Interior Doors` (`H187/H192/H193`) — **all blank**, despite the Takeoffs sheet
  reporting 5 internal doors.

Observations worth flagging:
- Bed2, Dining, Lounge all carry the **identical** `1.3 × 1.5` window dimension —
  a single annotation appears to have been broadcast to multiple rooms.
- The `Takeoffs` sheet shows a "Laundry 1.9×0.2" and a "Garage 0.61×3" entry in
  windows-by-room — clearly room-dimension misreads classified as windows; the
  `0.61×3` is the same junk as the `610x3000` garage door, double-counted.

---

## 5. Seeded / Discovered Defect Investigations

> The original audit brief referenced numbered seeded defects (5.1–5.8). The brief
> text did not enumerate them in the working context, so this section documents
> the defects actually discovered by tracing, each with file:line and a real value.

### 5.1 — `val()` cannot distinguish zero from missing  ·  High
`iq-qs-export.ts:755`
```ts
if (v === null || v === undefined || v === "" || v === 0) return;
```
A genuine `0` (e.g. 0 downpipes, a measured 0, a 0-height window) is dropped
exactly like missing data. Live: Bathroom window height was 0 → `E52` blank while
`F52=0.61` is written, yielding a width-only window.

### 5.2 — Roof area is always `floor × 1.15`  ·  Medium
`classify-annotations.ts:90-91`
```ts
const roof_area_m2 = floor_area !== null ? round2(floor_area * 1.15) : null;
```
Roof pitch, hips, and overhangs are ignored. Live: 157.19 = 136.69×1.15 and
156.75 = 136.3×1.15 — exact, confirming the constant.

### 5.3 — Internal-wall length collapses to a near-zero value  ·  Critical
`ocr.py:354-359` (dedup compares only against the **last** kept value on a sorted
list, chain-collapsing near-equal dimensions).
Live: JM-0003 internal wall = **3.01 lm** (SRTH) and **15.56 lm** (ADSTGH) for the
same ~136 m² house; a realistic value is ~40–60 lm. Both are wrong; the SRTH value
is essentially a single wall.

### 5.4 — Garage-door classifier emits raw junk on no-match  ·  Critical
`classify-annotations.ts:55-64` + `classify.ts:243`
```ts
const cell = classifyGarageDoor(dim.widthMm);
garage_door_size = cell ?? gd;   // falls back to the raw annotation text
```
`classifyGarageDoor` only maps bands (≥4500→H176, 2600–2800→H180, 2300–2500→H178)
and returns `null` otherwise. Live: width 610 (or 2000) → `null` → `garage_door_size
= "610x3000"` / `"2000"`. Neither is a valid garage door, and because there is no
matching `module_items` "garage door" label, the QS sheet's `H176–H181` stay blank
(§4). The garage door is effectively lost.

### 5.5 — Internal doors silently dropped from QS export (key mismatch)  ·  Critical
Producers emit `opening_type = "internal_door"`:
- `extract-openings.ts:123` (`kind: "internal_door"`)
- `OpeningScheduleTab.tsx:16` (UI option `value: "internal_door"`)

Consumer filters for `"interior_door"`:
- `iq-qs-export.ts:195` `o.opening_type === "interior_door"`

The two strings never match, so `interiorDoors` is **always empty** from the
opening schedule. Live: Takeoffs reports 5 internal doors, QS `H187/H192/H193`
blank. (Only a confirmed `door_counts` row via `DoorCountPanel` can repopulate
these — see `iq-qs-export.ts:517-524`.)

### 5.6 — QS export ignores approved/confirmed values  ·  High
`iq-qs-export.ts:166-174`
```ts
const exact = items.find(i => i.label?.toLowerCase() === needle);
if (exact) return exact.extracted_value ?? null;   // never approved_value
```
After a QS confirms or overrides a value (`approved_value`), the export still
reads the raw `extracted_value`. The whole review/approval workflow is bypassed by
the exporter. The `writeIQDataSheetFull` data sheet has the same issue
(`iq-qs-export.ts:1000` uses `extracted_value`).

### 5.7 — Job-info label/value row misalignment  ·  Medium
`iq-qs-export.ts:771-783`. Labels at `A5`(Client) `A6`(Address) `A7`(City)
`A8`(JMW); values at `I3`(client) `I4`(address) `I5`(city) `I8`(JMW). The values
are two rows above their labels. The code comment asserts "yellow cell addresses
match QS exactly", so the `I*` targets are presumably correct for the QS template —
but this **must be verified against the QS master** (see §7), because the visual
mismatch is exactly the kind of thing that silently pastes a client name into the
wrong QS row.

### 5.8 — v5.3 main/service room confidence is dead code on the geometry path  ·  Medium
`ocr.py:295,306` never set `RoomDimension.label`, so `result.py:180-184` counts
every room as "main". The keyword lists added in v5.3 (`MAIN_ROOM_KEYWORDS`,
`SERVICE_ROOM_KEYWORDS`) are never exercised in production; confidence is driven
purely by raw room-dimension **count**. The TypeScript mirror
(`internal-wall-confidence.ts`) and its 18 tests work correctly in isolation, but
the real API never feeds them labelled rooms.

---

## 6. Window / Door Schedule Completeness

`buildQSExportData` computes more windows-by-room entries than the QS sheet writer
can place:

| Computed key | Source line | Written to a QS row? |
|---|---|---|
| `bed1`,`ensuite`,`bed2`,`bed3`,`bed4` | 333-342 | ✅ rows 41/43/45/47/49 |
| `bathroom`,`kitchen`,`familyLiving`,`dining`,`lounge` | 345-378 | ✅ rows 52/54/56/59/62 |
| `garageWindow`,`garageDoor1`,`entrance` | 379-386 | ✅ rows 65/67/72 |
| **`toilet`** | 343-344 | ❌ no row in `windowRooms` |
| **`kitchenExtra`** | 363-371 | ❌ no row |
| **`garageDoor2`** | 387-388 | ❌ no row |
| **laundry window** | — | ❌ no key, no row (live data shows a real laundry window) |

`windowRooms` array: `iq-qs-export.ts:813-831`. Any plan with a toilet window, a
second kitchen window, a second garage door, or a laundry window **silently loses
that opening** in the QS paste sheet.

Additional completeness gaps:
- `garageWindow` matches on the bare keyword `"garage"` (`iq-qs-export.ts:379`),
  so any window whose room name contains "garage" is force-mapped to the single
  garage-window row.
- Skylights are collected (`iq-qs-export.ts:197-199`) but never written to the QS
  sheet.

---

## 7. Cell-Mapping Verification

I verified the **emitted** cell addresses against the live `IQ Data Input` sheet
(JM-0003-SRTH) and the writer code. They are internally consistent
(`windowRooms` rows match the live cells: Bed1→41, Bed2→45, Bathroom→52,
Kitchen→54, Dining→59, Lounge→62, Entrance→72).

**What I could NOT verify:** the absolute correctness of these addresses against
the QS master workbook (`Jennian_QS_IQ_Updated.xlsm` / "5. Data Input House "
sheet). That file was not available in this environment. Two specific addresses
should be checked by hand before trusting the export:
1. Job-info targets `I3/I4/I5/I8` vs their `A5–A8` labels (§5.7) — confirm the QS
   really expects client/address/city/JMW at column I, rows 3/4/5/8.
2. `F4` for first-floor area (`iq-qs-export.ts:797`) sits oddly far from the other
   core-measurement cells (`D12`–`D20`) — confirm against QS.

---

## 8. Pipeline Parity — Quick Takeoff vs Detailed Review

The two pipelines are **not at parity** and cannot be, by construction:

- Quick Takeoff (`run.ts`) → Supabase → `buildQSExportData` reads Supabase.
- Detailed Review (`upload.tsx`) → in-memory `TakeoffData` → writes `.xlsx`
  directly; **never** writes its AI/geometry results to `module_items` /
  `opening_schedule`.

Consequences:
- A job processed via Detailed Review has rich AI output in its downloaded
  workbook, but the **Quick Export route for the same job** (`/jobs/$jobId/export`)
  will show little or nothing, because Supabase was never populated by the concept
  run.
- Defects differ per pipeline: the `"interior_door"` mismatch (§5.5) and
  approved-value bypass (§5.6) bite the **Supabase/Quick** path; the garage-door
  junk (§5.4), roof×1.15 (§5.2), and internal-wall collapse (§5.3) bite the
  **concept** path. The JM-0003 workbooks (concept path) exhibit the latter set.

There is no reconciliation step that proves the two pipelines agree for a given
job.

---

## 9. Validation & Confidence Gaps

- **No determinism guard.** The biggest gap: nothing detects or prevents the
  run-to-run swings shown in §4. There is no "re-run and compare" or seed pinning.
- **Reconcile tolerance is loose.** `TOLERANCE = 0.10` (`result.py:10`) reports up
  to 9% geometry error as "high" confidence.
- **Internal-wall confidence measures the wrong thing** (§5.8): with labels never
  populated, "high/medium/low" reflects raw room-dim count, not main-room coverage.
- **Silent AI fallbacks** (§3B) mean a failed Pass 0/Pass 1 yields plausible-looking
  empty/default output with no surfaced warning.
- **Validation suite covers only 4 plans** (`test_validation.py`) and asserts
  ranges, not reproducibility. It would pass even while §4's non-determinism is
  live, because each assertion is a one-shot tolerance check.

---

## 10. Findings Register & Ranked Fix List

### Findings register (F-001 schema: id · severity · layer · evidence · root cause · impact)

| ID | Sev | Layer | Evidence (file:line / value) | Root cause | Impact |
|---|---|---|---|---|---|
| F-001 | Critical | AI/concept | §4: JM-0003 windows 13 vs 7, int-wall 3.01 vs 15.56 across runs | Stochastic AI passes, no seed/retry/compare (`concept.functions.ts:306-340`) | Same plan → different QS quantities; unauditable |
| F-002 | Critical | Geometry | `ocr.py:354-359`; int-wall 3.01 lm live | Dedup compares only to last kept value on sorted list | Internal wall grossly under-counted |
| F-003 | Critical | Concept→Export | `classify.ts:243`,`classify-annotations.ts:55-64`; "610x3000" live | `classifyGarageDoor` returns null → raw text passthrough | Garage door wrong & absent from QS `H176-181` |
| F-004 | Critical | Export | `iq-qs-export.ts:195` vs `extract-openings.ts:123` | `"interior_door"` ≠ `"internal_door"` | All internal doors dropped from QS export |
| F-005 | High | Export | `iq-qs-export.ts:166-174,1000` | reads `extracted_value`, never `approved_value` | QS approvals/overrides ignored by exporter |
| F-006 | High | Export | `iq-qs-export.ts:755`; `E52` blank live | `v === 0` treated as missing | Legit zeros lost; width-only windows |
| F-007 | High | Export completeness | `iq-qs-export.ts:813-831` vs 343/363/387 | `toilet`,`kitchenExtra`,`garageDoor2`,laundry have no row | Those openings silently dropped |
| F-008 | High | Geometry/v5.3 | `ocr.py:295,306`; `result.py:180-184` | `RoomDimension.label` never set | Main/service confidence feature inert |
| F-009 | High | Architecture | `run.ts` vs `upload.tsx`/`concept.functions.ts` | Concept results never persisted to Supabase | Quick Export ≠ Detailed Review for same job |
| F-010 | Medium | Concept | `classify-annotations.ts:90-91`; 157.19=136.69×1.15 | Hardcoded 1.15 roof factor | Roof area ignores pitch/overhang |
| F-011 | Medium | Export | `iq-qs-export.ts:771-783`; `I3` value vs `A5` label live | Value rows offset from label rows | Risk of pasting into wrong QS row (verify §7) |
| F-012 | Medium | Concept | §4: Bed2/Dining/Lounge all `1.3×1.5` | One annotation broadcast to many rooms | Duplicated/incorrect window dims |
| F-013 | Medium | Concept | `classify-annotations.ts:33` | room-box guard needs BOTH dims>2000 | `610×3000` leaks into window/garage logic |
| F-014 | Medium | AI | `recognise-plan.ts:66-91`; `extract-annotations.ts` | silent catch → fallback, no raw response saved | Degraded runs indistinguishable from good |
| F-015 | Low | Reconcile | `result.py:10` TOLERANCE=0.10 | wide band | 9% error reported as "high" confidence |
| F-016 | Low | Export | `iq-qs-export.ts:197-199` | skylights collected, never written | Skylights absent from QS sheet |
| F-017 | Low | Export | `iq-qs-export.ts:379` | `garageWindow` matches bare "garage" | Over-greedy room mapping |
| F-018 | Low | Validation | `test_validation.py` | one-shot range asserts | Suite green while F-001 live |

### Ranked fix list (recommended order — NOT yet implemented)

1. **F-004** — change the export filter to `"internal_door"` (or normalise both to
   one canonical string). One-line, immediate recovery of all internal doors.
2. **F-003 / F-013** — make `classifyGarageDoor` reject implausible dims and never
   passthrough raw junk; tighten the room-box guard so single-small-dim misreads
   (e.g. `610×3000`) are excluded from window/garage logic.
3. **F-002** — replace the chain-collapsing dedup in `compute_internal_wall_length_m`
   with a proper unique-wall grouping (cluster against all kept values, not just
   the last).
4. **F-005** — export should prefer `approved_value ?? extracted_value`.
5. **F-001** — add determinism control to the AI passes (pin temperature/seed where
   the model allows, persist the raw response, and add a re-run/compare guard).
6. **F-006** — distinguish "0" from "missing" in `val()` (only skip null/undefined/"").
7. **F-007 / F-016** — add QS rows for `toilet`, `kitchenExtra`, `garageDoor2`,
   laundry, and skylights, or document why they are intentionally excluded.
8. **F-009** — persist concept-pipeline results to Supabase so the two pipelines
   converge and Quick Export reflects Detailed Review.
9. **F-008** — populate `RoomDimension.label` in OCR so the v5.3 confidence feature
   actually runs; otherwise remove the dead keyword lists.
10. **F-010, F-011, F-012, F-014, F-015, F-017, F-018** — schedule as follow-ups;
    F-011 requires checking the QS master first (§7).

---

## Appendix A — Evidence Commands

- JM-0003 workbooks opened with `openpyxl` (`data_only=True`); `Takeoffs` and
  `IQ Data Input` sheets dumped cell-by-cell. Values quoted in §4/§5 are verbatim
  from those dumps.
- Source citations are `path:line` against the working tree on 2026-05-30.

## Appendix B — Audit Limitations (honesty notes)

- I did **not** execute a fresh JM-0003 run through the live app + Geometry API
  (no invocation path from this environment); §4 uses three pre-existing real
  exports of JM-0003 instead. The non-determinism finding (F-001) is therefore
  evidenced by divergent **outputs of the same plan**, which is sufficient to prove
  the defect.
- The QS master workbook was unavailable, so absolute cell-address correctness
  (§7, F-011) is **unverified** and flagged rather than asserted.
- No code was modified. All fixes live in §10 as recommendations only.

---

## 11. Addendum — Findings discovered during Phase 1 (post-audit)

These were found while implementing Phase 1 (reproducibility) on 2026-05-30. They
are logged here for register continuity; the §0 tally above reflects the original
audit only.

| ID | Sev | Layer | Evidence (file:line / value) | Root cause | Impact |
|---|---|---|---|---|---|
| F-019 | Medium | AI/concept | `anthropic-client.ts` and `concept.functions.ts` — two near-identical `callVisionModel` implementations | Vision-model call was copy-pasted instead of shared; `concept.functions.ts` also duplicates `getApiKey`, `extractJson`, `tryRepairTruncatedJson` | Divergence risk: a fix/param must be applied twice or the two paths drift. **As of Phase 1 the duplication has grown** — `temperature: 0` AND the bounded-retry block (`TransientApiError`, `MAX_ATTEMPTS`, backoff) now live in BOTH copies, deliberately kept in sync. More reason to merge at cleanup. Deferred — **do not merge/refactor in Phase 1**. |
| F-020 | Medium | Geometry/auth | `jennian-iq-geometry-api/main.py:25-37` (`require_api_key`) | When `GEOMETRY_API_KEY` is unset the dependency **fails open** (warns, allows the request) instead of failing closed | A misconfigured deploy with no key serves the geometry API unauthenticated. Convenient for local dev, but a production deploy that loses the env var silently drops auth. |
| F-021 | High | Architecture/concept | `run.ts:585-609` — Pipeline A wraps `recognisePlanFn` (Pass 0) in a warn-and-continue `catch` | After Task 2 made Pass 0 fail-loud, a failed recon in the **automatic/job pipeline (A)** is swallowed to a `console.warn`; the run still completes with `plan_context` unset → downstream silently uses NZ-default dimension format / stud height / builder | Residual silent-failure on the job path: a degraded (default-metadata) concept job looks identical to a good one, with no user signal. Core BoQ quantities are NOT affected (A derives them from regex + assumptions + geometry, not the AI pass). **Tagged for Phase 5.** Recommended fix: flip the run to `completed_with_warnings` + `error_message` instead of swallowing. Do NOT change `run.ts` before Phase 5. |

| F-022 | High | AI/concept | Phase 1 live harness, 6 runs of `mcalevey.pdf`: `window_count`/`internal_door_count` came back **7** and **8** across runs at `temperature: 0` | The Anthropic vision model is **not deterministic even at `temperature: 0`** — opening-count reads jitter ±1 (multimodal inference non-determinism: batching/hardware/routing, not controlled by temperature) | `temperature: 0` is **necessary but not sufficient** for F-001. It killed the gross drift (audit §4: 13-vs-7 windows, 3.01-vs-15.56 lm internal wall) but a residual ±1 opening-count jitter remains. **True reproducibility now comes from the cached-replay/golden fixture** (Task 3), not from re-calling the model. Geometry, areas, scale, stud height and garage-door size were fully stable across all runs. |

Phase 1 actions taken against these: F-019 — `temperature: 0` **and** bounded retry
applied to **both** copies (no merge); F-020 — logged only (relied upon for keyless
local dev; revisit when hardening deploy config); F-021 — logged only, deferred to
Phase 5 (`run.ts` intentionally untouched); F-022 — mitigated by the cached-replay
harness (deterministic offline reproduction). **Decision: (a) replay/golden as
source-of-truth** (majority-vote declined); human review surfaces editable
window/door counts as the backstop (`upload.tsx` `TAKEOFF_ROWS`). The accuracy fix
(cross-check AI counts vs the deterministic geometry/CV layer) is **Phase 5
reconciliation work, tied to F-009**. See FIX_LOG.md "Phase 1 outcome".
