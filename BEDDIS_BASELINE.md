# Beddis Baseline Accuracy Run — job 26001, 20 Tukere Crescent

> **Phase 2a update (2026-05-30):** the takeoff page-selection bug in §1/§4.1 is **fixed**.
> The prelim AI takeoff now reads the floor-plan page (page 3) and returns non-null core
> values (floor 165.4 / perimeter 63.8 / ceiling 2.4) instead of an empty page. See
> **§5 — Phase 2a re-baseline** at the bottom for the new numbers. Sections 1–4 below are
> the *original* baseline, left intact as the before-state.

**Type:** measurement only. No data-logic fixes. This is the baseline Phase 2 is prioritised from.
**Date:** 2026-05-30
**Source of truth:** `tests/fixtures/beddis/ground-truth.json` (from Beddis_QS.xlsm, sheet "5. Data Input House").
**Harness:** `tests/beddis/baseline.test.ts` (gated `BEDDIS_LIVE=1`). Raw output:
`tests/fixtures/beddis/_render/baseline-results.json`.
**Inputs:** `prelim.pdf` (7-page set), `concept-floorplan.pdf` (1 page). Geometry: local service :8000.

---

## 1. How Pass 0 handled the multi-page prelim set

Each prelim page rendered (1400px) and run through Pass 0 (`recognisePlan`):

| Page | Pass 0 sheetType | scale | living m² | perim m | content |
|---|---|---|---|---|---|
| 1 | site_plan | 1:125* | 165.4 | – | site plan |
| 2 | site_plan | 1:200 @A3 | – | – | landscaping |
| **3** | **floor_plan** | 1:100 @A3 | **165.4** | **63.8** | **floor plan + areas + window schedule** |
| **4** | **dimension_plan** | 1:100 @A3 | – | – | dimensions only (stud 2420 read) |
| 5 | elevation | 1:100 @A3 | – | – | elevations |
| 6 | elevation | 1:50 | – | – | sections/insulation |
| 7 | unknown | NTS | – | – | window schedule W01–W13 |

**Pass 0 correctly classified the pages.** But two page-selection problems surface:

- **The takeoff page-guard picks the wrong page.** `extractConceptTakeoffs` accepts `floor_plan | dimension_plan`, and the ranking prefers `dimension_plan`. So it chose **page 4** (dimensions only) over **page 3** (the real floor plan with the area summary, perimeter, and window annotations). Result: the prelim takeoff came back almost entirely **null** (floor null, perimeter null, window_count null) even though page 3 had all of it. **Picking the "dimension_plan" page above the "floor_plan" page zeroed out the prelim takeoff.**
- **Geometry picks its own page and got it right.** The geometry service chose `page_used=2` (the floor plan) and returned floor 165.4 / perimeter 63.8. So geometry recovered the right answer independently of the AI page-guard.
- **Windows are split across pages** (W01–W09 on page 3/7, schedule on page 7). A single-page AI pass can never see all 13 — a structural limit of feeding one page to the vision model.

\*Page 1 scale misread (1:125) is harmless — site page isn't used.

---

## 2. Scorecard — IQ vs Truth (priority fields)

Primary IQ column = the **concept** single-page floor plan run (clean apples-to-apples).
Geometry values shown where they differ from the AI takeoff. Prelim noted where relevant.

| # | Field | Truth | IQ (concept) | Source | Δ | Verdict |
|---|---|---|---|---|---|---|
| 1 | Floor area | 165.4 m² | **165.4** | AI + geometry | 0 | ✅ PASS |
| 2 | Perimeter | 63.8 m | **63.8** | AI + geometry | 0 | ✅ PASS |
| 3 | Stud height | 2.4 m | **2.4** | builder-default* | 0 | ✅ PASS |
| 4 | Alfresco area | 1.7 m² | null | – | – | ❌ FAIL (not read; plan prints "PORCH 1.7") |
| 5 | Total area | 167.1 m² | not produced | – | – | ❌ FAIL (no field) |
| 6 | External wall **area** | 109.2 m² | not produced | – | – | ❌ FAIL (only perimeter/length emitted; length×stud = 153, not 109) |
| 7 | Window count | 13 | **9** | AI | −4 | ❌ FAIL |
| 8 | Garage door | 4.8×2.1 insulated | **"2681"** | AI | wrong | ❌ FAIL (prelim got width "4,800"=4.8m but unclassified) |
| 9 | Entrance door | 2.1×1.4 | not produced | – | – | ❌ FAIL (no entrance-door dim field) |
| 10 | Interior doors | 7 std / 4 dbl / 2 cavity (13) | total **9**, no breakdown | AI | −4 + no split | ❌ FAIL |

\*Stud 2.4 is the Jennian builder default, not read from the concept plan — it matches Truth by coincidence of default. The prelim page 4 actually read 2420mm.

**Result: 3 / 10 priority fields correct (floor area, perimeter, stud height).**

