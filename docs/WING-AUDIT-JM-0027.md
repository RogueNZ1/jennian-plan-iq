# WING-PLAN AUDIT — JM-0027 (12 Jun 2026)

First live test on an articulated wing design (two wings at 45° off an orthogonal
central body). Ran on production build `3f6a15f` (all six prior fixes present,
live-validated 10/10 same morning — this is a capability gap, NOT a regression).

**Privacy rule for this work: repo is public. No client plan PDFs, no client
surnames in fixtures, tests, or commits. Job code only (JM-0027). Plan PDFs for
benching go in a private Supabase storage bucket (see P0), never in-repo.**

---

## 1. Outcome summary

| Metric | IQ output | Ground truth (visual audit of plan) | Verdict |
|---|---|---|---|
| Floor area | 199 m² | 199 m² (over frame) | PASS |
| Alfresco/porch | 1.1 m² | 1.1 m² | PASS |
| External wall / perimeter | 80 lm | 80 m (stat block) | PASS |
| Stud height | 2400 mm | TBC from elevations | UNVERIFIED |
| Garage area | blank | 36 m² (6.0 × 6.0) | FAIL |
| Windows total | 6 | 11 confirmed (up to 13, see §3) | FAIL |
| Ensuite windows | 2 @ 1.52 × 2.01 | 1 @ 1.2 × 0.9 | **FAIL — fabricated** (read WIW room dims 1 500 X 2 010 as window sizes) |
| Bed 4 window | 1 @ 1.35 × 0.9 | 1 @ 1.35 × 1.8 | FAIL (width blended with nearby 1200x900 token) |
| Garage window | 1 @ 0.6 × 0.6 | 1 @ 0.6 × 2.5 | FAIL |
| Bed 2 / Bed 3 / Bath / Kitchen windows | 0 | 1 / ≥1 / 2 / 1 | FAIL (right wing + bath + kitchen blind) |
| Garage vehicle door | blank | 4 800 on 45° wall | FAIL |
| External glazed doors | none reported | 3600 stacker + 2000 slider ×2 + entry + 1030 garage PA door | FAIL (no category exists) |
| Interior doors (deterministic) | nothing (flagged) | ~11 (9× 810, 1× 760, 1× 860) | ENGINE BLIND — honest flag fired, vision fallback said ~8 |
| Roofing coverage | 228.85 m² (Data Input House) / blank (IQ Import roof row) | footprint 203.1 m², 25° longrun — derivation unverified | INCONSISTENT |
| Cladding net | 173.21 m² | wrong by construction: opening set wrong (incl. phantom 6.11 m² ens), gables assumed 0 (front elevation shows gable features), no brick / vertical-oblique split | FAIL (flags fired correctly) |
| Room coverage | fixed template | MEDIA (2 windows!), SCULLERY, WIW, LAUNDRY have no rows | STRUCTURAL GAP |
| End-of-run visual | none shown | — | trace collapsed → openings preview ~empty; see P6 |

Honesty layer verdict: flags (internal doors, gables, cladding type) fired
correctly. The ensuite row is the exception that matters most — confident wrong
data, unflagged, flowed into the QS workbook (row 43, 6.11 m² phantom opening
area subtracting from cladding).

## 2. Root cause

`src/lib/doors/door-engine.ts` (and the trace it feeds) models the world as
**vertical-or-horizontal**: `WidthLabel.vertical: boolean`, and the
interior/exterior test ray-casts strictly E/W or N/S
(`crossingsH`/`crossingsV`, see ~lines 180–290). Wings at 45° produce rotated
dimension text and diagonal wall segments — both invisible to this model →
deterministic layer collapsed to zero (honestly). Vision partially covered the
left wing but (a) misread room-dimension text as window sizes and (b) also
missed orthogonal rooms (kitchen, bath), so the angled composition degraded the
vision pass globally, not just in the wings.

Cheap discriminator discovered during audit: on these drawings, **room dims are
formatted `1 500 X 2 010` (spaced, capital X); window/opening tokens are
`600x1 500` (lowercase x, no space before x)**. The ensuite fabrication is
mechanically detectable.

## 3. Ground truth — JM-0027 (machine copy in `tests/bench/fixtures/jm-0027-expected.json`)

Stat block: foundation 202 m², frame 199 m², porch 1.1 m², coverage 203.1 m²,
perimeter 80 m. Garage 6.0 × 6.0. Roof 25° longrun. Dual cladding: brick +
vertical oblique. Gable features on front elevation.

