# Slice 2F-B.1 Representative Rerun Bbox Evidence Coverage Smoke

Date: 2026-06-28

Result: PASS WITH WARNINGS

## Scope

This smoke checked whether representative jobs expose extracted quantity ledger evidence with explicit page and bbox anchors suitable for ledger-backed overlay/correction work.

No detector work, pricing work, review write work, overlay work, AI prompt work, correction workflow work, or schema work was performed.

## Important Warning

No live production rerun was performed in this smoke. The production takeoff runner persists new run/ledger state, so rerunning representative jobs would have mutated live authority rows.

Instead, this smoke used:

- live active persisted authority where it already exists;
- read-only persisted run JSON where available;
- in-memory current `buildExtractedQuantityLedger` dry-runs against stored `takeoff_json` for older representative jobs.

This is enough to locate the bbox loss point, but it does not prove that a fresh production rerun currently creates runtime page+bbox anchors.

## Acceptance Result

PASS WITH WARNINGS.

The checked surfaces did not show authority drift, stale-run selection, guessed unknown dimensions, assumed-height promotion, or legacy evidence being treated as active anchors.

However, no representative active or dry-run ledger row produced page+bbox evidence or runtime overlay anchors. The diagnostic loss point is consistently:

`A. source evidence never had bbox`

The current ledger projection dry-run also emits no bbox, so Slice 2F-C should target source/projection bbox enrichment rather than persistence, read model, or overlay plumbing.

## Jobs Checked

| Job | Role | RunId | Authority source | Ledger rows | Status counts | Page+bbox rows | Runtime anchors | Diagnostic |
| --- | --- | --- | --- | ---: | --- | ---: | ---: | --- |
| JM-0060 / go / Fenner | sentinel active persisted ledger | `4ba50d23-5764-41e4-bda5-0fdace588a6c` | `persisted_current_run` | 67 | extracted 4, needs_review 18, missing_evidence 30, conflict 15 | 0 | 0 | A |
| JM-0052 / Fenner / TBC | Fenner authority/evidence check | `5c9413e0-f4e8-4ec5-8975-1c7ef442852a` | `unavailable_requires_rerun` | 0 active, 4 dry-run | dry-run extracted evidence only, no bbox | 0 | 0 | A |
| JM-0020 / full run / 001 | older exported job dry-run | `100f718c-5bb3-436b-a6ee-7b4405c67ae5` | `unavailable_requires_rerun` | 0 active, 1 dry-run | dry-run extracted evidence only, no bbox | 0 | 0 | A |
| JM-0005 / Beddis / Smoke Test | older representative dry-run | `e8d2026d-fa18-445f-aa0b-899c55bf7423` | `unavailable_requires_rerun` | 0 active, 1 dry-run | dry-run extracted evidence only, no bbox | 0 | 0 | A |
| JM-0059 / Fenner / AI Run through | visual_opening_audit representative | `807a52fb-10e1-463a-84b9-73d38dcdf8cb` | `unavailable_requires_rerun` | 0 active, 66 dry-run | dry-run evidence text present, no bbox | 0 | 0 | A |
| JM-0058 / AI first Run / AI run | vector/door geometry representative | `46000acd-360d-4591-87cd-89d2c40740cb` | `unavailable_requires_rerun` | 0 active, 47 dry-run | dry-run evidence text present, no bbox | 0 | 0 | A |

## JM-0060 Sentinel Detail

JM-0060 has an active persisted extracted quantity ledger:

- jobId: `2d10ae44-f65a-4047-8d84-20bd345f84a1`
- runId: `4ba50d23-5764-41e4-bda5-0fdace588a6c`
- authority source: `persisted_current_run`
- ledger rows: 67
- statuses:
  - extracted: 4
  - needs_review: 18
  - missing_evidence: 30
  - conflict: 15
  - ignored: 0
- categories:
  - exterior_perimeter: 1
  - interior_door: 3
  - window/opening: 58
  - exterior_door: 3
  - garage_door: 2
  - other: 0

Evidence coverage:

- rows with any evidence: 67
- rows with evidence text: 67
- rows with evidence page: 0
- rows with evidence bbox: 0
- rows with page+bbox: 0

Overlay coverage:

- runtime anchors: 0
- unmarked ledger rows: 67
- legacy door/evidence hits: 20
- legacy visual_opening_audit hits: 20
- legacy evidence labelled/quarantined: true

Safety checks:

- no mixed runIds selected: true
- no stale rows selected: true
- no legacy marker used as active anchor: true
- assumed-height rejected rows not promoted: true
- unknown dimensions not guessed: true

The dry-run projection from the same stored takeoff JSON also produced 67 rows with zero page/bbox rows, confirming loss point A rather than persistence/read-model loss.

## Representative Evidence Coverage

All representative jobs had zero page+bbox extracted quantity rows.

Jobs with legacy opening/evidence structures, including visual and vector/door geometry representatives, still did not produce active ledger bbox anchors in the current projection:

- JM-0059 contained visual_opening_audit-style legacy evidence, but dry-run ledger rows had no page/bbox.
- JM-0058 contained vector/door geometry-style legacy evidence, but dry-run ledger rows had no page/bbox.
- JM-0052/Fenner had legacy visual evidence paths visible to overlay diagnostics, but no active extracted quantity authority rows with page/bbox.

This means the immediate blocker is not that overlay cannot consume ledger anchors. The blocker is that representative source evidence is not yet providing stable page+bbox evidence into ledger rows.

## Diagnostic Loss Points

Observed diagnostic result for every checked job:

`A. source evidence never had bbox`

No evidence was found for:

- B: source evidence had bbox but ledger projection dropped it;
- C: ledger row had bbox but persistence dropped it;
- D: persisted row had bbox but read model dropped it;
- E: read model had bbox but overlay failed.

The synthetic Slice 2F-B test already proves the downstream overlay/read-model path can consume ledger anchors when rows have visual anchor data. This smoke shows real representative data is not yet supplying those anchors.

## Safety

No smoke result showed:

- mixed runIds silently selected;
- stale extracted_quantity_rows selected as active authority;
- legacy Windows & Doors / opening_schedule markers used as active authority anchors;
- assumed-height rows promoted into clean extracted area;
- unknown dimensions guessed into values.

## Recommendation For Slice 2F-C

Proceed with a source/projection bbox enrichment design or narrow implementation slice.

Do not treat 2F-C as a persistence/read-model/overlay fix unless a new fresh-run smoke later proves a different loss point.

Recommended order:

1. Decide which current-run source is allowed to create page+bbox evidence first.
2. Prefer deterministic/vector/PDF-text derived anchors before legacy visual matching.
3. Preserve the active-run authority rule: page+bbox anchors must belong to the same active extracted quantity row/run.
4. Keep legacy visual/opening_schedule evidence labelled or quarantined until it can be safely attached to active ledger rows.
5. Add a rerun-safe smoke after enrichment to prove at least one representative job emits active extracted quantity rows with page+bbox anchors.

## Not Changed

This slice did not change:

- detectors;
- Fenner extraction logic;
- pricing gates or QS workbook behaviour;
- review write paths;
- overlay behaviour;
- verification behaviour;
- AI prompts;
- correction memory;
- schema;
- persistence.
