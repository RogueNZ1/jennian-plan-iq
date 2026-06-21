# Harrison (Lot 9) — validation fixture #2

Second permanent ground-truth set, alongside Beddis. **Every fix must pass BOTH.**

- **Evidence pack:** `ground-truth.json` (committed) records the signed `Harrison_QS.xlsm`
  pricing witness plus the reviewed joinery bench. The QS workbook is not treated as
  infallible: the plan set remains drawing evidence, and any plan-vs-QS contradiction must
  be surfaced with provenance rather than forced to silently match either side.
- **Harness:** `tests/harrison/baseline.test.ts`, gated on `HARRISON_LIVE=1`.

## What Harrison adds over Beddis

1. **No separate window-schedule page** — windows are floor-plan callouts W01–W14, so this is the
   real test of the no-schedule fallback path (`aggregateWindows(null, …)` → `source: "floor_plan_callouts"`).
2. **Newer Jennian drawing template** (project 25191, A101–A302) — tests page-classification +
   extraction generalisation beyond the one Beddis template.
3. **Garage door 2150×4800** (Beddis was 2210×4800) — exercises the tolerant 2.0–2.4 m height band.
4. **Derived ext-wall-area** `60.4 × 2.4 − 46.89 = 98.07` generalises (Beddis: 109.2).

## Source files to drop in (gitignored — never committed)

The PDFs/workbook are sensitive client data + large binaries. Place them here locally:

```
tests/fixtures/harrison/
  concept.pdf          ← Lot_9_Kiwitea_CONCEPT_rev_4.pdf  (6-page, PRIMARY drawing evidence)
  Harrison_QS.xlsm     ← the signed-off QS pricing witness
  floorplan-0812.pdf   ← ..._Floorplan_08_12_25.pdf  (earlier rev, SECONDARY, report-only)
```

## Producing the renders + page text (same as Beddis, via poppler)

Mirrors production `renderPageForAnalysis`: one page → 1400px-wide JPEG → AI.

```bash
cd tests/fixtures/harrison
# 6 page images: concept-1.jpg … concept-6.jpg
pdftoppm -jpeg -r 150 -scale-to-x 1400 -scale-to-y -1 concept.pdf _render/concept
# 6 page-text layers: concept-1.txt … concept-6.txt
for n in 1 2 3 4 5 6; do
  pdftotext -layout -f $n -l $n concept.pdf _pagetext/concept-$n.txt
done
```

(`_render/` and `_pagetext/` are gitignored.)

## Running the baseline

```bash
HARRISON_LIVE=1 GEOMETRY_BASE=http://localhost:8000 npx vitest run tests/harrison/baseline.test.ts
```

Writes `_render/baseline-results.json` and prints `HARRISON_RESULTS=…` for comparison against
the signed QS witness and reviewed joinery bench in `ground-truth.json`.
