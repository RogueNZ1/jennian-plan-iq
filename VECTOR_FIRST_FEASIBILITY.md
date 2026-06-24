# Vector-First Extraction — Feasibility Study (Phase 4)

**Mode:** Investigation + read-only proof-of-concept. **No pipeline changes, no
production code, no branch.** This document is the only deliverable.

**Question:** Can we read dimensions and geometry straight from the vector PDF
layer (deterministically, no model in the loop), instead of rasterising the page
to an image and asking vision? Specifically — does that kill the two errors
vision actually made:

1. **Phase 2f head-over-read** — schedule glazed-pane height confused with the
   shared ~2210 head/mounting datum.
2. **Garage `2710` flake** — live vision misread the `4800`-wide garage door.

**Verdict up front: (b) Hybrid — strongly vector-first for numeric values.**
Every exact number vision got wrong is present, clean and positioned, in the
vector text layer of **both** fixtures, and both error modes are deterministically
recoverable by position. Vision is *not* retired — it remains the fallback for
scanned/raster plans and the engine for spatial/semantic association — but the
numbers themselves should come from the vector layer, not from the model.

---

## 1. What the spikes were

Four throwaway read-only scripts (PyMuPDF / `fitz`; no mutation, no model — run
twice, print identically). They are not production code and import nothing from
the app:

| Script | Purpose |
|---|---|
| `spike_vector_characterise.py` | Per-page vector-vs-scan signal for all 3 PDFs |
| `spike_vector_poc.py` | First pass at the two failing cases (comma-blind — see §6) |
| `spike_vector_dims.py` | "Where do the big dims live?" — full numeric span dump + dimension-line geometry |
| `spike_vector_confirm.py` | Comma-aware confirmation + scale calibration |

Fixtures exercised: **Beddis** (job 26100, A-series template — prelim 7pp,
concept 1pp) and **Harrison** (job 25191, newer 25xxx template — concept 6pp).
Two templates is a *start*, not proof — see §7 generalisation caveats.

---

## 2. Step 1 — the vector layer is real on every page (no scans)

`spike_vector_characterise.py` reports, for each page: positioned-text chars +
span count, vector drawing/segment count, and the largest raster image's page
coverage.

- **All pages of both fixtures are VECTOR** (text + geometry). Chars range
  1,122–8,148; vector segments 1,083–89,310; raster coverage ~0.01 everywhere
  **except** the Harrison site page (idx0), where an aerial photo inset covers
  0.32 of the page — and even that page is still vector text + geometry on top.
- **No rasterised/scanned page anywhere.** The "one big image, no text, no paths"
  scan signature did not appear.

Implication: for these templates, the text and dimension layers are addressable
without OCR. (A scanned-plan detector is still required for the real world — §5.)

---

## 3. Step 2 — the exact numbers vision got wrong are clean positioned text

### 3a. Garage width (the `2710` flake) — **recovered, both templates**

The garage door dimension is a single positioned span, and it is the nearest
dim-pair to the `GARAGE` label:

```
HARRISON: 'GARAGE' @x502,y513  ->  nearest dim-pair  2,150 x 4,800  @ 96px
BEDDIS  : garage callout present as                  2,210 x 4,800
```

`4,800` (= 4800 mm wide) is exact. Vision flaked it to `2,710`; the vector layer
never would. Recovering it is "find the `GARAGE`/`Garage` label span, take the
nearest `H × W` dim-pair" — deterministic, no model.

### 3b. Window/door opening dims — **all present as positioned `datum × width` pairs**

Comma-aware extraction (`spike_vector_confirm.py`) finds **18 positioned dim-pairs
on the Harrison floor (13 with a side ≥ 1500 mm)** and **17 on the Beddis floor
(13 ≥ 1500 mm)** — e.g. `2,150 x 2,400`, `2,150 x 1,430`, `1,300 x 1,800`. The
first number is the head/mount datum (2150 Harrison / 2210 Beddis), the second is
the opening width. Both are exact millimetres.

### 3c. Schedule head-datum vs glazed-pane (the Phase 2f bug) — **separable by position**

On the Beddis Door & Window Schedule (prelim idx6) the head datum and the W-codes
sit on distinct y-bands:

```
2,210 head-datum rows : y164, y327, y489
W-code rows (W01..W13): y208, y370, y533
glazed H/W cells      : interleaved on their own bands (e.g. y105 widths, y122/144/165 heights)
```

The `2,210` mounting datum is physically on its own rows, separate from each
window's glazed-pane cells. A row-band split tells the head datum from the pane
height **deterministically** — which is exactly the discrimination Phase 2f had to
coach the model to make in prose. Position kills the over-read without a prompt.

---

## 4. Step 3 — scale, and why most target numbers need none

`spike_vector_confirm.py` (part D):

- Both floor plans are **A3** (page box 1191×842 pt = **420×297 mm** paper) at a
  printed scale of **`1:100`** (the token is in the text layer).
- **Callout and schedule dimension text is already in millimetres** (`2,150` =
  2150 mm). So *reading* opening sizes, the garage, and schedule cells needs **no
  scale calibration at all** — they are literal mm strings.
- Scale (1:100 + known paper size, or calibration against one printed dimension)
  is only needed to convert **un-annotated wall geometry** (raw drawing
  coordinates) into millimetres — i.e. perimeter / floor area from path geometry.
  That is already the geometry engine's job (§6), and it can self-calibrate: pick
  a wall whose length is also printed as a dim-pair and solve units→mm.
- Bonus: the stated floor area is itself printed text — Harrison idx1 carries
  `170.8m²` as a span — so even the headline area is vector-cross-checkable
  against the geometry engine's measured value.

