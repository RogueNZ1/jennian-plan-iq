# Vision elevation detector — measured against signed truth (Task 4)

**Date:** 2026-06-25 · **Branch:** convergence · **Scope:** Fenner + O'Neil (the two decisive jobs)

Diagnostic-only. Produced by `scripts/vision-elevation-measure.mts` (raw artifacts +
overlays in the gitignored `output/diagnostics/vision-elevation/`). The script lifts the
**shipped** `extract-elevations.ts` system prompt + Anthropic fetch verbatim (model
`claude-opus-4-5`, 1400px render = production parity) and scores its `elevationOpenings`
against the signed truth. No production code, tolerance, or pricing path was touched.

## The question this answers

Is the opening gap a **wiring** problem (pricing runs on the blind vector detector while a
capable vision detector sits unused) or a **vision-reliability** problem (vision output is junk)?

## Scoreboard

| | Fenner | O'Neil |
|---|---|---|
| Signed openings (truth) | 18 (glazed 16 / garage 1 / door 1) | 15 (glazed 12 / garage 1 / door 2) |
| **Vector** detector (current pricing path) | 44 junk candidates, prices 2/17 | **sees nothing — `openings=0`** |
| **Vision** detector — count found | **21** (glazed 19 / door 2) | **16** (glazed 13 / garage 1 / door 2) |
| Vision — type mix vs truth | close; garage **mis-typed as door** | **near-exact** (garage, slider, 2 doors all correct) |
| Vision — confidence | mostly *medium* | **all *high*** (one door *medium*) |
| Vision — garage-door anchor | ❌ missed (typed `external_door`, flag=false) | ✅ found & typed correctly |
| Vision — **dimension availability** | **0/21 carry W×H** | **0/16 carry W×H** |
| Vision — dimension recall (±150mm) | 0/18 | 0/15 |

## The answer (decision-tree read — stated, not acted on)

**It is a wiring problem, not a reliability wall — with one sharp refinement on the division of labour.**

1. **Vision reliably *finds* the openings the vector path misses.** On O'Neil — where the
   deterministic vector detector sees literally nothing — vision returns 16 detections vs 15
   signed, **all high-confidence**, with the garage door, slider, and both external doors typed
   correctly. That is the identity problem ("this is a real opening") the brief said vectors
   can't solve. Vision solves it. Fenner is noisier (21 vs 18, medium confidence, garage
   mis-typed) but still detects roughly the right count and mix.

2. **Vision does *not measure* them. At all. 0% dimension availability on both jobs.** The
   elevation image carries no printed W×H (those live on the floor plan / joinery schedule), and
   the shipped prompt correctly returns `null` rather than inventing numbers. So vision cannot
   hand you a priceable dimension, and asking it to is the wrong question.

So the validated architecture is **vision = find/identify (the proposer), geometry/scale =
measure, ledger = price only on agreement.** The rewire pairs vision's detections with the
existing geometry measurement (`elevation-vector-openings`, the scale/dim path) and the
`opening-face-map` ledger; it must **not** expect dims from vision. This is days of wiring, not
months of new capability — *provided measurement stays owned by geometry.*

## Caveats (do not over-read the count numbers)

- **Count recall is coarse, not a proven 1:1.** Truth has no position and vision returned no
  dims, so there is no hard key to prove each of the N signed openings is individually covered.
  "21 vs 18 / 16 vs 15" means vision found *about the right number and mix* — it does not prove
  zero misses + zero double-counts. A human must eyeball detections land on real openings.
- **Pass-B bbox localisation is rough.** The augmented bbox pass (overlay only, never scored)
  places boxes loosely — often on roof/wall, not tight on the opening (see
  `*-overlay.png`). Vision should not be trusted for precise localisation either; geometry must
  own localise + measure.
- **Run-to-run variance ≈ ±2.** Fenner gave 19 then 21 openings on two consecutive runs.
- **Fenner garage-door typing is a real defect** worth a prompt note: the opening was detected
  but classified `external_door`, and `garageDoorsPresent` came back false.
- Single render (1400px), single page, two jobs. 15a + Beddis not yet run.

## Reproduce

```
npx tsx --env-file=.env.local scripts/vision-elevation-measure.mts
```

Baseline anchors unchanged by this work: Fenner ledger still **2/17 / 17.73 m²**; four-job audit
still O'Neil vector `openings=0`.