### Notes per failure
- **Alfresco (#4):** concept plan prints "PORCH AREA: 1.7m²" but Pass 1 `areaSummary.alfrescoAreaM2` returned null — the summary-box read missed it.
- **Total area (#5) & ext wall area (#6):** no such output fields exist in the pipeline. `external_wall_lm` is the **perimeter** (63.8 lm), not a wall area. There is no `external_wall_area_m2` anywhere.
- **Window count (#7):** Pass 1 returned 10 raw opening annotations; `classifyAnnotations` kept 9 (room-box / non-`NxM` filter dropped one). Truth is 13 — single-page input can't see the full schedule.
- **Garage door (#8):** raw annotation was `"2681"` (concept) / `"4,800"` (prelim). Neither has an `x`, so `parseDimension` fails and the raw string passes through unclassified; the export's `H176/H178/H180` banding never fires. Prelim's 4800mm width is right but not turned into "4.8×2.1 / H176".
- **Interior doors (#10):** `classifyAnnotations` hard-codes `door_breakdown: null` (classify-annotations.ts:110) and `external_door_count: null` (:101). The pipeline **cannot** produce the 7/4/2 split — only a single `internal_door_count` (= raw annotation count: 9 concept / 8 prelim).

### Robustness check (concept vs prelim should agree)
Both plans print floor 165.4 / perimeter 63.8. **Geometry returned 165.4 / 63.8 from both** ✅. The AI takeoff returned them from the **concept** but **null from the prelim** (wrong page picked) ✗ — so IQ is *not* yet input-robust on the takeoff path, only on the geometry path.

---

## 3. `internal_wall_length_m` trace — diagnostic, not a deliverable

**Question:** does any QS-export field consume `internal_wall_length_m`, or is it dead?

**Call path (concept pipeline):**
1. `geometry.measurements.internal_wall_length_m` (geometry-api.ts:22) — concept = `null` (room_count 0); prelim = `4.21` (confidence medium).
2. `upload.tsx:461–463` copies it into `takeoffData.internal_wall_lm` (null when rooms not found).
3. Consumers of `internal_wall_lm`:
   - **Review UI** — `TAKEOFF_ROWS` (upload.tsx:1471), display + inline edit only.
   - **Generic takeoff .xlsx** — `exportToExcel` row `["Internal wall length", …]` (upload.tsx:543).
   - **QS master "5. Data Input House"** — `QS_CELLS` (upload.tsx:574–588) maps **only** window rooms + Garage Window/Door/Entrance to master cells. **There is no internal-wall cell.** → not written to the QS master.

**Quick pipeline:** `iq-modules.ts:118` defines an `internal_wall_length` module (lm, range 45–120) → `module_items`. In `iq-qs-export.ts`, "internal wall length" appears **only in a defensive comment** (line 169, to stop "wall length" colliding with "external wall length"). No `getVal`/`getNum` reads it into a QS cell.

**Verdict: `internal_wall_length_m` is a diagnostic/informational metric, NOT a QS deliverable.** Nothing in the QS master ("5. Data Input House") consumes it. This confirms the answer-key note. (It can stay as a confidence/diagnostic signal, but it should not be graded as a takeoff output and needs no Phase-2/3 accuracy work.)

---

## 4. Baseline takeaways for Phase 2 prioritisation

1. **Page selection on multi-page sets is broken for the takeoff path** — `dimension_plan` outranks `floor_plan`, picking a dimensions-only page and nulling the takeoff. Geometry's own page picker is fine. (Highest-impact, cheap fix.)
2. **Missing output fields:** external wall **area** (109.2), total area (167.1), entrance-door size, and the interior-door **breakdown** (7/4/2) + external-door count — none exist in the pipeline today.
3. **Garage door never classifies** when the annotation lacks an `x` (`"4,800"`, `"2681"`) — width-band classification is bypassed.
4. **Window count undercounts** (9 vs 13) and alfresco/porch area is missed by the summary-box read.
5. **Geometry is the reliable layer** for floor area, perimeter, stud — AI takeoff agrees on the concept but is fragile on the prelim.

---

## 5. Phase 2a re-baseline — takeoff page selection fixed

**Mode:** fix/build, tightly scoped to page selection. One fix, then re-baseline. No other findings touched.
**Date:** 2026-05-30. **Branch:** `phase2a`.

### 5.1 What was actually wrong (the §1/§4.1 premise was a harness artifact)

The original baseline harness chose the prelim page from **Pass-0 `sheetType` + a local `pref()`**
helper that ranked `dimension_plan` above `floor_plan` → it picked **page 4** (dimensions-only) and
nulled the takeoff. That `pref()` ranking does **not exist in production**. Production selects the
page in `upload.tsx` via `analyzePdfPages` → `classifyText` (over the PDF text layer) →
`pickPrimaryFloorplan`. Running *that* path over the real Beddis prelim text revealed the true bug:

- `classifyText` evaluated disqualifier words (`elevation` / `legend` / `section`) **before** the
  floor-plan family, so the real floor-plan sheet was hijacked into `legends`/`elevations` and scored
  negative → `pickPrimaryFloorplan` returned **null** → the takeoff fell back to the wrong page.
- `FLOORPLAN_SCORE` also ranked `dimension_floor_plan` above `floor_plan`.

### 5.2 The fix

Extracted the pure classification/ranking logic into **`src/lib/pdf-page-classify.ts`** (no pdfjs, unit-testable;
`pdf-pages.ts` re-exports it so importers are unchanged) and:

1. **Re-ordered `classifyText`** so the floor-plan family is tested **first** — an explicit floor plan
   that merely *references* an elevation/legend/section is no longer mis-binned.
2. **Re-ranked `FLOORPLAN_SCORE`** so `floor_plan` (100) outranks `dimension_floor_plan` (90); the
   remaining disqualifier order is unchanged.

Tests: `tests/phase2a/page-selection.test.ts` (12 pure unit assertions) and
`tests/phase2a/beddis-page-selection.test.ts` (offline, real Beddis page text → selects page 3).
The live harness `tests/beddis/baseline.test.ts` now drives selection through the **real**
`pickPrimaryFloorplan` (replacing `pref()`) so the re-baseline is honest, and asserts the prelim
chooses page 3 with non-null floor + external-wall.

### 5.3 Production page selection on the Beddis prelim (now)

| Page | classifyText type | score | selected |
|---|---|---|---|
| 1 | legends | −55 | |
| 2 | legends | −55 | |
| **3** | **dimension_floor_plan** | **95** | ✅ **picked (high)** |
| 4 | legends | −55 | |
| 5 | legends | −55 | |
| 6 | sections | −35 | |
| 7 | legends | −55 | |

Page 3 is the real floor plan (area summary 165.4 m² / 63.8 m + window annotations). The dimensions-only
overlay (page 4) no longer wins. (Pages 1/2/4/5/7 falling to `legends` is harmless here — page 3 wins
decisively — but confirms `classifyText` is still substring-fragile; not in Phase 2a scope.)

### 5.4 Prelim takeoff — before vs after

| Field | Truth | Prelim **before** (page 4) | Prelim **after** (page 3) | Verdict |
|---|---|---|---|---|
| Floor area | 165.4 m² | **null** | **165.4** | ✅ recovered |
| External wall lm (=perimeter) | 63.8 m | **null** | **63.8** | ✅ recovered |
| Ceiling height | 2.4 m | 2.42 | **2.4** | ✅ |
| Roof area (derived) | – | null | 190.21 | (floor×1.15) |
| Internal door count | 13 | 8 | 11 | closer, still no split |
| Window count | 13 | null | **null** (14 raw, all dropped) | ❌ Phase 2b |
| Garage door | 4.8×2.1 | "4,800" | "2,210 x 4,800" | ❌ Phase 2b (now has width, still unclassified) |

**Robustness check now passes for the core.** Both the concept and the prelim AI takeoff return
floor 165.4 / perimeter 63.8 — IQ is now input-robust on the takeoff path for those fields, not just
on the geometry path (the §2 gap). Geometry unchanged: still picks its own page (`page_used=2`) and
returns 165.4 / 63.8 from both inputs.

### 5.5 New observations (NOT fixed — for Phase 2b prioritisation)

- **Prelim `window_count` is `null` despite 14 raw opening annotations on page 3.** The floor-plan page
  carries W01–W09 as `NxM`-less callouts that `classifyAnnotations` drops; the full W01–W13 schedule is
  on page 7. This is the cross-page aggregation limit already flagged for **Phase 2b** — now visible on
  the *correct* page rather than masked by the wrong-page null.
- **Garage door** raw is now `"2,210 x 4,800"` (height × width present) but still passes through
  unclassified — the H176/H178/H180 banding never fires. Phase 2b/garage scope (unchanged).

### 5.6 Follow-on logged (deferred per brief)

- **Geometry-page alignment.** Geometry picks its own page internally (`page_used`) and the AI takeoff
  now picks via `pickPrimaryFloorplan`. Both landed on the floor plan for Beddis, but they are still
  *independent* selectors. Aligning them onto one shared page-of-truth (pass the selected page index
  into `/measure`, or have the app reconcile `page_used` against the AI pick) is a larger change than
  the Phase 2a guard re-rank and is **logged as a Phase 2 follow-on**, not done here.

---

## 6. Phase 2b re-baseline — Door & Window Schedule recognition + aggregation

**Mode:** fix/build, scoped to **windows only**. Floor/perimeter/page-selection untouched.
**Date:** 2026-05-30. **Branch:** `phase2b`.

### 6.1 The gap (post-2a)

2a fixed page selection (prelim reads the floor plan, page 3), but `window_count` was still
`null`/short. The floor-plan callouts on page 3 are partial — W01–W09 arrive as `NxM`-less
callouts that `classifyAnnotations` drops — and the **full W01–W13 list lives on prelim page 7,
the A501 "Door & Window Schedule"**, which Pass 0 labelled `unknown` and §5.3 binned as `legends`.
That schedule is the cleanest window source: all 13 windows with exact H × W in mm.

### 6.2 The fix (four pieces)

1. **Recognise the schedule page.** `classifyText` (in `pdf-page-classify.ts`) now classifies the
   A501 sheet as its own **`window_schedule`** type, evaluated **before** the legends check — the
   schedule carries its own `Legend:` block that previously hijacked it. `FLOORPLAN_SCORE.window_schedule
   = -45` keeps it strongly negative so it can **never** win the primary-floorplan pick; the floor plan
   stays primary for core measurements. New pure helper `pickWindowSchedule` locates the schedule page
   independently of `pickPrimaryFloorplan`.
2. **Extract the schedule** (`src/lib/takeoff/extract-window-schedule.ts`). `readWindowSchedule` is a
   vision call (`claude-opus-4-5`, temp 0) over the rendered schedule image — the page-7 text layer is
   jumbled (table structure lost) so text parsing is unreliable. Pure `normaliseWindowSchedule` keeps
   only `W\d+` IDs, dedupes, normalises numbers, drops door entries (D01/GD). The thin
   `extractWindowScheduleFn` createServerFn wrapper lives in `concept.functions.ts`; the AI fn itself is
   plain async so the node harness can call it directly.
3. **Aggregate — schedule wins** (`src/lib/takeoff/aggregate-windows.ts`). `aggregateWindows` makes the
   schedule the canonical window *set* (count + dims) when present; floor-plan callouts are the fallback
   only when no schedule exists, so windows are neither double-counted nor dropped. `applyWindowAggregate`
   sets the canonical `window_count` and attaches the `windows_schedule` list (mm → m).
4. **Thread the page.** Wired into `upload.tsx → proceedToTakeoffs` (reusing the existing
   additional-page pattern — elevations/site-plan — so **no architectural change**) and into the live
   harness `tests/beddis/baseline.test.ts`.

Tests: `tests/phase2b/window-schedule.test.ts` (24 pure unit assertions — classifyText recognition,
schedule-never-beats-floorplan, `pickWindowSchedule`, `normaliseWindowSchedule`, aggregate/apply).
Phase 1 replay + Phase 2a selection stay green (38 offline tests pass).

### 6.3 Production page classification on the Beddis prelim (now)

| Page | classifyText type | score | role |
|---|---|---|---|
| 1 | legends | −55 | |
| 2 | legends | −55 | |
| **3** | **dimension_floor_plan** | **95** | ✅ primary floor plan |
| 4 | legends | −55 | |
| 5 | legends | −55 | |
| 6 | sections | −35 | |
| **7** | **window_schedule** | **−40** | ✅ schedule (additional source) |

Page 7 is no longer `legends` — it is recognised as the schedule and read alongside page 3. Page 3
still wins the primary pick decisively (95 vs everything ≤ −35), so 2a selection is undisturbed.

### 6.4 Scorecard — prelim (primary) vs truth

| Metric | Prelim (primary) | Truth | Verdict |
|---|---|---|---|
| Primary page | page 3 (`high`) | floor plan | ✅ |
| Floor area | 165.4 m² | 165.4 m² | ✅ (unchanged) |
| External wall lm | 63.8 m | – | ✅ (unchanged) |
| Schedule page found | page 7 | A501 | ✅ |
| Window source | `schedule` | schedule | ✅ |
| **Window count** | **13** | **13** | ✅ **PASS** |

**Prelim windows (from A501 schedule, H × W in m):**

| ID | H × W | ID | H × W | ID | H × W |
|---|---|---|---|---|---|
| W01 | 2.21 × 1.03 | W06 | 2.21 × 0.80 | W11 | 2.21 × 0.80 |
| W02 | 2.21 × 2.00 | W07 | 2.21 × 3.00 | W12 | 2.21 × 1.30 |
| W03 | 2.21 × 1.50 | W08 | 2.21 × 1.60 | W13 | 2.21 × 2.00 |
| W04 | 2.21 × 1.80 | W09 | 2.21 × 1.80 | | |
| W05 | 2.21 × 0.80 | W10 | 2.21 × 1.00 | | |

All 13 IDs W01–W13 present, each with H × W. (QS-style rounding allowed, e.g. 2.21 → 2.1.)

### 6.5 Concept (secondary) — reported, not graded to 13

The concept is the earlier 3-PDF set with **no A501 schedule**, so its window count comes only from
floor-plan callouts: **`window_count = 9`, source `floor_plan_callouts`**. This legitimately differs
from 13 and is expected per the brief — reported here for completeness, not graded.

### 6.6 Follow-on (out of 2b scope)

- **Per-room window assignment** — linking each W-entry back to its floor-plan room is explicitly out of
  2b scope and logged as a follow-on.
- **Garage-door classification** (`"2,210 x 4,800"` still passes through unclassified; H176/H178/H180
  banding never fires) is **Phase 2c**, set from this result.

---

## 7. Phase 2c re-baseline — garage-door classification (F-003)

**Mode:** fix/build, small and contained. Last of the original Critical findings.
**Date:** 2026-05-30. **Branch:** `phase2c`.

### 7.1 The gap

The garage-door annotation is *read* (Beddis prelim: `"2,210 x 4,800"` — width present) but never
classified. Two root causes in the deterministic Pass 2 (`classify-annotations.ts`):

1. **Format.** Garage door reused the *window* parser `parseDimension` — `/^(\d+)[xX×](\d+)$/`. That
   regex rejects `"2,210 x 4,800"` (thousands commas + spaces around the separator) **and** the no-`x`
   `"4800"` form, so the annotation fell straight through as a raw string.
2. **Discriminator.** Garage doors are **normal door height (~2.1m, rarely taller)** and identified by
   **width**, not height — confirmed by the QS's own size list (2.4×2.1 / 2.7×2.1 / 4.8×2.1, all 2.1m
   high). There was no width-band + height-band combination logic; the export's first-number-as-width
   re-parse also grabbed the height (2210) and binned it as null.

### 7.2 The fix (windows-style: pure + unit-testable)

New `classifyGarageDoorAnnotation(text)` in `src/lib/takeoff/classify.ts`, called from
`classify-annotations.ts`:

- **Format-independent width recovery.** Strips thousands commas, extracts every number, converts
  metres → mm. Garage doors are always wider than tall, so the **larger** number is the width and the
  **smaller** the height; a lone number is the width (height defaults to the standard 2.1m). Handles
  `"2,210 x 4,800"`, `"4800x2210"`, `"4800"`, `"4.8 x 2.1"` alike.
- **Combination gate (no false positives).** Classifies only when **width ∈ ~2.4–5.4m** AND
  **height ∈ a tolerant ~2.0–2.4m band** (covers the 2100 and 2210-style reads; kept tight since a
  taller garage door is rare). Garage *proximity* is already established upstream — Pass 1 returns the
  text near the garage-door opening — so the annotation is garage-proximate by construction.
- **Maps to the QS categories.** Snaps the measured width to the nearest standard (2.4 / 2.7 / 4.8) and
  emits the canonical label `"4.8×2.1"` + QS cell (H176/H178/H180). The export's existing cell mapping
  consumes the clean label unchanged.

Generalisation: the 2.1m height is a tolerant **band, never `== 2.1`**; widths are a **range**, not the
Beddis `4800`/`2681` literals; classification is by the height+width+proximity combination, never a
literal dimension string. **No Beddis literals in production code** (only the test asserts 4.8×2.1).

Tests: `tests/phase2c/garage-door.test.ts` (12 pure unit tests — comma/space/no-`x`/metre formats,
the three QS categories, snap-to-nearest, and the combination gate rejecting too-narrow / too-wide /
too-tall / non-numeric inputs).

### 7.3 Scorecard — prelim (primary) vs truth

| Metric | Prelim (primary) | Truth | Verdict |
|---|---|---|---|
| Raw garage annotation | `"2,210 x 4,800"` | — | read OK |
| **Garage door size** | **4.8×2.1** (H176, double) | 4.8 × 2.1 insulated | ✅ **PASS** |
| Floor area / ext wall / windows | 165.4 m² / 63.8 lm / 13 | unchanged | ✅ no regression |

`type: "insulated"` is not derivable from the dimensions; the QS export labels the H176 double as
"4.8×2.1 Insulated" by convention.

### 7.4 Concept (secondary) — reported, not graded

The concept run reads its garage annotation as **`"2 000"`** (≈2.0m, below the ~2.4m garage width band),
so it stays **unclassified** — correctly *not* a false positive. Concept is not graded for the garage
door (no clean double-garage callout on that single-page set).

### 7.5 No-regression check

- Phase 1 replay green — McAlevey reads `"6044"` (above the ~5.4m band) → not classified, stays raw
  `"6044"`, so the golden fixture is byte-identical. Cached-replay deterministic.
- Phase 2a (page selection) and 2b (window schedule) unchanged; floor/perimeter/window_count identical.
- 50 offline tests pass (incl. the 12 new 2c tests).

---

## 8. Phase 2d re-baseline — derived fields (ext wall area D21 + total area D14)

### 8.1 What was missing

Three QS fields were never computed. Two are pure arithmetic on values IQ already holds:

- **External wall area** (QS **D21**) = `perimeter × stud_height − total_opening_area`.
  Hand-validated on both jobs: Beddis `63.8 × 2.4 − 43.92 = 109.2`; Harrison `60.4 × 2.4 − 46.89 = 98.07`.
- **Total area** (QS **D14**) = `floor_area + alfresco_area`.
  Beddis `165.4 + 1.7 = 167.1`; Harrison `170.79 + 1.2 = 171.99`.

### 8.2 The fix

- New pure module `src/lib/takeoff/derive-fields.ts` — literal-free, no per-job constants:
  `computeOpeningAreaM2`, `computeExternalWallAreaM2`, `computeTotalAreaM2`.
- `classifyAnnotations` computes both fields (the floor-plan-callout path, used by Harrison).
- `applyWindowAggregate` **re-derives** the ext wall area once the canonical Door & Window
  Schedule window set is known (the scheduled path, used by Beddis — the callouts it saw were empty).
- Stud height = the **takeoff** value (`ceiling_height_m`, 2.4), never a raw OCR 2.42 (which overshoots).
- Gable ends excluded by construction (`perimeter × stud` is the rectangular wall area).
- Alfresco read tightened (extract prompt): match **porch / alfresco / covered-entry** labels only,
  reject patio / deck / driveway / paving. Flagged **low-confidence** in `notes` for human confirm.
- Export wired: QS **D14** (total area) + **D21** (ext wall area); summary table + UI rows updated.

### 8.3 Scorecard — Beddis prelim (computed from the last live extraction)

| Field | IQ | QS truth | Δ | Status |
|---|---|---|---|---|
| Opening area (13 sched windows + garage) | 48.83 m² | 43.92 m² (incl. entrance) | +4.91 | inherits extraction |
| **External wall area** (D21) | **104.29 m²** | 109.2 m² | −4.91 | ⚠️ formula exact; openings over-read |
| **Total area** (D14) | **165.4 m²** | 167.1 m² | −1.70 | ⚠️ alfresco not read on prelim box |

The formula is exact — the deltas are **inherited from the openings/alfresco feeding it**, exactly as the
brief anticipated ("only as good as the opening extraction"):

- **Ext wall −4.91:** the live schedule reads several window heads tall (~2.21 m), so the summed opening
  area (48.83) over-shoots the QS 43.92; the missing entrance door (which the QS folds in) does not
  offset it. Both are Pass-1 / schedule extraction issues, out of scope for 2d.
- **Total −1.70:** the prelim summary box yields no alfresco (`alfresco_area_m2 = null`), so total falls
  back to the floor area. The clean alfresco read is the known-fuzzy field (graded vs the plan print,
  not forced to the QS).

### 8.4 Deterministic proof (unit tests)

The formulas land **exactly** on both jobs with correct openings — pinned in `tests/phase2d/derive-fields.test.ts`:
`computeExternalWallAreaM2(63.8, 2.4, 43.92) === 109.2`, `(60.4, 2.4, 46.89) === 98.07`;
`computeTotalAreaM2(165.4, 1.7) === 167.1`, `(170.79, 1.2) === 171.99`; plus the opening-area sum,
schedule-over-callout precedence, the 2.42-overshoot guard, and gable-exclusion.

### 8.5 No-regression check

- Phase 1 replay green — golden regenerated to carry the two new fields (McAlevey ext wall
  `54.8 × 2.4 − 13.41 = 118.11`, total `136.3`); deterministic.
- Phases 2a / 2b / 2c unchanged; garage still 4.8×2.1; window_count 13; floor/perimeter identical.
- Full offline suite **294 passed / 3 skipped**.

---

## 9. Harrison cold baseline (Lot 9 Kiwitea, job 25052) — report only

First live run of validation set #2 against the real concept rev 4 (6-page) PDF.
**Report only — no source touched, nothing tuned.** A failed assertion here is a *finding*, not a
regression. Input: `Lot 9 Kiwitea_CONCEPT rev 4.pdf` (from the OneDrive job folder
`…/25052 Harrison … Lot 9 Kiwitea Grove/03 PLANS/01 Preliminary Plans/`, 1.87 MB, 6 pages),
copied to `tests/fixtures/harrison/concept.pdf`. Rendered with **PyMuPDF (fitz)** to 6× 1400px JPEGs
(`_render/concept-1..6.jpg`) + page text (`_pagetext/concept-1..6.txt`) — poppler/pdftoppm not on PATH.
Command: `HARRISON_LIVE=1 GEOMETRY_BASE=http://localhost:8000 npx vitest run tests/harrison/baseline.test.ts`.
The run halted on the first hard assertion (`window_source`), but the full scorecard JSON was written
first (`_render/baseline-results.json`).

### 9.1 The six call-outs (verbatim from the brief)

| # | Call-out | Result | Verdict |
|---|---|---|---|
| 1 | Floor-plan page picked (A201 vs framing A202) | **page 2** (`dimension_floor_plan`, score 95, certainty high) over page 3 framing (scored `legends` −55). chosen_page 2. | ✅ **2a generalises** to the newer template |
| 2 | `window_source` + callout count | **`"none"`** — 15 raw window annotations, but `windows_by_room` = null → `window_count` null. schedule_page null. | ❌ **headline finding** — no-schedule path did **not** fire |
| 3 | Garage 2150×4800 → should be 4.8×2.1 | raw read **`"2,710"`** → classified **`2.7×2.1`** | ❌ Pass-1 read the wrong number; classifier correct on its input |
| 4 | Geometry floor / perimeter (exp 170.79 / 60.4) | service used **page 1 (site plan)**: floor **60.4**, perimeter 60.4/66.64, room_count 1; internal geometry 175.37 vs printed 60.4 → flagged **190% mismatch** | ❌ geometry picked the site plan & mis-OCR'd floor |
| 5 | Ext-wall delta vs QS 98.07 | **139.29 m²**, Δ **+41.22** (60.4×2.4 − 5.67 garage; windows absent) | ⚠️ formula exact, openings missing |
| 6 | Total delta vs QS 171.99 | **172.1 m²**, Δ **+0.11** (floor 170.8 + alfresco 1.3) | ✅ within the predicted plan-vs-QS fuzz |

### 9.2 Full scorecard

| Field | IQ (got) | QS truth | Δ | Note |
|---|---|---|---|---|
| Page selected | page 2 (Floor Plan) | A201 floor plan | — | decisive over page 3 framing ✅ |
| floor_area_m2 | **170.8** | 170.79 | **+0.01** | from Pass-0 `livingAreaM2`, page 2 ✅ |
| alfresco_area_m2 | 1.3 | 1.2 | +0.1 | correctly picked **Porch** over **Patio**, flagged low-confidence ✅ |
| total_area_m2 (D14) | 172.1 | 171.99 | +0.11 | floor + alfresco ✅ |
| external_wall_area_m2 (D21) | 139.29 | 98.07 | **+41.22** | inherits the window collapse (only garage subtracted) ❌ |
| window_source | **none** | floor_plan_callouts | — | **fallback did not fire** ❌ |
| window_count | null | 14 callouts / 11 proper | — | 15 raw anns → 0 classified ❌ |
| garage_door_size | 2.7×2.1 | 4.8×2.1 | — | wrong Pass-1 number ❌ |
| internal_door_count | 10 | 7 standard | +3 | expected plan-shows-doubles discrepancy (do not tune) |

### 9.3 Root cause — the generalisation gap (finding #2, the important one)

Harrison's floor plan carries **bare W-code callouts** (`W01`–`W14`, all 14 confirmed in the page-2 text)
with **no inline `H×W` dimensions** and **no separate Door & Window Schedule page**. The no-schedule
fallback (`aggregateWindows(null, windows_by_room)`) assumed the callouts carry parseable dimensions —
but `parseDimension`'s `^(\d+)[xX×](\d+)$` rejects a bare `W07`. Only **6** `NxM` strings exist on the
page (`100 x 600`, `150 x 750`, `1000x1000`, `900x1200`, `600x600` — joinery/cladding notes, none a
window size), so `windows_by_room` collapses to null and the source records `"none"`. **This is the
real gap:** a plan whose windows live only in bare codes, with no schedule, has nowhere for the window
set to come from. Beddis never exercised it (it had an A501 schedule).

Garage (finding #3): Pass-1 OCR'd **`2,710`** (a single-door width) instead of the `2150 × 4800`
double, so the tolerant 2.0–2.4 m height band was never actually tested — the classifier did the right
thing with the wrong input.

Geometry (finding #4) is a **separate service issue**: the engine selected page 1 (site plan), not the
floor plan, and its printed-vs-geometry floor-area check fired at 190%. The AI takeoff floor (170.8) is
the correct figure; the geometry 60.4 is not.

### 9.4 What passed vs what this unblocks

- ✅ **Page selection (2a)**, **floor area**, **alfresco label discrimination**, **total area**, and the
  **derived-field arithmetic (2d)** all generalise cleanly to the newer 25052 template.
- ❌ **Windows** are the headline gap: no-schedule + bare-code callouts ⇒ empty window set. A future
  fix would need to read the `W0x` codes' sizes from the joinery legend / elevations, or treat the
  callout count itself as the window count when no dimensions are available.
- ❌ **Garage Pass-1** mis-read; **geometry page selection** mis-picked. Both pre-existing, both out of
  scope for this report.

No code, tests, or fixtures were changed for this run.

---

## 10. Phase 2e — No-schedule window parsing (the §9 fix)

Closes the headline finding from §9.2/§9.3: Harrison's floor-plan window callouts reached the
pipeline intact but were discarded by two guards in `src/lib/takeoff/classify-annotations.ts`. Both
are now fixed; the no-schedule callout path fires.

### 10.1 The two breaks (from the read-only diagnosis — Answer A)

1. **Strict dimension regex.** `parseDimension`'s `^(\d+)[xX×](\d+)$` demanded pure-digit · single-x ·
   pure-digit, anchored — so Harrison's newer template print `2,150 x 2,100` (thousands commas +
   spaces) returned null for **all 15** openings → `windows_by_room` null → `window_source: "none"`.
2. **Room-box guard.** `if (height > 2000 && width > 2000) continue` dropped legitimate tall sliders
   (`2,150 x 2,400`) as if they were room-dimension boxes.

### 10.2 The fix (generalised, no per-job literals)

- **One shared NZ-dimension reader.** Exported `parseDimsMm` (already used by the garage path since
  2c) and routed the window `parseDimension` through it. Commas and spaces are now tolerated
  **identically** on both paths — `2,150 x 2,100`, `2150 x 2100`, and `2150x2100` all read the same.
  The no-comma form older plans use (`1300x1800`) parses byte-identically — additive tolerance, not a
  replacement. There is now a single place that knows how to read a dimension string.
- **`nearOpening` is the discriminator, not size.** The loop already gates on Pass-1's `nearOpening`
  flag (verified on **both** Harrison and McAlevey: every real opening is `nearOpening:true`, room
  boxes are not). The crude `>2000×2000` heuristic is replaced by a conservative room-*footprint*
  backstop: drop only when **both** dims reach room scale (`≥3000mm`). No window is 3 m tall, so a
  tall slider can never trip it; a real room box (e.g. `4131×3250`, `4300×3600`) still does. Keeps the
  slider, still drops the box — no traded failure.

### 10.3 Re-baseline — Harrison (the no-schedule path, the thing being fixed)

| Field | Before (§9) | After (2e) | QS truth | Δ after | Status |
|---|---|---|---|---|---|
| `window_source` | **none** | **floor_plan_callouts** | callouts | — | ✅ fixed |
| `window_count` | null | **15** | 14 callouts / 11 proper | — | ✅ all callouts classified |
| `windows_by_room` | null | 12 rooms, correct H×W (2.15×2.4 slider kept) | — | — | ✅ |
| **external_wall_area_m2** (D21) | 139.29 (Δ +41.22) | **97.59** | 98.07 | **−0.48** | ✅ now spot-on (openings feed it) |
| floor_area_m2 | 170.8 | 170.8 | 170.79 | +0.01 | unchanged ✅ |
| total_area_m2 (D14) | 172.1 | 172.1 | 171.99 | +0.11 | unchanged ✅ |
| garage_door_size | 2.7×2.1 | 2.7×2.1 | 4.8×2.1 | — | ❌ still Pass-1 misread `2,710` — **out of scope** (vision extraction, not parsing) |

The window collapse is gone: opening area now sums to ≈47.4 m² (perimeter 60.4 × stud 2.4 = 144.96;
144.96 − 97.59 = 47.37 vs QS total openings 46.89), pulling ext-wall area from +41.22 to **−0.48**.
The garage size and the geometry service picking the site plan remain known, out-of-scope misses.

### 10.4 Re-baseline — Beddis (no regression)

| Field | Value | Status |
|---|---|---|
| prelim `window_source` | **schedule** | unchanged ✅ |
| prelim `window_count` | **13** (W01–W13, schedule page 7) | unchanged ✅ |
| prelim `garage_door_size` | **4.8×2.1** | unchanged ✅ |
| prelim `total_area_m2` | 165.4 | unchanged ✅ |
| prelim `external_wall_area_m2` | 100.1 (was 104.29) | live re-read variance only — schedule path untouched by 2e, value never QS-asserted |
| concept (no-schedule) `window_source` | **floor_plan_callouts**, 9 windows | callout path also exercises cleanly on Beddis ✅ |

The Beddis prelim is schedule-sourced, so its canonical window set and the schedule-derived ext-wall
area are **untouched** by the callout-parser change (the change only affects the no-schedule callout
path Beddis prelim discards). All Beddis hard assertions stay green.

### 10.5 No-regression / determinism

- **McAlevey replay golden unchanged** — its callouts are clean `NxN` with no comma/space and none at
  room scale, so the tolerant reader and the new backstop reproduce the identical `windows_by_room`.
  No golden regeneration needed.
- New unit tests pin the contract: comma+space parsing, no-comma identity, the kept `2150×2400`
  slider, the dropped `4300×3600` box, the `≥3000` boundary (`2999` kept / `3000` dropped), and the
  full Harrison 15-callout set → `window_count 15`.
- Full offline suite **300 passed / 3 skipped**; Phases 1 / 2a / 2b / 2c / 2d unchanged.

---

## 11. Phase 2f — Schedule-path head over-read + entrance omission

Targets the residual on the **schedule** path. Diagnosed in Step 1: every Beddis schedule window read
`heightMm 2210` — the floor-to-top-of-joinery **head/mounting datum**, not the window's own glazed
pane — and the **entrance/external doors** were absent from the opening sum. Two independent errors
pulling opposite ways on `external_wall_area_m2 = perimeter × stud − opening_area`: tall heads
*inflate* the opening (wall too small); the missing entrance *shrinks* it (wall too big).

### 11.1 Fix A — read the glazed pane height, not the head datum (vision-prompt)

`WINDOW_SCHEDULE_SYSTEM_PROMPT` now instructs the reader to return each window's **glazed-pane
height** (the joinery unit's own opening), and to reject the tall floor-to-head **mounting datum** when
both are shown — when a unit prints a head datum stacked over a sill height, return the shorter pane
height. No `2210`/`2.21` literal and no per-window patch: it's a conceptual instruction (unit size vs
installation reference), so it generalises to any Jennian schedule. Because it's a model-prompt change
it is **not deterministically unit-testable** — validated on a live Beddis re-baseline and the heights
are confidence-flagged, not pinned.

### 11.2 Fix B — external doors in the schedule-path opening sum (sub-task + flag)

Per the brief, Fix B first **confirms** the entrance is actually extracted with dimensions. It is
**not**: the Beddis A501 schedule lists windows only (no `D-`/`GD` rows), and the floor-plan callouts
carry no `2.1×1.4` entrance opening. That triggers the brief's *"not extracted at all → sub-task;
include what's reliably available, confidence-flag the rest, do not fabricate"* branch — so **no 2.94
entrance is invented**. The change is structural, not a tuned number:

- `computeOpeningAreaM2` is now **door-aware**: a new `externalDoors` input sums dimensioned external
  doors **when a caller supplies them**. The old hard comment *"external doors … are NOT included
  here"* is gone — the function no longer structurally excludes them.
- `applyWindowAggregate` (schedule path only) feeds external doors via a `collectScheduleExternalDoors`
  **seam** that returns `[]` today (no dimensioned external-door source exists yet) and, when empty,
  appends a **confidence flag** to `notes`: *"external-door openings … are excluded … ext-wall area is
  a slight overshoot; confirm against the QS."* The seam is where a future door-extraction pass plugs
  in; until then nothing is fabricated and the omission is surfaced.

Scope is the **schedule path only** — Harrison is callout-path and already folds its entrance into
`windows_by_room`, so it never passes `externalDoors` (default `undefined`) and is untouched.

### 11.3 Re-baseline — Beddis (the schedule path, the thing being fixed)

| Field | Before (2e) | After (2f) | QS truth | Δ after | Status |
|---|---|---|---|---|---|
| prelim `window_source` | schedule | **schedule** | schedule | — | unchanged ✅ |
| prelim `window_count` | 13 | **13** | 13 | — | unchanged ✅ |
| prelim `garage_door_size` | 4.8×2.1 | **4.8×2.1** | 4.8×2.1 | — | unchanged ✅ |
| schedule heights | all `2.21` | **varied** `[2.21, 0.7, 1.3, 1.61, 1.1, 1.1, …]` | per-unit glazed | — | ✅ Fix A reads pane heights; floor-to-head sliders legitimately stay 2.21 |
| **external_wall_area_m2** (D21) | 104.29 (Δ −4.91) | **107.64** | 109.2 | **−1.56** | ✅ closer; residual = still-tall slider heads partly offsetting the un-extracted entrance |
| prelim `notes` | (areas) | **+ entrance-omission flag** | — | — | ✅ Fix B confidence flag present |
| total_area_m2 (D14) | 165.4 | 165.4 | 167.1 | −1.7 | unchanged (no alfresco on prelim summary) |

Fix A moved 5 sill-mounted windows off the head datum onto their glazed heights; the remaining `2.21`
reads are floor-to-head sliders/stackers whose glazed pane genuinely reaches the head line. Ext-wall
area improved from Δ−4.91 to **Δ−1.56**. It is **not** at 109.2 and was never tuned to be: the residual
is the honest sum of a partially-corrected head read and the deliberately-not-fabricated entrance,
which the `notes` flag documents.

### 11.4 Re-baseline — Harrison (confirm callout path untouched)

| Field | 2e | 2f live re-run | QS truth | Status |
|---|---|---|---|---|
| `window_source` | floor_plan_callouts | **floor_plan_callouts** | callouts | unchanged ✅ |
| `external_wall_area_m2` | 97.59 | 96.54 | 98.07 | live re-read variance only — see note |
| `garage_door_size` | 2.7×2.1 | 2.7×2.1 | 4.8×2.1 | ❌ Pass-1 garage misread `2,710` — **out of scope** |

Harrison's path is **structurally unchanged**: its `computeOpeningAreaM2` call passes no
`externalDoors` (default `undefined` → identical arithmetic) and `aggregateWindows` returns
`floor_plan_callouts`, so `applyWindowAggregate` early-returns the takeoff with no `notes` flag and no
re-derivation. The 97.59→96.54 difference is entirely **live Pass-1 non-determinism** on the
callout/garage reads (this run misread the garage as `2,710` and re-read a few callouts), not a code
change. The failing assertion is the known **out-of-scope** garage misread.

### 11.5 No-regression / determinism

- **Full offline suite 300 passed / 3 skipped** — `derive-fields` (new optional `externalDoors`,
  default off), `aggregate-windows` (new seam + flag), and the prompt change introduce no failures.
- **McAlevey replay golden unchanged** — the prompt change touches only the live schedule reader; the
  golden is an offline replay and `computeOpeningAreaM2` with no `externalDoors` is byte-identical.
- Fix A is a vision-prompt change → **not deterministic**; validated live, heights confidence-flagged.
  Fix B's entrance remains a documented **sub-task** (door extraction with dimensions) — the seam is in
  place, the omission is flagged, and no figure is fabricated to hit 109.2.

---

## 12. Phase 3 — Page-of-truth reconciliation (geometry ↔ AI)

First slice of the loose-coupling/reconciliation debt logged after 2a. The geometry engine and the AI
path each chose their measurement page **independently**: the Harrison cold run (§9) had geometry
measure the **site plan** while the AI correctly selected the A201 floor plan — only geometry's own
190%-mismatch sanity check happened to catch it. This makes the AI's floor-plan classification the
single **page-of-truth** both layers measure.

### 12.1 Step 1 — investigation (approach before building)

- **The geometry API already accepts the page.** `POST /measure?page=N` takes a **0-based** page index
  (omit to auto-detect). No geometry-repo / cross-repo contract change — the fix is **app-side only**.
- **The app already knows the AI page** at the geometry call site: `pickPrimaryFloorplan` sets
  `selectedIndex`, and `pageAnalyses[selectedIndex].pageNumber` is the floor-plan page (1-based). The
  call at `upload.tsx` passed **no page**, so geometry ran its own OCR-score auto-detect
  (`_find_floor_plan_page`) — the silent-divergence source.

### 12.2 Step 2 — implementation (preferred path: force agreement)

- New pure module **`page-of-truth.ts`** (literal-free, reconciles by page **role**):
  - `resolveGeometryPageIndex(selectedIndex, pages)` → the AI floor-plan page as a 0-based geometry
    index (`pageNumber − 1`); `undefined` when there's no pick → geometry self-selects (prior behaviour).
  - `reconcileGeometryPage(requested, page_used)` → `{ agreed, note }`; flags when geometry's reported
    `page_used` ≠ the page we pinned (out-of-range, a proxy dropped the param, an older build).
- **`geometry-api.ts`** — `measurePlanGeometry(file, name, page?)` appends `?page=N` when given
  (backward-compatible optional arg; `run.ts` / Pipeline A keeps auto-detect, out of scope).
- **`upload.tsx`** — pins geometry to `resolveGeometryPageIndex(selectedIndex, pageAnalyses)` and, as
  defence-in-depth, pushes the reconciliation note + a `toast.warning` when the pages diverge. Geometry's
  190%-mismatch sanity check is **retained**, untouched (the geometry repo is not modified at all).

### 12.3 Re-baseline — Harrison (the run that exposed it)

| Field | Before | After (3) | Status |
|---|---|---|---|
| AI floor-plan page (`pickPrimaryFloorplan`) | page 2 | **page 2** | classification unchanged |
| geometry page (auto-detect → **pinned**) | self-selected (could pick site plan) | **page 2 (index 1), pinned to AI** | ✅ forced agreement |
| `page_reconciliation` | n/a (independent) | **`{ agreed: true }`** | ✅ no divergence |
| perimeter from agreed page | 60.4 | **60.4** | ✅ floor 170.8 / perim 60.4 from the floor plan |
| garage_door_size | 2.7×2.1 | 2.7×2.1 | ❌ Pass-1 garage misread `2,710` — **out of scope** (live vision flake) |

Geometry and the AI now **deterministically** resolve to the same A201 floor plan — the site-plan
measurement of §9 is structurally impossible because geometry is pinned to the AI's classified page.
The sole failing assertion is the known out-of-scope garage Pass-1 misread (vision non-determinism);
all Phase 3 page-reconciliation assertions pass.

### 12.4 Re-baseline — Beddis (no regression)

| Field | Before | After (3) | Status |
|---|---|---|---|
| AI floor-plan page | page 3 | **page 3** | unchanged ✅ |
| geometry page | auto → index 2 | **pinned index 2 (= AI page 3)** | ✅ agreed |
| `page_reconciliation` | n/a | **`{ agreed: true }`** | ✅ |
| geometry floor / perimeter | 165.4 / 63.8 | **165.4 / 63.8** | unchanged ✅ no regression |

Beddis auto-detect already landed on the floor plan, so pinning changes **no numbers** — it removes the
*risk* of a future divergent auto-detect. All Beddis hard assertions stay green.

### 12.5 No-regression / determinism + next slices

- **Full offline suite 309 passed / 3 skipped** (+9 new `page-of-truth` unit tests: 1-based→0-based
  resolution, no-pick/out-of-range → undefined, sparse page numbers by role, and the divergence flag).
- Reconciliation is **literal-free** and role-based → works single-page, multi-page, and both templates.
- **Next reconciliation slices (noted, not built here):** F-021 (Pipeline A silent degraded runs) and
  F-022 (cross-check AI counts vs geometry/CV). Geometry's internal CV/OCR accuracy (e.g. Harrison
  geometry reading floor 60.4) is a separate, out-of-scope track.

---

## 13. Phase 4, Slice 1 — Vector-First Hybrid (TWO proven fields)

**Mode:** cross-repo build (geometry engine `jennian-iq-geometry-api` + app `jennian-plan-iq`), additive
and backward-compatible both directions. Branch `phase4-slice1` in **both** repos.

**What shipped (and, deliberately, what did not).** The geometry engine now reads positioned text
straight from the PDF vector layer (PyMuPDF — no render, no OCR, no model) and returns an additive
`vector_annotations` block on `/measure`. The app consumes exactly **two** deterministic fields through a
single pure seam (`src/lib/takeoff/vector-annotations.ts`), preferring vector and **falling back to vision**
when the vector layer is absent/unusable:

1. **GARAGE door width** — the dim-pair nearest a `/garage/i` label (width = larger side), classified
   through the *same* shared `parseDimsMm` → `classifyGarageDoorAnnotation` the vision path uses.
2. **SCHEDULE head-datum SAFEGUARD** — the engine detects a Door & Window Schedule's shared
   head/mounting datum **by repetition** (most-repeated large value on a self-named schedule grid), and the
   app **rejects** (nulls) any window height read AS that datum. No fabricated heights.

Per-window glazed *heights* are **NOT** emitted: a Step-0 probe found they are not printed as positioned
numbers for the majority of windows (8/13 on Beddis), so extracting them would mean guessing. Deferred to a
later slice. **No per-job literals** anywhere: garage by label proximity, datum by repetition — never the
numbers 4800 / 2210 / 2150, nor pixel positions.

### 13.1 Step 0 — spikes reproduced before wiring

| Fixture (floor-plan page) | garage (nearest /garage/i pair) | schedule datum (by repetition) |
|---|---|---|
| Harrison `concept.pdf` idx1 | **4800** (`2,150 x 4,800`, 96.7px) | none (no schedule sheet) ✅ |
| Beddis `prelim.pdf` idx2 | **4800** (`2,210 x 4,800`, 95.3px) | **2210** ×12 on schedule page idx6 ✅ |

Garage reproduces cleanly on **both** templates. Per-window glazed heights did **not** reproduce → ship the
datum as a safeguard, not as heights (the Step-0 gate decision).

### 13.2 Re-baseline — Harrison (the 2710 flake from §12.3 is now fixed)

| Field | Before (Phase 3, §12.3) | After (Phase 4) | Status |
|---|---|---|---|
| raw vision garage annotation | `2,710` (single-garage misread) | `2,710` (unchanged — vision still flakes) | — |
| **`garage_door_size`** | **2.7×2.1** ❌ (the out-of-scope flake) | **4.8×2.1** ✅ | **FIXED — deterministic vector override** |
| `vector_annotations.garage.width_mm` | n/a | **4800** | ✅ from `2,150 x 4,800` |
| `vector_annotations.schedule` | n/a | **null** | ✅ no schedule sheet → safeguard never fires |
| window_source | floor_plan_callouts | floor_plan_callouts | unchanged ✅ no-schedule path intact |

The §12.3 garage assertion that was *expected to fail* (vision non-determinism) now **passes** — the engine
reads the `2,150 × 4,800` pair next to the garage label and the app prefers it over the `2,710` vision flake.

### 13.3 Re-baseline — Beddis (safeguard fires on the live 2f over-read)

| Field | Before | After (Phase 4) | Status |
|---|---|---|---|
| `garage_door_size` | 4.8×2.1 | **4.8×2.1** (now vector-backed) | value unchanged, provenance deterministic ✅ |
| `vector_annotations.garage.width_mm` | n/a | **4800** | ✅ |
| `vector_annotations.schedule.head_datum_mm` | n/a | **2210** (×12, 13 windows, page idx6) | ✅ |
| schedule window heights read AS datum (live AI) | 8 of 13 = 2210 (the 2f over-read) | **8 rejected → null + flagged** | ✅ safeguard fired: W01,W02,W05,W06,W07,W08,W11,W13 |
| window_count | 13 | **13** | unchanged ✅ (count from schedule, intact) |
| `external_wall_area_m2` (QS D21 = 109.2) | 107.64 | **134.22** | known overshoot — see note |

**Delta note (honest, do not fabricate):** the live `claude-opus-4-5` schedule read returned the **head
datum (2210)** as the height for 8/13 windows — exactly the Phase-2f over-read this safeguard targets. The
safeguard correctly **rejected** all 8 (height → null, flagged in `notes`). Because those 8 glazed heights
are now honestly **unknown** (not fabricated), they drop out of the opening sum, so `external_wall_area_m2`
moves to **134.22** — a *known overshoot* vs QS 109.2. The prior 107.64 was *coincidentally* near the QS
figure only because the over-read tall heights happened to offset the un-extracted entrance door; it was not
correct. Per the agreed scope (**garage + datum safeguard**, defer true per-window heights), this slice
ships the deterministic guard and surfaces the residual as a flagged low-confidence field rather than a
tuned number. True per-window glazed heights remain a later slice.

### 13.4 Backward-compatibility / forced fallback

- The `vector_annotations` field is **optional**: absent on older engine builds and on any page without a
  usable text layer (scan/blank → `vector_usable:false`). When absent, both seam functions return their
  input unchanged → **today's vision behaviour exactly**. Pinned by unit tests (`resolveGarageDoorSize`,
  `preferVectorGarage`, `safeguardScheduleHeights` all no-op on `undefined`).
- A vector garage pair that is **not** a real door (e.g. a `2,649 × 1,400` read, or a `6 120 X 5 950` room
  footprint) classifies to null via the shared classifier → the app keeps the **vision** value. Proven in
  the unit suite.

### 13.5 No-regression / determinism

- **Full offline suite 327 passed / 3 skipped** (+18 new `vector-annotations` seam unit tests; +11 new
  geometry-engine `tests/test_vector.py` pytest cases). Both live baselines (`BEDDIS_LIVE`, `HARRISON_LIVE`)
  green against local geometry on `:8000`.
- Geometry vector read is **deterministic** (re-run identical) and **literal-free** — garage by label
  proximity, datum by repetition. Two templates are **not** proof of generality; template-dependence
  remains flagged for future fixtures (e.g. a schedule that does not self-name, or a garage label variant).
- **Pipeline A / `run.ts` untouched.** The change is confined to the geometry `/measure` payload and the
  app's concept upload seam.

## 14. Phase 4, Slice 2 — Vector Widths + Counts (ungated)

**Mode:** build, mostly app-side, additive and backward-compatible. Branch `phase4-slice2` in **both** repos
(geometry needed a small additive extension; the app carries the consumption seam). Builds directly on
Slice 1's `vector_annotations` block.

**What shipped (and, deliberately, what did not).** The seam that already prefers the deterministic vector
read for the garage is widened to two more reproducible facts read off the **floor-plan** vector layer:

1. **Opening WIDTHS** — every opening is dimensioned as a positioned `datum × width` pair. The engine finds
   the shared head/mount **datum by repetition** (the value inside a structural mounting-height band that
   recurs most as a pair side — never matched to a number) and emits each opening's **width** as its *raw
   printed token*. The app re-parses each token through the **same shared `parseDimsMm`** the vision/garage
   paths use (`resolveOpeningWidths`), preferring the vector multiset and **falling back to the vision
   widths** when the vector layer is absent/unusable/empty.
2. **Window/opening COUNT** — the distinct positioned **W-codes** (`W01…Wnn`). On a scheduled job the
   schedule's W-codes win; on a **no-schedule** template (Harrison) the floor-plan W-codes are the only
   vector count. `resolveWindowCount` prefers it over the vision callout count, vision fallback intact.
   `preferVectorOpenings` applies the count onto the takeoff.

**Out of scope — the gate (unchanged from Slice 1).** Per-window glazed **heights** are still **not** built
or guessed; they are gated on a *second* schedule-bearing ground-truth job (Beddis is the only window
schedule we have). The Slice 1 head-datum safeguard stays exactly as-is.

**Ext-wall area is NOT resolved by this slice — say it plainly.** Opening *area* needs `H × W`, and the
heights are still unresolved/rejected, so `external_wall_area_m2` **remains gated**. Slice 2 firms up the
**width + count** determinism so the area snaps together cleanly once heights land — it does **not** make
ext-wall correct now. `preferVectorOpenings` deliberately does **not** recompute the ext-wall area (the
count is height-independent; the area is not).

### 14.1 Geometry extension — deterministic, literal-free (proven on both real PDFs)

The additive `openings` block is computed on the measured floor-plan page (`extract_vector_annotations`).
Reproduced directly on the real fixtures (PyMuPDF, no render/OCR/model — identical every run):

| Fixture (floor-plan page) | `openings.window_count` | `datum_mm` (by repetition) | opening widths (raw tokens) |
|---|---|---|---|
| Harrison `concept.pdf` idx1 (no schedule) | **14** (W01…W14 callouts) | **2150** | `2,400 · 1,500 · 1,030 · 4,800 · 1,430 · 2,400 · 2,000 · 750 · 750` |
| Beddis `prelim.pdf` idx2 | **13** (W-codes) | **2210** | `800 · 800 · 3,000 · 1,600 · 800 · 2,000 · 4,800 · 1,030 · 2,000` |

Both include the **4,800** double-garage opening; both datums are found by **repetition** inside the
mounting-height band (excludes room dimensions like 3000+), never matched to 2150/2210. Room-footprint pairs
(e.g. `6 120 × 5 950`) carry no datum side and are excluded by construction.

### 14.2 Re-baseline — Harrison (the no-schedule template, on the same seam)

| Field | Before (Slice 1) | After (Slice 2) | Status |
|---|---|---|---|
| `vector_annotations.openings` | n/a | `{window_count:14, datum_mm:2150, widths×9}` | ✅ new |
| **`window_count`** | vision callout sum | **14** (vector-preferred W-codes) | ✅ deterministic |
| `window_source` label | floor_plan_callouts | floor_plan_callouts | unchanged ✅ |
| opening widths source | (vision) | **vector** (9 widths, incl 4800) | ✅ |
| `external_wall_area_m2` | (report-only) | **unchanged — still gated** | ✅ not recomputed |

### 14.3 Re-baseline — Beddis (scheduled job; ext-wall flag now rides on the field)

| Field | Before (Slice 1) | After (Slice 2) | Status |
|---|---|---|---|
| `vector_annotations.openings` | n/a | `{window_count:13, datum_mm:2210, widths×9}` | ✅ new |
| `window_count` | 13 (schedule) | **13** (vector schedule W-codes) | unchanged ✅ |
| opening widths source | (vision/schedule) | **vector** (9 widths, incl 4800) | ✅ |
| 8/13 glazed heights (live 2f over-read) | rejected → null + flagged | rejected → null + flagged | unchanged ✅ (Slice 1 safeguard) |
| **ext-wall flag in REAL output** | only in this doc | **rides on `notes`**: "`external_wall_area_m2 is incomplete (an overshoot)…`" | ✅ **the one fix** |
| `external_wall_area_m2` | 134.22 (overshoot) | 134.22 — **still gated on heights** | unchanged ✅ |

**The ext-wall confidence fix.** Previously the "ext-wall is an overshoot while heights are unknown" caveat
lived only in this baseline doc. `applyWindowAggregate` now appends a **deterministic flag to `takeoff.notes`
whenever any schedule window height is unresolved** (null) — so a live reviewer sees `external_wall_area_m2`
**flagged incomplete on the field itself**, never a clean-looking number. General (fires for any scheduled
job with unresolved heights), not Beddis-specific.

### 14.4 Backward-compatibility / forced fallback

- `openings` is **optional** on `VectorAnnotations` — absent on older engines / non-usable pages. When
  absent, `resolveWindowCount`/`resolveOpeningWidths`/`preferVectorOpenings` all return the **vision** value
  unchanged → today's behaviour exactly. Pinned by unit tests (forced-fallback on `undefined`,
  `vector_usable:false`, and empty `widths_raw`).
- Vector widths route through the **shared `parseDimsMm`** (comma/space/metre tolerant: `4.8 → 4800`,
  `1,030 → 1030`) — no second parser.

### 14.5 No-regression / determinism

- **Full offline suite 346 passed / 3 skipped** (+19 new Slice 2 unit tests in
  `tests/phase4/vector-openings.test.ts`; Slice 1 seam tests untouched and green). Both live baselines
  (`BEDDIS_LIVE`, `HARRISON_LIVE`) green against local geometry on `:8000` — widths/counts vector-preferred,
  deterministic, vision fallback intact.
- Geometry `openings` read is **deterministic** (re-run identical) and **literal-free** — count by W-codes,
  datum by repetition, widths as raw tokens parsed app-side. Two templates are **not** proof of generality;
  template-dependence remains flagged.
- **Pipeline A / `run.ts` untouched.** Change confined to the geometry `/measure` `openings` block and the
  app's concept upload seam.
- **Next slice:** per-window glazed **heights** (gated on a 2nd schedule-bearing ground-truth job) — once
  they land, the now-deterministic widths + counts let `external_wall_area_m2` snap together and come off the
  gate.

## 15. F-022 — Vector ↔ Vision Cross-Check (reconciliation slice)

**Mode:** build, **app-side only** (no geometry change), additive and backward-compatible. Branch
`f022-crosscheck` in the app repo. Reconciles values that **already exist** — it adds no new extraction.

**The gap it closes.** Slices 1–2 made the garage width, opening widths and window count deterministic from
the vector layer and **preferred vector with a vision fallback**. But where **both** a vector and a vision
value exist for the same quantity, the app preferred vector **silently** — it never surfaced that the two
paths *disagreed*. The canonical case is live in our fixtures: Harrison's garage read **2710** from vision and
**4800** from vector. We got the right answer (vector), but a reviewer was never told vision was badly wrong —
next time the silent disagreement could go the other way. F-022 turns path disagreement into a **confidence
signal**, catching this loose-coupling failure mode systematically.

**What shipped.** A pure, literal-free reconciliation layer (`src/lib/takeoff/reconcile-annotations.ts`):

1. **`reconcileScalar(field, vision, vector, unit)`** — a field-agnostic comparator that classifies the two
   readings **agree / disagree / uncheckable** and, on a material disagreement, returns a reviewer-facing flag.
2. **Material-disagreement gate is PROPORTIONAL, never a literal.** Two values disagree materially when their
   **relative** difference exceeds `MATERIAL_REL_TOLERANCE = 0.10`. This absorbs rounding/quantisation noise
   (a head datum `2210` vs `2200` = 0.5%; a ±1 count on ~15 windows = 6.7%) yet trips on a genuine path
   divergence (`2710` vs `4800` = 44%). 10% is structural — it scales with the value; no hard mm/count band.
3. **`reconcileVectorVision(visionGarageSize, visionWindowCount, vector)`** — cross-checks the scalar
   quantities where **both paths measure the same thing**: the **garage door width** (the canonical flake, and
   itself the widest opening width) and the **window count**. Returns a report whose `note` is appended to
   **`takeoff.notes`** — the same channel as the Slice 2 ext-wall flag — so it reaches the **live reviewer**.
4. **Vector still wins the value.** The flag is the *added* signal, **not** a behaviour change: the prefer-
   vector seam already chose the value; reconciliation changes nothing it resolves.

**Why opening widths are cross-checked via the garage, not as a blanket multiset.** The two paths' width sets
have **different membership**: the vision Door & Window **schedule lists windows only** (no garage door), while
the vector `openings` set **includes the garage**. A naïve width-multiset compare therefore *false-positives*
on a windows-only schedule (Beddis: vision max 3000 vs vector max 4800, purely because the schedule excludes
the garage). The **garage door width IS an opening width**, so the canonical width agreement/disagreement is
cross-checked cleanly through the garage field. Per-opening width reconciliation needs opening-level
correspondence across the two paths (not available) and is a documented follow-on.

### 15.1 Proven on both fixtures — a true-positive AND a true-negative

| Fixture | Field | Vision | Vector | Rel. diff | Reconciliation | Value used |
|---|---|---|---|---|---|---|
| **Harrison** (TRUE POSITIVE) | garage_door_width | **2700** (`2.7×2.1`, the 2710 flake) | **4800** | 44% | **DISAGREE → flagged** | `4.8×2.1` (vector) |
| **Harrison** | window_count | ~15 (callouts) | 14 (W-codes) | 6.7% | agree → no flag | 14 (vector) |
| **Beddis** (TRUE NEGATIVE) | garage_door_width | **4800** (`4.8×2.1`) | **4800** | 0% | **agree → no flag** | `4.8×2.1` |
| **Beddis** | window_count | 13 (schedule) | 13 (W-codes) | 0% | agree → no flag | 13 |

- **Harrison flag** rides on real output: `takeoff.notes` contains
  *"reconciliation: garage_door_width disagreed across paths — vision read 2700mm, the deterministic vector
  layer read 4800mm (44% apart). The vector value was preferred; confirm garage door width against the plan."*
  The resolved garage is **still `4.8×2.1`** — signal only, no value change.
- **Beddis** produces **no reconciliation note** — both checkable fields agree → **no false positive**. The
  garage field is cross-checked (status `agree`, not silently uncheckable).
- **Tolerance is material-only, not noise:** Harrison's 15-vs-14 count (6.7% < 10%) is *not* flagged, proving
  the gate absorbs ±1 quantisation while still tripping the 44% garage divergence.

### 15.2 Backward-compatibility / forced fallback

- When the vector layer is **absent or `vector_usable:false`**, or a **vision value is missing**, the field is
  **uncheckable** and never flagged → today's behaviour exactly. Pinned by unit tests.
- Garage width is parsed through the **shared `parseDimsMm`** (accepts the `W×2.1` label or a raw
  annotation) — no second parser; the larger side is the width.

### 15.3 No-regression / determinism

- **Full offline suite 359 passed / 3 skipped** (+13 new unit tests in
  `tests/phase4/reconcile-annotations.test.ts`, pinning agree/disagree/tolerance, the two fixture cases, and
  the forced fallback). Both live baselines (`BEDDIS_LIVE`, `HARRISON_LIVE`) green against local geometry on
  `:8000` — Harrison flags the garage disagreement, Beddis flags nothing.
- Reconciliation is **pure and deterministic** (re-run identical) and **literal-free** — the threshold is a
  proportion, not a fixture value; the comparator is field-agnostic.
- **No value behaviour changed.** Vector is still preferred for every resolved field; F-022 only adds the
  disagreement *signal*. `external_wall_area_m2` remains gated on heights (unchanged from Slice 2).
- **Geometry untouched** (app-side slice); **Pipeline A / `run.ts` untouched**.
- **Follow-on:** per-opening width reconciliation (needs opening-level correspondence across paths) and
  per-window heights (the standing gate) remain future slices.

## 16. Phase 4, Slice 3 — Entrance Door (asserted height + measured/printed width)

**Mode:** build, cross-repo (geometry emits, app consumes), additive and backward-compatible. Branch
`entrance-vector` in **both** repos. Scope = the **ENTRY door only** (anchored by an ENTRY/PORCH-type label);
sliders follow the same principle but have no QS truth to validate against yet → documented follow-on, not
built blind.

**The domain insight: you don't extract a front-door height — you assert it.** The entry/slider door HEIGHT is
a building **standard (2.1m)**. Asserting it dissolves the orientation problem (once the height is known, the
*other* printed number is the width) and reconciles the two jobs' **transposed QS columns**: Beddis' `2.1×1.4`
and Harrison's `1.4×2.1` are the **same door** — 2.1 high, 1.4 wide. Both jobs agree **width = 1400**.

### 16.0 Why v1 (text) and v2-geometry both stopped — the evidence

- **Step 0 (text / nearest-label) — STOP.** `probe_entrance2.py` proved the frame width is not recoverable as
  text: Beddis prints **no door token** at the entry; Harrison prints only the prose **"Frame to Frame 1430"**
  plus a **910 leaf** — no positioned dim-pair.
- **Step 1 (geometric width) — STOP (infeasible without overfitting).** Three drawing-primitive probes showed
  the entry is drawn as a **~900mm door leaf + porch hatch**; the **~1400 frame** exists only as annotation
  (Harrison) or is **absent** (Beddis). The wall-gap was unstable across templates (11194 / 1674 / 15866 mm)
  and the hatch lengths were coincidental (Beddis porch-**depth** 1401 vs Harrison porch-**width** 2208 — an
  overfit trap). Conclusion: a robust, generic geometric width is **not** achievable here.
- **Resolution — assert the standard, credit any printed width.** HEIGHT is always the standard 2.1m; WIDTH is
  the **printed "Frame to Frame NNNN"** when a plan annotates one (data-driven, `width_source:"vector_text"`),
  else the **entry-door standard 1.4m** (`width_source:"standard_assumed"`). Both 2.1 and 1.4 are **product
  standards** (identical across two independent jobs), **not per-job literals** — same argument the brief uses
  for the height. They are named, documented, overridable constants
  (`STANDARD_ENTRY_DOOR_HEIGHT_MM = 2100`, `STANDARD_ENTRY_DOOR_WIDTH_MM = 1400`) and the app **flags both as
  assumptions** so a human can confirm.

### 16.1 What shipped

- **Geometry (`pipeline/vector.py`, committed `37fd7ba`).** `_find_entrance(page, idx)` anchors on an
  entry-type label (`entry|entrance|foyer|porch`, ≤16 chars), asserts `height_mm:2100` /
  `height_source:"standard_assumed"`, defaults `width_mm:1400` / `width_source:"standard_assumed"`, and
  **upgrades the width** to the printed value when a `Frame to Frame NNNN` token sits within range of the label
  and in a plausible door band [700, 2600]mm → `width_source:"vector_text"`. Emitted as an additive
  `vector_annotations.entrance`; **absent** (null) when no entry label is found.
- **App (`vector-annotations.ts`, `reconcile-annotations.ts`, `upload.tsx`).** `resolveEntrance` →
  `preferVectorEntrance` folds the asserted door into the **opening set** (`windows_by_room.entrance`), so it
  lands in `computeOpeningAreaM2`. `entranceAssumptionNote` writes the honesty rail to `takeoff.notes`. F-022
  gains a 4th, optional input (`visionEntranceWidthMm`) and cross-checks `entrance_door_width` **only when the
  vector layer carries an entrance** — single-source in our fixtures (vision reads no entry door) → status
  **uncheckable**, never a false flag.

### 16.2 Proven on both fixtures — printed-width AND standard-assumed

| Fixture | Label | Width | Width source | Height | Folded into opening set | F-022 entrance |
|---|---|---|---|---|---|---|
| **Beddis** | `ENTRY` | **1400** | `standard_assumed` (no frame token) | **2100** asserted | `{qty:1, height_m:2.1, width_m:1.4}` | uncheckable (vision had none) |
| **Harrison** | `PORCH` | **1430** | `vector_text` ("Frame to Frame 1430") | **2100** asserted | `{qty:1, height_m:2.1, width_m:1.43}` | uncheckable (vision had none) |

- **Width came from:** Beddis = **asserted standard** (no printed frame); Harrison = **the printed
  frame-to-frame dimension (1430)**. Geometry could **not measure** the opening (§16.0 evidence) — neither
  fixture used a vision fallback because the geometry layer asserted/printed a width directly.
- **Honesty rails live in `takeoff.notes`:** both carry *"entrance door: height assumed standard 2.1m — confirm
  against the plan"*; Beddis adds *"width assumed standard 1.4m — confirm"*, Harrison instead credits *"width
  1.43m read from the printed frame-to-frame dimension"*; both end with the ext-wall rail *"the external wall
  area stays gated on the unresolved window heights and is **not recomputed** here."*

### 16.3 Honesty rails / no-regression / determinism

- **Ext-wall stays gated.** Adding the entrance to the opening set does **NOT** ungate `external_wall_area_m2` —
  the 8 unresolved window heights still block it; it stays flagged incomplete (Beddis ext-wall area unchanged at
  the Slice-2 value). No QS field is silently "completed" by the assertion.
- **No-regression.** Full offline suite **374 passed / 3 skipped** (+15 new unit tests in
  `tests/phase4/vector-entrance.test.ts`, pinning the asserted height, the standard-vs-printed width, the
  opening-set fold, the no-ext-wall-recompute, and the F-022 entrance cross-check). Both live baselines
  (`BEDDIS_LIVE`, `HARRISON_LIVE`) green against local geometry on `:8000`; floor 165.4 (Beddis) / 60.4
  (Harrison) unchanged.
- **Determinism / no per-job literals.** Width is fully data-driven where printed (Harrison 1430); the standard
  constants are named/documented/overridable product standards, not fixture values. Geometry is additive and
  backward-compatible (entrance absent on older engines / pages without an entry label). **Pipeline A /
  `run.ts` untouched**; `scraper.py` excluded.
- **Follow-on:** slider doors (same assert-the-height principle, no QS truth yet) and the standing per-window
  height gate remain future slices.
