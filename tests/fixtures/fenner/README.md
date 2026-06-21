# Fenner Wild-Card Concept Benchmark

Fenner exposed a different opening failure from Christian. Christian's missing rooms were
recoverable from the floor-plan text layer. Fenner's missing money is not that simple: the large
sliders and doors are visible on the floor plan/elevations, but several do not exist as clean `HxW`
text tokens in the floor-plan text layer.

## Fixture Inputs

The committed runnable input is:

```text
tests/doors/plans/fenner-floorplan.pdf
tests/doors/plans/fenner-elevations.pdf
```

The elevation fixture is text-poor but vector-rich. It deliberately proves the next slice is
face-banded vector/visual opening detection, not another floor-plan text-parser tweak.

## Truth

`ground-truth.json` records Haydon's manual pricing input from the spreadsheet screenshot. This is
signed witness evidence, not an infallible oracle, and must be compared against plan/elevation
evidence. It is the benchmark the engine must reach before Fenner can be considered priced correctly.

## Harness

`tests/fenner/baseline.test.ts`

Current gate shape:

- Green: the manual priced rows sum to the declared witness total, so the benchmark itself is not a
  loose screenshot note.
- Expected fail: deterministic floor-plan text routing still undercounts the exterior opening area.

The next real product slice is visual/elevation opening recovery for the large sliders, garage
windows, and entry/PA openings. Do not paper over this by blindly asserting standard dimensions.
