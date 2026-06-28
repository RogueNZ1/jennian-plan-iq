# Slice 2F-D.1 Controlled Fresh-Run Anchor Validation

Date: 2026-06-28

Result: PASS WITH WARNINGS

## Scope

This was a read-only/smoke-first validation of whether the Slice 2F-D floor-plan gap page+bbox source produces extracted quantity runtime visual anchors on real plan processing.

No production rerun was performed. No production authority rows were mutated. Validation used local fresh runs against committed real PDF fixtures plus a read-only production authority check for JM-0060.

## Summary

Floor-plan gap bbox works on local fresh real-plan runs.

The source emits page+bbox, the opening evidence ledger preserves it, extracted quantity evidence preserves it, and the existing overlay read model derives runtime visual anchors from it.

JM-0060 remains unanchored because the checked production rows are persisted pre-2F-D authority rows. The fresh floor-plan gap source did not run for that read-only check.

## Runs Checked

| Job reference                            | JobId                                  | Run mode                                 | RunId                                  | Ledger rows | Floor-plan gap candidates | Gap candidates with page | Gap candidates with bbox | OpeningEvidenceItem page+bbox | ExtractedQuantity page+bbox | Runtime anchors | Unmarked rows | Anchor categories | Anchor statuses  | Loss point |
| ---------------------------------------- | -------------------------------------- | ---------------------------------------- | -------------------------------------- | ----------: | ------------------------: | -----------------------: | -----------------------: | ----------------------------: | --------------------------: | --------------: | ------------: | ----------------- | ---------------- | ---------- |
| `tests/fixtures/beddis/prelim.pdf` p3    | `beddis-prelim-p3`                     | local rerun                              | none                                   |          29 |                        10 |                       10 |                       10 |                            10 |                          10 |              10 |            19 | opening           | missing_evidence | none       |
| `tests/fixtures/harrison/concept.pdf` p5 | `harrison-concept-p5`                  | local rerun                              | none                                   |           9 |                         8 |                        8 |                        8 |                             8 |                           8 |               8 |             1 | opening           | missing_evidence | none       |
| `tests/fixtures/oneil/floorplan.pdf` p1  | `oneil-floorplan-p1`                   | local rerun                              | none                                   |          38 |                        26 |                       26 |                       26 |                            26 |                          26 |              26 |            12 | opening           | missing_evidence | none       |
| `tests/fixtures/15a/floorplan.pdf` p1    | `15a-floorplan-p1`                     | local rerun                              | none                                   |          55 |                        40 |                       40 |                       40 |                            40 |                          40 |              40 |            15 | opening           | missing_evidence | none       |
| JM-0060 / go / Fenner                    | `2d10ae44-f65a-4047-8d84-20bd345f84a1` | read-only persisted production authority | `4ba50d23-5764-41e4-bda5-0fdace588a6c` |          67 |                       n/a |                      n/a |                      n/a |                           n/a |                           0 |               0 |            67 | none              | none             | A          |

## Diagnostics

Local fresh runs:

- floor-plan gap source ran;
- floor-plan gap candidates were found;
- every detected floor-plan gap candidate carried page+bbox;
- `OpeningEvidenceItem` retained page+bbox;
- `ExtractedQuantity.evidence` retained page+bbox;
- runtime overlay derived anchors;
- no propagation loss was observed.

JM-0060:

- Loss point: A. floor-plan gap source did not run in this validation because the check used read-only persisted production authority rows created before Slice 2F-D.
- Persisted rows: 67.
- Rows with page+bbox: 0.
- Runtime anchors: 0.
- Unmarked rows: 67.

## Safety

Across the local fresh runs and the JM-0060 read-only authority check:

- bbox did not change extraction status;
- bbox did not fill unknown dimensions;
- bbox did not alter clean totals;
- assumed-height rows were not promoted;
- no legacy visual source was used as active anchor;
- no `door_hits` matching was used;
- no `opening_schedule` matching was used;
- no production runId authority was mixed or mutated.

The anchors produced in local fresh runs were all:

- category: `opening`;
- status: `missing_evidence`.

This is expected: the anchor identifies the measured floor-plan gap location, but missing height/type evidence still keeps those rows out of clean totals.

## Answer

Classification: A with production caveat.

Floor-plan gap bbox works on real local current processing runs. It is not just a synthetic fixture path.

JM-0060 remains unanchored because it was not rerun and its active persisted authority rows predate floor-plan gap page+bbox emission.

## Next Decision

Recommended next slice:

2F-E - audit/select next safe higher-yield bbox source, or run a deliberately accepted controlled production/staging rerun if product wants persisted production anchor proof.

Reason:

Floor-plan gap anchors work, but they currently anchor review/missing-evidence gap rows. They do not yet give high-yield anchors for clean extracted windows/doors. Higher-yield candidates should be audited next:

- PDF text/code locations, if true text bboxes are available;
- floor-plan symbol geometry directly tied to ledger rows;
- deterministic/vector geometry already attached to row projection;
- current-run visual detection only if directly attached to the ledger row, not matched from legacy markers.

Do not use legacy visual_opening_audit, door_hits, or opening_schedule as active anchors.
