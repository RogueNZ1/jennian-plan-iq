# Jennian IQ Golden Job Index

Last verified: 21 Jun 2026

This is the working index for the first repeatable Jennian IQ accuracy gates. Raw plans and QS workbooks stay in the controlled Jennian SharePoint/OneDrive sync. The repo records reduced truth JSON, test-safe fixtures, source paths, hashes, and the current truth status.

## Operating Rules

- Do not claim a job is pricing-accurate until its truth rows are signed by Haydon or another nominated QS.
- Treat historic IQ exports as evidence of failure or progress, not as answer keys.
- A physical floor-plan wall gap is real width evidence.
- Text on the floor plan, schedule, or elevation is a witness, not gospel.
- Elevation/vector height can support a floor-plan gap only when identity is unique enough to avoid borrowing height from the wrong opening.
- Malformed or contradictory evidence quarantines that candidate; it should not condemn every other supported opening.
- Aggregate money fields must stay blank/fail-closed when candidate coverage is incomplete.

## Live App Access

Production app access is confirmed through the internal operator account `test@jennian-iq.internal`. On 21 Jun 2026, Codex authenticated to `https://www.jennianiq.nz/jobs` and verified Jobs, Upload Plan, user menu, and recent JM-0052 through JM-0056 runs were visible.

Do not record the password in Git, Linear, SharePoint notes, or STATE.md. Do not reset this account casually because reset scripts can change the role or permission state.

## Canonical QS Master

Confirmed by Haydon on 21 Jun 2026:

`C:\Users\Haydon\Jennian Homes Manawatu\Company - Documents\QUANTITY SURVEYING\Jennian IQ\Jennian IQ MASTER.xlsm`

The same file also exists at:

`C:\Users\Haydon\Jennian Homes Manawatu\Company - Documents\QUANTITY SURVEYING\JENNIAN MASTER SPREADSHEET\Jennian IQ MASTER.xlsm`

Both copies are byte-identical:

| File | Last write | Size | SHA-256 |
| --- | --- | ---: | --- |
| `Jennian IQ MASTER.xlsm` | 2026-06-17 14:02:27 | 1,348,665 | `84D45808AFD75D3BC816DC768350BF087C1A2F77EFC07255CD07976720135D63` |

Workbook structure checked read-only: `IQ Import` and `5. Data Input House ` are present. This is the canonical master workbook IQ exports must obey until Haydon explicitly supersedes it.

## Fenner

Status: signed manual opening truth exists for the current opening-pricing gap. Fenner remains an expected-fail until deterministic extraction recovers the supported opening set without blind assertions.

Controlled source files:

| Purpose | Path | Last write | Size | SHA-256 |
| --- | --- | --- | ---: | --- |
| Floor plan | `C:\Users\Haydon\Jennian Homes Manawatu\Company - Documents\QUANTITY SURVEYING\Jennian IQ\Fenner, Natalie & Marcus - Section TBC\01 SALES\04 Draft Plans\2026.06.17 FLOORPLAN.pdf` | 2026-06-17 13:33:44 | 457,489 | `C2210AFEA3DC41B68128AFC78DA606483BAEE5DA366454C35E1B5D5EE039DB09` |
| Elevations | `C:\Users\Haydon\Jennian Homes Manawatu\Company - Documents\QUANTITY SURVEYING\Jennian IQ\Fenner, Natalie & Marcus - Section TBC\01 SALES\04 Draft Plans\2026.06.17 ELEVATIONS.pdf` | 2026-06-17 13:43:08 | 184,842 | `AABE26902CA8129E61FB25E9ACA57B3F3DAC2A6EA38EEAC7FF679C06EC41B3D1` |
| Haydon QS workbook | `C:\Users\Haydon\Jennian Homes Manawatu\Company - Documents\QUANTITY SURVEYING\Jennian IQ\Fenner, Natalie & Marcus - Section TBC\01 SALES\02 Preliminary Estimate\Fenner Specifications.xlsm` | 2026-06-18 07:48:45 | 1,349,284 | `536AA0D580FD7D8E285E28855EAEDAB4ACAA16FDDDCDA204C634CAED45359F4E` |
| Reduced truth JSON | `tests/fixtures/fenner/ground-truth.json` | 2026-06-20 12:50:21 | 2,521 | `DBB71D1F92EA0DC2410621161BA8FE2463FD8AE84806A29009E6220800EFA59F` |

