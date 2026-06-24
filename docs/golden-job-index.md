# Jennian IQ Golden Job Index

Last verified: 21 Jun 2026

This is the working index for the first repeatable Jennian IQ accuracy gates. Raw plans and QS workbooks stay in the controlled Jennian SharePoint/OneDrive sync. The repo records reduced evidence JSON, test-safe fixtures, source paths, hashes, and the current witness status.

## Operating Rules

- Do not claim a job is pricing-accurate until its witness rows are signed/reviewed by Haydon or another nominated QS.
- Treat historic IQ exports as evidence of failure or progress, not as final pricing evidence.
- A physical floor-plan wall gap is real width evidence only when it is tied to a physical
  opening on the building wall. Room-width, structural, alfresco, concrete, slab, and drafting
  artefact gaps are not pricing evidence.
- The building wall perimeter is the QS witness for openings and cladding. Roof,
  concrete, paving, and covered-alfresco outlines are separate witnesses; their
  open edges must not be priced as exterior walls, and they must not hide the real
  house wall behind them.
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

Status: signed manual opening witness exists for the current opening-pricing gap. Fenner remains an expected-fail until deterministic extraction recovers the supported opening set without blind assertions.

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
- `tests/fenner/baseline.test.ts` pins the manual rows, malformed drafting label detection, review-only floor-plan gaps, vector-rich/text-poor elevations, and the expected-fail for full priced opening recovery. It also now asserts Fenner produces both usable exterior gap evidence and demoted interior/artefact gap evidence, because this plan deliberately contains drafting/witness failures.
- `tests/takeoff/elevation-gap-match.test.ts` pins face-aware and envelope-aware elevation matching so a wrong elevation face or an interior wall gap cannot support a floor-plan gap.

Next required product slice:

Candidate-level reconciliation must price supported Fenner exterior candidates and quarantine only unsupported candidates. The expected-fail should turn green only when deterministic evidence recovers the signed 58.13 m2 / 48.05 m2 witness set row by row, without blind standard-height assertions or borrowing dimensions from interior/slab/alfresco/room-width/drafting artefacts.

Current reset milestone, 23 Jun 2026:

- Park exterior/perimeter trace work as diagnostic until it produces a trusted closed loop on the
  four-job rail. Do not use it as the primary Fenner opening-recovery path.
- Use the Fenner opening ledger as the scoreboard. Soft elevation hints are not recovery; the
  meaningful counters are face-aware elevation dimensions, floor + face-aware dimensions,
  production-priceable rows, and priceable area.
- First recovery proof should target three distinctive rows only: Garage Door 1 `4.8x2.1`,
  Lounge `3.6x2.1`, and Family slider `3.0x2.1`.
- Each priced pilot row must independently prove `W x H x face` from a physical floor-plan opening
  symbol/local width witness plus same-face elevation height/type. No aggregate-only pass counts.

## Beddis

Status: signed QS witness exists and the live baseline currently passes under the shared golden-job business tolerance. Treat Beddis as a useful recovery rail, not proof that opening identity is solved.

Controlled repo fixtures:

| Purpose | Path | Size | SHA-256 |
| --- | --- | ---: | --- |
| Prelim plan set | `tests/fixtures/beddis/prelim.pdf` | 3,584,063 | `047CE95A5B711DB51F09824E8C22582D55DCC22BFC6C5930D02B6AAB8DD0B1BF` |
| Concept floorplan | `tests/fixtures/beddis/concept-floorplan.pdf` | 434,493 | `7F680304C4371B4DFC50B16CE9FB0042A31939AC97EC0F610256E55CAB57BFC6` |
| QS workbook fixture | `tests/fixtures/beddis/Beddis_QS.xlsm` | 1,326,451 | `22D7E899052502C8AB84899B81BF47A6A3DBF858BE70D4EF3B42E9F9ED57FDF1` |
| Reduced truth JSON | `tests/fixtures/beddis/ground-truth.json` | 4,525 | `4A116A8126CEDAD59466B029D9149EA2206DF0FA71064EF0090EB651EAB46202` |

Live run on 21 Jun 2026 using production geometry:

| Field | IQ output | Signed witness | Delta |
| --- | ---: | ---: | ---: |
| Total opening sqm | 44.33 | 43.92 | +0.41 |
| Glazed sqm | 34.25 | 33.84 | +0.41 |
| External wall area m2 | 108.79 | 109.20 | -0.41 |

Current test map:

- `tests/beddis/baseline.test.ts` verifies schedule-path height recovery, garage size, field provenance, and the shared aggregate opening/glazed/external-wall product rail.
- The shared `0.5m2` aggregate rail should not be confused with candidate correctness; row identity/recovery still has to explain which local opening is wrong.

Next required product slice:

Move Beddis from aggregate-acceptable to candidate-correct: recover the signed local opening rows and keep any row-level disagreement visible even when the aggregate area is commercially acceptable.

## Harrison