A "readable vs scanned" detector is the §2 signal inverted: a page is
vision-only when one raster image covers most of the page **and** positioned-text
chars are near zero **and** vector segments are near zero. None of our pages hit
that, but the detector is cheap and necessary before trusting the vector path.

---

## 5. Field-by-field recoverability

| Field | Vector-recoverable? | How / residual |
|---|---|---|
| **Garage door size** | ✅ Clean | Nearest `H×W` dim-pair to `GARAGE` label; `4,800` exact on both templates |
| **Opening (window/door) widths** | ✅ Clean | All callouts are positioned `datum × width` mm spans |
| **Schedule glazed-pane heights** | ✅ Clean | y-band split separates the 2210/2210 head datum from pane cells |
| **Window count** | ✅ Clean | `W01…W13` are positioned spans → count directly |
| **Page classification (which page is the floor plan)** | ✅ Strong | Room labels, `1:100` token, drawing number (`A201`/`A501`) all positioned text → deterministic scorer, no vision |
| **Floor area (stated)** | ✅ Present | Printed as text (`170.8m²`) where shown; cross-checks geometry |
| **Perimeter / floor area (measured)** | ◑ Geometry engine | Vector path geometry + scale; already the engine's job — vector confirms, doesn't replace |
| **Callout → room association** | ◑ Spatial logic | Nearest-room-label is deterministic but needs careful tie-breaking; today vision does this |
| **Window vs door typing when not W/D-coded** | ◑ Needs judgement | Coded openings (W01…) are trivial; uncoded ones need vision/semantics |
| **Scanned / marked-up / non-standard plans** | ❌ Vision only | No text layer → OCR/vision fallback is mandatory |

**Clean vector wins (no model):** the two failing cases (garage, schedule head),
plus opening widths, window count, page classification.
**Still vision/spatial:** room association, uncoded type inference, and any
raster/scanned input.

---

## 6. Recommended architecture & scope (if built — not now)

**Home: extend the existing Python geometry engine** (`~/jennian-iq-geometry-api`,
FastAPI + PyMuPDF on :8000). It already opens the PDF, already knows the page
(post-Phase-3 it is pinned to the AI-classified floor-plan page via `?page=N`),
and already computes scale. Adding a positioned-dimension extractor there means
**one** PDF-parsing engine, not a second one in TypeScript. It would return,
alongside the geometry it already emits:

- positioned dim-pairs (`width`, `height`, `x`, `y`, raw text),
- labelled callouts (`W01…`, `GARAGE`, room names) with positions,
- the schedule table cells (row-banded),
- a `vector_text_available` / `scanned` flag (the §5 detector).

**TS pipeline change (later, separate phase):** prefer the vector value when
present and confident; fall back to the current vision read when the page is
scanned or the vector value is absent/ambiguous. Vision stays in place as
fallback + spatial associator — nothing is ripped out. This is additive and
low-risk: vector becomes the *source of truth for numbers*, vision the
*source of truth for layout/semantics and for scanned plans*.

**Effort shape (rough):** the extractor is a few hundred lines of deterministic
PyMuPDF (the spikes are the prototype). The genuine work is (1) the callout→room
spatial association rules and (2) the vector-vs-vision reconciliation/confidence
policy in TS — both deserve their own fix-brief with their own grading fixtures.

---

## 7. Generalisation caveats (honest limits)

- **Two templates is not proof.** Beddis (A-series) and Harrison (25xxx) are
  structurally different yet *both* expose the same clean vector layer — that is
  the strongest possible 2-sample signal, but Jennian has more templates and
  other builders differ. The dim-pair format (`H × W`, thousands commas, mm) and
  the schedule's row-band layout are template assumptions that **must be
  re-probed per template**, not hard-coded.
- **Thousands separators bit us once already.** The first spike's comma-blind
  regex (`\d{3,5}`) reported "4800 not present", which was wrong — the span is
  `2,150 x 4,800`. Any production extractor must be comma/space tolerant and
  should be driven by data, never by per-job numeric literals.
- **Head-datum value is template-specific** (2210 Beddis, 2150 Harrison). The
  *method* (separate by y-band / it's the repeated constant across openings) is
  template-independent; the *number* must never be a literal.
- **The aerial-inset page** (Harrison idx0, 0.32 raster) shows real plans mix
  raster and vector on one page — the scanned detector must be per-page and
  robust to partial images, not a whole-document yes/no.

---

## 8. Bottom line

The evidence is strong enough to recommend building vector-first numeric
extraction, as a **hybrid** that keeps vision for fallback and spatial reasoning:

- The two concrete failures this phase was asked to test against — the **2f
  head-over-read** and the **garage `2710` flake** — are **both deterministically
  recoverable from the vector layer on both templates**, with no model and no
  per-job literals.
- It is additive to the existing Python engine and the Phase-3 page-of-truth
  plumbing; it does not require ripping out the vision pipeline.
- It needs its own build phase, its own grading fixtures, and a per-template
  re-probe before any literal about format/datum is trusted.

**Verdict: (b) Hybrid, vector-first for numbers.** Not a clean win (vision is
still mandatory for scanned plans and layout/semantics), but a decisive win for
exactly the values the pipeline has been misreading.

---

### Appendix — reproducing the spikes (read-only, no model)

```
PYTHONIOENCODING=utf-8 python spike_vector_characterise.py   # Step 1: vector vs scan
PYTHONIOENCODING=utf-8 python spike_vector_dims.py           # Step 2: where the dims live
PYTHONIOENCODING=utf-8 python spike_vector_confirm.py        # Step 2/3: comma-aware + scale
```

`spike_vector_poc.py` is kept only to show the comma-blind false negative that
§6/§7 warn about. All four scripts are throwaway, import nothing from the app,
and mutate nothing. They are not part of the build.