Read-only QS cells verified from `Fenner Specifications.xlsm`, sheet `5. Data Input House `:

| Cell | Meaning | Value/formula |
| --- | --- | --- |
| `G73` | total opening sqm | `58.13` / `=SUM(G41:G72)` |
| `G67` | garage door sqm | `10.08` / `=D67*E67*F67` |
| `G68` | second garage door sqm | `0` / `=D68*E68*F68` |
| `G75` | garage-door-excluded opening sqm | `48.05` / `=G73-G67-G68` |
| `D21` | wall area after openings | `155.71` / `=(D19*D20)-G73` |

Current test map:

- `tests/fixtures/fenner/ground-truth.json` pins Haydon's manual rows: 17 rows, 18 quantity, 58.13 m2 total openings, 10.08 m2 garage door, 48.05 m2 garage-door-excluded.
- `tests/fenner/baseline.test.ts` pins the manual rows, malformed drafting label detection, review-only floor-plan gaps, vector-rich/text-poor elevations, and the expected-fail for full priced opening recovery.
- `tests/takeoff/elevation-gap-match.test.ts` pins face-aware elevation matching so a wrong elevation face cannot support a floor-plan gap.

Next required product slice:

Candidate-level reconciliation must price supported Fenner candidates and quarantine only unsupported candidates. The expected-fail should turn green only when deterministic evidence recovers the signed 58.13 m2 / 48.05 m2 truth without blind standard-height assertions.

## Beddis

Status: signed QS truth exists and the live baseline currently passes, but the money tolerance is broad enough to hide a local opening-area miss. Treat Beddis as a useful recovery rail, not proof that opening identity is solved.

Controlled repo fixtures:

| Purpose | Path | Size | SHA-256 |
| --- | --- | ---: | --- |
| Prelim plan set | `tests/fixtures/beddis/prelim.pdf` | 3,584,063 | `047CE95A5B711DB51F09824E8C22582D55DCC22BFC6C5930D02B6AAB8DD0B1BF` |
| Concept floorplan | `tests/fixtures/beddis/concept-floorplan.pdf` | 434,493 | `7F680304C4371B4DFC50B16CE9FB0042A31939AC97EC0F610256E55CAB57BFC6` |
| QS workbook fixture | `tests/fixtures/beddis/Beddis_QS.xlsm` | 1,326,451 | `22D7E899052502C8AB84899B81BF47A6A3DBF858BE70D4EF3B42E9F9ED57FDF1` |
| Reduced truth JSON | `tests/fixtures/beddis/ground-truth.json` | 4,525 | `4A116A8126CEDAD59466B029D9149EA2206DF0FA71064EF0090EB651EAB46202` |

Live run on 21 Jun 2026 using production geometry:

| Field | IQ output | Signed truth | Delta |
| --- | ---: | ---: | ---: |
| Total opening sqm | 44.33 | 43.92 | +0.41 |
| Glazed sqm | 34.25 | 33.84 | +0.41 |
| External wall area m2 | 108.79 | 109.20 | -0.41 |

Current test map:

- `tests/beddis/baseline.test.ts` verifies schedule-path height recovery, garage size, field provenance, and broad aggregate money gates.
- The broad aggregate tolerance (`toBeCloseTo(..., 0)`) should not be tightened until the row identity/recovery path is corrected; otherwise it will fail for the right reason but without telling the operator which candidate is wrong.

Next required product slice:

Tighten Beddis from aggregate-near to candidate-correct: recover the signed local opening rows, then reduce the money tolerance so a 0.41 m2 overage cannot masquerade as green.

## Harrison

Status: signed QS truth exists and the strict live money gate is currently red. This is the cleanest current proof that no-schedule opening extraction is still too text-led and not yet human-QS-correct.

Controlled repo fixtures:

