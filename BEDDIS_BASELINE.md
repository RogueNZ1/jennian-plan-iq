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