Status: signed QS witness exists and the live material opening-area rail is green. This is no longer a decimal-difference blocker; it remains a useful no-schedule row-identity rail because the plan evidence, reviewed joinery bench, and composed rows still need clearer candidate identity.

Controlled repo fixtures:

| Purpose | Path | Size | SHA-256 |
| --- | --- | ---: | --- |
| Concept plan set | `tests/fixtures/harrison/concept.pdf` | 1,873,288 | `56F19E9455001B67EF215D59CD8B17C1C4BE5D5A9F3BA9F5FAD394FE03C7CFFC` |
| Reduced truth JSON | `tests/fixtures/harrison/ground-truth.json` | 9,126 | `80DA2FA8A01C91B2E997995CAABD41D8D577A556D88D680293ED743AEABCDB0B` |

Live run on 21 Jun 2026 using production geometry:

| Field | IQ output | Signed QS witness | Delta |
| --- | ---: | ---: | ---: |
| Total opening sqm | 46.75 | 46.89 | -0.14 |
| Glazed sqm | 36.67 | 36.81 | -0.14 |
| External wall area m2 | 98.21 | 98.07 | +0.14 |

Current observed state:

- Harrison, Beddis, and the Fenner expected-fail recovery gate now use the shared `GOLDEN_AGGREGATE_OPENING_AREA_TOLERANCE_M2 = 0.5` product rail for aggregate opening/glazed/external-wall area. This is not job-specific and not a per-opening matcher; row identity and unsupported candidates still remain visible rather than being hidden by the aggregate pass.
- The floor plan and reviewed joinery bench are both evidence. A QS/manual row can be wrong or normalised; a plan label can be duplicated, datum-contaminated, or attached to the wrong physical opening. IQ must surface the contradiction, not blindly tune to either source.
- The no-schedule path still needs clearer candidate identity: several `2.15m` datum-ish heights remain priceable, the remaining anonymous `1000x1000` candidate needs review, and room routing collapses many rows to `ENS` / `GD`.
- Garage size is now correctly `4.8x2.1` with the `garage_door_width` reconciliation flag preserved.

Next required product slice:

Keep Harrison material-green but keep row identity visible. The engine must distinguish real W-code/opening rows from anonymous or datum/title artefacts, then reconcile the priced set to the drawing evidence and signed QS witness by candidate evidence rather than by aggregate closeness.

## Christian / Awa Park

Status: high-value repeated regression benchmark, not yet signed pricing witness evidence. Christian currently proves parser/routing behavior, not final QS money accuracy.

Controlled source files:

| Purpose | Path | Last write | Size | SHA-256 |
| --- | --- | --- | ---: | --- |
| Full plan set | `C:\Users\Haydon\Jennian Homes Manawatu\Company - Documents\QUANTITY SURVEYING\Jennian IQ\25040 Christian, Blair - Lot 33 Awa Park, Feilding\03 PLANS\01 Preliminary Plans\2567 - Jen - Christian - Lot 33 Awa Park - A3 Plans V3.pdf` | 2026-03-03 16:03:04 | 34,594,868 | `F4DC4A7C9D7F381ED1852ED08935F4C93D0562BD14A83437B23D0AC686BD181A` |
| Historic QS workbook | `C:\Users\Haydon\Jennian Homes Manawatu\Company - Documents\QUANTITY SURVEYING\Jennian IQ\25040 Christian, Blair - Lot 33 Awa Park, Feilding\04 QS\Awa Park Corner Lot EST.xlsm` | 2026-05-04 14:19:58 | 2,100,809 | `FFFED92CA767C0C10342EFC6D9E05FB5882B56D92A70147D68527D32A9EBCD85` |
| Reduced truth JSON | `tests/fixtures/christian/ground-truth.json` | 2026-06-20 12:50:21 | 3,167 | `9AC3491AC818545CA58412427E483BF1ECFF725C21AF24619E2BEB901BE4685B` |

Current test map:

- `tests/fixtures/christian/ground-truth.json` records historic IQ output failures and parser expectations. It is not signed QS pricing witness evidence.
- `tests/christian/baseline.test.ts` pins printed joinery-code extraction, title-case room footprint recovery, and routing onto real room anchors.
- Existing source fixtures include `tests/fixtures/christian/floorplan-page6.pdf` and `tests/fixtures/christian/window-schedule-page25.pdf`.

Next required evidence step:

Haydon signs/reviews the Christian QS opening rows against the actual workbook or nominates a newer IQ-era Christian workbook. Once signed, add material assertions for opening area, garage area, alfresco, and export cells. Until then, Christian remains a regression rail rather than a shippable pricing witness gate.

## Open Access / Evidence Gaps

- Read-only Supabase/schema/job inspection access is still missing. This blocks live persisted-data audits without service-role paths.
- Christian signed QS witness is still pending.
- Fenner has signed opening witness evidence, but the engine still needs candidate-level reconciliation to recover it.