| Purpose | Path | Size | SHA-256 |
| --- | --- | ---: | --- |
| Concept plan set | `tests/fixtures/harrison/concept.pdf` | 1,873,288 | `56F19E9455001B67EF215D59CD8B17C1C4BE5D5A9F3BA9F5FAD394FE03C7CFFC` |
| Reduced truth JSON | `tests/fixtures/harrison/ground-truth.json` | 8,759 | `FE247AD16349A3EA2279B424224864D212F83828AD55C9DDB63A877A4FB43473` |

Live run on 21 Jun 2026 using production geometry:

| Field | IQ output | Signed truth | Delta |
| --- | ---: | ---: | ---: |
| Total opening sqm | 46.78 | 46.89 | -0.11 |
| Glazed sqm | 36.70 | 36.81 | -0.11 |
| External wall area m2 | 98.18 | 98.07 | +0.11 |

Current observed failure:

- `tests/harrison/baseline.test.ts` fails at the strict total-opening assertion (`46.78` vs `46.89`, tolerance 0.05).
- The no-schedule path prices floor-plan text evidence that does not align candidate-by-candidate with the QS answer key: several `2.15m` datum-ish heights remain priceable, two anonymous dimension pairs enter the priced set, and room routing collapses many rows to `ENS` / `GD`.
- Garage size is now correctly `4.8x2.1` with the `garage_door_width` reconciliation flag preserved.

Next required product slice:

Keep Harrison red until candidate identity is fixed. The engine must distinguish real W-code/opening rows from anonymous or datum/title artefacts, then reconcile the priced set to the signed QS rows by candidate evidence rather than by aggregate closeness.

## Christian / Awa Park

Status: high-value repeated regression benchmark, not yet signed pricing truth. Christian currently proves parser/routing behavior, not final QS money accuracy.

Controlled source files:

| Purpose | Path | Last write | Size | SHA-256 |
| --- | --- | --- | ---: | --- |
| Full plan set | `C:\Users\Haydon\Jennian Homes Manawatu\Company - Documents\QUANTITY SURVEYING\Jennian IQ\25040 Christian, Blair - Lot 33 Awa Park, Feilding\03 PLANS\01 Preliminary Plans\2567 - Jen - Christian - Lot 33 Awa Park - A3 Plans V3.pdf` | 2026-03-03 16:03:04 | 34,594,868 | `F4DC4A7C9D7F381ED1852ED08935F4C93D0562BD14A83437B23D0AC686BD181A` |
| Historic QS workbook | `C:\Users\Haydon\Jennian Homes Manawatu\Company - Documents\QUANTITY SURVEYING\Jennian IQ\25040 Christian, Blair - Lot 33 Awa Park, Feilding\04 QS\Awa Park Corner Lot EST.xlsm` | 2026-05-04 14:19:58 | 2,100,809 | `FFFED92CA767C0C10342EFC6D9E05FB5882B56D92A70147D68527D32A9EBCD85` |
| Reduced truth JSON | `tests/fixtures/christian/ground-truth.json` | 2026-06-20 12:50:21 | 3,167 | `9AC3491AC818545CA58412427E483BF1ECFF725C21AF24619E2BEB901BE4685B` |

Current test map:

- `tests/fixtures/christian/ground-truth.json` records historic IQ output failures and parser expectations. It is not a signed QS answer key.
- `tests/christian/baseline.test.ts` pins printed joinery-code extraction, title-case room footprint recovery, and routing onto real room anchors.
- Existing source fixtures include `tests/fixtures/christian/floorplan-page6.pdf` and `tests/fixtures/christian/window-schedule-page25.pdf`.

Next required evidence step:

Haydon signs the Christian QS opening rows against the actual workbook or nominates a newer IQ-era Christian workbook. Once signed, add money assertions for opening area, garage area, alfresco, and export cells. Until then, Christian remains a regression rail rather than a shippable pricing truth gate.

## Open Access / Evidence Gaps

- Read-only Supabase/schema/job inspection access is still missing. This blocks live persisted-data audits without service-role paths.
- Christian signed QS truth is still pending.
- Fenner has signed opening truth, but the engine still needs candidate-level reconciliation to recover it.
