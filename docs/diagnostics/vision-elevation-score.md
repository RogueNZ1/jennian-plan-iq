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

---

# Addendum — vision-on-FLOORPLAN, scored to the council's tightened bar

**Date:** 2026-06-25 · Harness: `scripts/vision-floorplan-measure.mts` (imports the **shipped**
`extractAnnotations` verbatim + the **shipped** deterministic floor-witness detectors; 1400px render
= production parity). Scored not as "did vision produce openings?" but to Codex's five questions.
Diagnostic-only.

**2026-06-25 parser correction:** the original floorplan addendum under-scored O'Neil because the
diagnostic parser read spaced thousands such as `1 000x600` as `0x600` and `1 850x700` as `850x700`.
With the same cached raw annotations and the corrected parser, O'Neil rescored to **9** vision W/H
pairs, **8/15 (53%)** dimension recall, **6/8 (75%)** room attribution on matched rows, **8/9 (89%)**
precision, **7/17 (41%)** floor-vector confirmation, and **1** truth hit beyond deterministic witnesses.
That makes floor vision a useful corroborator, but still not the primary dimension/identity source.

## Four-job table

| job | truth | vision W×H pairs | (2) dim recall | (3) right room | (4) precision | room/run FPs | (1) confirms floor vectors | beyond witnesses |
|---|---|---|---|---|---|---|---|---|
| Fenner | 18 | 14 | 44% | 38% | 57% | 0 | 45% | 4 |
| O'Neil | 15 | 9 | **53%** | 75% | **89%** | 0 | 41% | 1 |
| 15a | 15 | 10 | 33% | 20% | 50% | 0 | 21% | 3 |
| Beddis | 15 | 8 | 27% | 75% | 50% | 0 | 30% | 1 |
| deterministic floor witnesses (for comparison) | — | — | — | — | — | — | Fenner 20 · **O'Neil 17** · 15a 14 · Beddis 10 | — |

## Verdict against the five questions (honest, not hyped)

1. **Agree with the floor vectors?** *Weak.* Vision re-confirms only **12–45%** of the deterministic
   floor witnesses. The deterministic floor path is the **stronger** witness on every job.
2. **Read printed H×W correctly?** *Yes when it reads — exactly* (median read error **0 mm**). But it
   only emits a W×H pair for a fraction of openings, so recall is **27–53%**.
3. **Right room?** *Weak.* **20–75%** (mostly wrong). Vision mis-attributes the room roughly half the
   time. (The first cut showed 13% — that was a harness artifact from greedy same-dim pairing; the
   set-based figure above is the honest one, and it is still weak.)
4. **Avoid room/run dimensions?** *Yes for the gross trap* — **0** room/run-scale false positives on
   all four jobs. But precision is still only **38–57%**: the false positives are opening-scale
   misreads / duplicates / phantoms, not room dims.
5. **Improve O'Neil/15a/Beddis without breaking Fenner?** **Partially.** O'Neil is no longer a floor-vision
   total failure after fixing the spaced-thousands parser (`1 000x600` now scores as `1000x600`, not
   `0x600`): cached raw annotations rescore to **8/15 (53%)**. But this still does not replace the
   deterministic floor witnesses or schedule reader: it confirms only **7/17** O'Neil floor witnesses,
   adds only **1** truth hit beyond those witnesses, and 15a/Beddis remain modest (33%/27%).

## What this means (it corrects the earlier optimism)

The instinct "use the floor plan to vector in" is **right about the floor, wrong about the tool.** The
dimensions + identity *do* live on the floor — but you get them from the **deterministic floor
witnesses** (printed window codes + physical opening widths) and the **joinery schedule sheet**
(`extract-window-schedule.ts`, the "authoritative window list"), **not** primarily from vision-on-floorplan.
Vision-on-floor at single-pass production resolution is a *thin corroborator* (a few finds beyond the
witnesses) — not the vectoring-in mechanism.

**Corrected division of labour (data-backed):**
- **Dimensions + identity → deterministic floor witnesses + joinery schedule.** (Strong; O'Neil 17 witnesses vs 9 vision pairs / 8 truth hits.)
- **Face + type → vision-on-elevation** (strong, esp. where the elevation is raster like O'Neil) **+ elevation vector where it exists** (Fenner).
- **Vision-on-floorplan → optional thin witness only; off the critical path.**
- The candidate-guided snapper should anchor on **floor witnesses + vision-elevation face**, NOT on vision-floor.

**One caveat / untested lever:** this is **single-pass, full-page at 1400px**. The production pipeline
already has crop-on-anomaly re-reads (`crop-localizer.ts`) precisely because full-page passes miss small
callouts — a zoomed/cropped re-read would likely lift recall. But even with better reading, O'Neil's
single-pass floor vision still trails deterministic witnesses, so the **schedule reader** remains the
right next probe there, not more floor-vision as the primary source.

## Reproduce
```
npx tsx --env-file=.env.local scripts/vision-floorplan-measure.mts
```