Windows (HxW mm): master 600x1500 · ensuite 1200x900 · kitchen 1100x1500 ·
bed4 1350x1800 · media 1800x900 ×2 · bath 1100x1500 + 1100x600 ·
bed2 1350x1800 · bed3 ≥1 (size label unresolved — **ASK HC / QS**) ·
garage 600x2500. Confirmed 11; possible laundry 1100 (**ASK HC**) → up to 13.

External doors: dining stacker 3600 · sliders 2000 ×2 (master NE; living/right
junction) · front entry (porch) · garage PA door 1030 · garage vehicle door 4800.

Interior doors ~11: 810 ×9 · 760 ×1 (bath) · 860 ×1 (rear kitchen — likely
cavity, TBC). Vision said ~8.

Open questions for HC: ~~(1) spec provenance~~ **RESOLVED 12 Jun: HC filled the
spec page during both test runs — B101–116 selections are real user input,
correctly coded on JM-0027 and JM-0029. Spec contract v2 pipeline confirmed
working end-to-end on new jobs. NOT a finding.**
(2) bed3 window size. (3) laundry window yes/no.

## 4. Rebuild plan (priority order)

- **P0 — Regression harness.** This file + expected.json land first. Private
  fixtures: `bench-fixtures` Supabase storage bucket, pulled by live-validate
  via existing service creds; plan PDFs never in-repo. Door bench goes n=1 → n≥2
  with JM-0027 as a known-fail until P2 lands.
- **P1 — Rotation-aware labels.** pdf.js text items carry a transform matrix;
  derive label orientation angle θ from it. Replace `vertical: boolean` with θ
  (keep boolean as derived view for orthogonal fast path).
- **P2 — Rotation-aware walls + ray-cast.** Wall segments at arbitrary angle;
  interior/exterior test casts along the label normal (±n̂) with generic
  segment-intersection crossings instead of crossingsH/V.
- **P3 — Rooms.** Dynamic room list from plan labels (MEDIA, SCULLERY, WIW,
  LAUNDRY…) replacing the fixed template; rotated room polygons for
  opening→room assignment. QS-side: template rows stay fixed; unmapped rooms
  spill to the existing per-room overflow rows.
- **P4 — Vision guards.** Reject any window whose dims match a room-label
  dimension within tolerance; require window dims to come from
  `NNNxN NNN`-format tokens (lowercase-x rule above); openings must sit on a
  traced wall or they flag, never silently fill a row.
- **P5 — Categories.** External glazed doors (stackers/sliders w/ direction
  arrows), garage PA doors, garage vehicle doors on non-orthogonal walls;
  garage area extraction.
- **P6 — Verification overlay** (concept mock approved by HC 11 Jun): plan
  render + per-layer highlighter overlay + counts panel mirroring IQ Import +
  flag-resolve-approve flow. Today's failure is the business case — it would
  have surfaced in ~10 s.

Also queued: roof-area cross-sheet mapping (Data Input House vs IQ Import);
export timestamp uses UTC, cover sheet shows NZ date — stamp NZT; sweep
existing test names for client surnames (public repo).

## 5. Demo note (12 Jun)

None of this blocks or touches the head-office demo: prod frozen at `3f6a15f`
(tag `v5.5-headoffice-baseline`), JM-0020 live-validated 10/10 at 07:30 NZT.
This branch is inert: no CI triggers, no deploy surface.

## 6. P6 LOCKED AS THE PRODUCT (HC directive, 12 Jun afternoon)

The verification overlay page IS the trust product. **Acceptance criterion:
no takeoff completes without its verification page — it prints/attaches to
every single job and to the QS export.** Pipeline gate, not optional view.

De-risked same day — working proofs in `poc/`:
- `p1-label-positions.py`: all opening/door label coordinates from the text
  layer, rotated wing text included. Port to pdf.js getTextContent transforms.
- `p2-wall-trace.py`: internal walls 57 lm net / 66 gross measured from wall
  ribbon fills; external trace 78.8 vs stated 80.0 (Δ1.5%) — self-validating.
  Port to the geometry worker.

Owner-verification loop demonstrated live (3 rounds on JM-0027: media
windows → barn reclass → barn relocated to the 1500 openings). P6 must
persist these corrections per job (barn sliders fill B30 on every re-export).
P5 adds symbol-level barn/cavity recognition later; never label-guess.
