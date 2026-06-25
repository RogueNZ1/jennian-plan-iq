# Vision elevation detector — measured against signed truth (Task 4)

**Date:** 2026-06-25 · **Branch:** convergence · **Scope:** Fenner, O'Neil, 15a, Beddis (all four)

Diagnostic-only. Produced by `scripts/vision-elevation-measure.mts` (raw artifacts +
overlays in the gitignored `output/diagnostics/vision-elevation/`). The script lifts the
**shipped** `extract-elevations.ts` system prompt + Anthropic fetch verbatim (model
`claude-opus-4-5`, 1400px render = production parity) and scores its `elevationOpenings`
against signed truth. No production code, tolerance, or pricing path was touched.

Two passes:
- **Pass A (faithful):** the shipped prompt, unchanged — scored for recall.
- **Pass B (boxing contract):** shipped prompt + the council's "Next Move" contract — **one row
  per individual opening + a mandatory normalized bbox, no quantity grouping**. Overlay/eyeball only;
  never scored as production output.

## The question this answers

Is the opening gap a **wiring** problem (pricing runs on the blind vector detector while a capable
vision detector sits unused) or a **vision-reliability** problem (vision output is junk)?

## Scoreboard (Pass A — faithful recall)

| | Fenner | O'Neil | 15a | Beddis |
|---|---|---|---|---|
| Signed openings (truth) | 18 | 15 | 15 | 15 |
| **Vector** path (current pricing) | 44 junk, prices 2/17 | **sees nothing (`openings=0`)** | prices 4/15 | partial |
| **Vision** — count found | 18 | 17 | 15 | 16 |
| Vision — type mix vs truth | close | near-exact | all typed glazed | near-exact |
| Vision — garage anchor | ❌ **missed** | ✅ found | ❌ missed (Pass A) | ✅ found |
| Vision — **dim availability** | **0/18** | **0/17** | **0/15** | **0/16** |

## Boxing smoke test (Pass B — the council's "Next Move")

| | Fenner | O'Neil | 15a | Beddis |
|---|---|---|---|---|
| Openings boxed vs truth | 21 / 18 | 17 / 15 | 18 / 15 | 18 / 15 |
| Grouped rows that broke the one-row contract | 0 | 0 | 0 | 0 |
| bbox coverage | 100% | 100% | 100% | 100% |
| **Garage-door verdict** | ❌ **MISSED** (2 runs) | ✅ FOUND | ✅ FOUND | ✅ FOUND |
| Within-face bbox precision (eyeballed) | poor | fair | poor | poor |

**What the overlays show (eyeballed `*-overlay.png`):** the bbox coords are genuine (they cluster
into the correct sub-elevation region per face — not a render bug), so vision maps each opening to
the **right face**. But *within* a face the boxes are small and biased high (wall-top / eave / roofline),
not tight on the glazing. Vision also **over-counts by +2/+3** consistently (over-segmentation / the
odd non-opening). So Pass B confirms vision can emit a clean one-row-per-opening contract with 100%
bbox coverage, but the boxes are **not** measurement-grade.

## The answer (decision-tree read — stated, not acted on)

**Wiring problem, not a reliability wall — and the council's tightening is correct: vision *points*,
the deterministic machinery *proves*.**

1. **Vision reliably *finds* openings the vector path misses.** O'Neil is the proof: the vector
   detector sees `openings=0`, vision returns 17 vs 15 signed, all high-confidence, garage + slider +
   both doors typed correctly. The identity problem ("this is a real opening, on this face") that
   vectors can't solve, vision solves at the **face/count/type** level.
2. **Vision does *not measure*, and does *not box* precisely.** 0% dim-availability on all four jobs;
   bbox localisation is face-correct but pixel-loose. Measurement and boxing must stay with the
   deterministic geometry/scale path.
3. **The two paths are complementary, which is exactly why "vision proposes → geometry proves →
   ledger adjudicates" is the right shape.** Fenner's garage door — which vision **missed twice** — is
   precisely where the *deterministic* path is strong (the Fenner ledger already prices it via a unique
   garage-object anchor). O'Neil — where the vector path is blind — is where vision sees everything.
   Neither alone is sufficient; together they cover each other's blind spots.

So the validated architecture (per the council, agreed): **vision = candidate/evidence proposer only
(face, type, rough region, confidence); deterministic boxing + measurement + face proof = geometry;
ledger decides priceable / estimate_only / review_only; export reads only adjudicated proof.** A
vision candidate must **never** become a priced `Opening[]` without independent box + dims + face + row
proof. The contract change (one-row + bbox) is viable as the *evidence* feed; it is not a pricing path.

## Caveats / cautions (do not over-read)

- **Count recall is coarse, not a proven 1:1.** Truth has no position and vision returned no dims, so
  the counts mean vision found *about* the right number/mix per face — not zero-miss + zero-double-count.
  The +2/+3 Pass-B over-count is unadjudicated (could be panels/mullions read as openings).
- **Fenner garage-door miss is a real reliability gap** (typing + localisation), reproduced across two
  runs — the specific failure the council flagged. It does not sink the architecture (3/4 jobs found the
  garage; the deterministic path covers Fenner) but it proves vision cannot be a sole authority.
- **Garage typing is unstable** (15a: Pass A missed, Pass B found).
- **Run-to-run variance ≈ ±2** on counts. Single render, single page per job, 1400px.

## Reproduce

```
npx tsx --env-file=.env.local scripts/vision-elevation-measure.mts
```

Baseline anchors unchanged by this work: Fenner ledger still **2/17 / 17.73 m²**; four-job audit still
O'Neil vector `openings=0`.
