# Slice 2H.3 - Text Witness Coverage Diagnostics

Date: 2026-06-29 NZT

Result: PASS WITH WARNINGS

## Scope

This diagnostic explains why the fresh production Codex Fenner run produced zero floor-plan text height witness matches while the local 15A proof produced two safe matches.

No extraction logic, detector tuning, tolerance changes, assumed heights, pricing paths, correction UI, `opening_schedule`, `visual_opening_audit`, `door_hits`, or correction-memory matching was changed.

Production `/version.json` served:

`fb930c7bbc9d2559f0ffe2d0b8b80a6d2d6e6821`

## Summary

Production Fenner did not fail because text was absent or because text was not passed to the matcher.

The source PDF dry-run found:

- 15 parsed `W x H` text candidates;
- all 15 had same-page context and x/y position;
- 20 of 24 floor-gap rows had a nearby `W x H` candidate;
- only 3 floor gaps were eligible exterior rows;
- all 3 eligible exterior rows rejected by strict width mismatch;
- the remaining 21 rows were interior/ineligible, mostly low-confidence/ambiguous routing.

That makes Fenner's zero matches expected under the conservative rule, not a plumbing bug.

The current yield limit is not text extraction. It is the overlap between:

1. true exterior floor-gap rows with reliable measured width; and
2. nearby printed dimension labels whose width component matches that gap within 50 mm.

15A has two such rows. Fenner, Beddis, O'Neil, and Christian did not under the current rule.

## Jobs Inspected

| Job | Run mode | runId | Purpose |
| --- | --- | --- | --- |
| JM-CODEX Fenner fresh production | production fresh run | `bcac8ed8-4e9b-43e3-8e36-35b3d694ece6` | Deployed zero-match case |
| JM-CODEX Fenner source PDF | dry-run from production uploaded PDF | `bcac8ed8-4e9b-43e3-8e36-35b3d694ece6` | Full text/gap rejection funnel |
| JM-0005 Beddis current production | production current run | `712c53a1-4e4b-4ede-ba5e-11eccef0e9e6` | Read-only old-job/current authority comparison |
| JM-0005 Beddis source PDF | dry-run from production uploaded PDF | `712c53a1-4e4b-4ede-ba5e-11eccef0e9e6` | Full text/gap rejection funnel |
| 15A floorplan fixture | local fresh run | n/a | Positive proof |
| O'Neil floorplan fixture | local fresh run | n/a | Additional W x H text fixture |
| Christian floorplan page6 fixture | local fresh run | n/a | Additional W x H text fixture |

JM-0060 was not rerun or mutated.

## Persisted Production Authority

Persisted production rows confirm active authority state, but not the full text-position funnel. Persisted `takeoff_json.plan_text.windowCodes` stores dimensions and optional ids, but not text x/y/page. The rejection funnel therefore requires current-code dry-runs on the source PDFs.

| Job | Authority rows | Floor-gap rows | Persisted W x H count | Persisted W x H has x/y/page | Text-height matches | Opening rows still height null | Status groups |
| --- | ---: | ---: | ---: | --- | ---: | ---: | --- |
| JM-CODEX Fenner | 66 | 24 | 15 | no | 0 | 32 | 4 extracted, 18 needs_review, 29 missing_evidence, 15 conflict, 0 ignored |
| JM-0005 Beddis | 71 | 43 | 8 | no | 0 | 50 | 4 extracted, 12 needs_review, 47 missing_evidence, 8 conflict, 0 ignored |

No persisted production rows used forbidden sources as height proof.

## Match Funnel

| Job / mode | Floor gaps | Eligible exterior gaps | Gaps with measured width | Parsed W x H text | Text with page | Text with x/y | Gaps with nearby W x H | Safe matches | Height filled | Area calculated | Rows still height null |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fenner source PDF dry-run | 24 | 3 | 24 | 15 | 15 | 15 | 20 | 0 | 0 | 0 | 25 |
| Beddis source PDF dry-run | 43 | 7 | 43 | 8 | 8 | 8 | 26 | 0 | 0 | 0 | 43 |
| 15A local fresh run | 40 | 5 | 40 | 11 | 11 | 11 | 33 | 2 | 2 | 2 | 38 |
| O'Neil local fresh run | 26 | 4 | 26 | 8 | 8 | 8 | 17 | 0 | 0 | 0 | 26 |
| Christian local fresh run | 21 | 1 | 21 | 18 | 18 | 18 | 21 | 0 | 0 | 0 | 21 |

## Rejection Reasons

| Job / mode | No parsed W x H | No nearby text | Text no page/position/bbox | Wrong page | Width mismatch | Too far | Ambiguous | Interior/ineligible | Conflict row | Missing width | Other |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fenner source PDF dry-run | 0 | 0 | 0 | 0 | 3 | 0 | 0 | 21 | 0 | 0 | 0 |
| Beddis source PDF dry-run | 0 | 0 | 0 | 0 | 7 | 0 | 0 | 36 | 0 | 0 | 0 |
| 15A local fresh run | 0 | 1 | 0 | 0 | 2 | 0 | 0 | 35 | 0 | 0 | 0 |
| O'Neil local fresh run | 0 | 2 | 0 | 0 | 2 | 0 | 0 | 22 | 0 | 0 | 0 |
| Christian local fresh run | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 20 | 0 | 0 | 0 |

Dominant rejection reasons:

- `interior_or_ineligible_gap`: most detected floor gaps are not safe exterior opening rows.
- `width_mismatch`: every eligible zero-match row in Fenner and Beddis had nearby text, but no printed dimension matched the measured gap width within 50 mm.

Not observed:

- text candidate missing page;
- text candidate missing x/y;
- wrong-page rejection;
- ambiguous accepted rows;
- missing measured floor-gap width;
- area calculated from null/assumed height.

## Fenner Detail

Fresh production run:

- jobId: `ced8ec8e-51b2-4da8-b191-506477d31bb8`
- runId: `bcac8ed8-4e9b-43e3-8e36-35b3d694ece6`
- status: completed
- completed at: `2026-06-28T22:48:19.072+00:00`
- active authority: `persisted_current_run`

Dry-run on the same uploaded source PDF:

- page: 1
- parsed text candidates: 15
- text candidates with x/y: 15
- floor-gap rows: 24
- eligible exterior rows: 3
- rows with nearby `W x H` text: 20
- safe matches: 0

Eligible rejection examples:

| Gap | Gap width | Nearby text | Distance | Closest width deltas | Rejection |
| --- | ---: | --- | ---: | --- | --- |
| `floorplan-gap-1` | 2747 mm | `1100 x 1500` | 82 pt | 1247 mm / 1647 mm | width mismatch |
| `floorplan-gap-2` | 1994 mm | `2150 x 600` | 31 pt | 1394 mm / 156 mm | width mismatch |
| `floorplan-gap-3` | 381 mm | `1100 x 800` | 65 pt | 419 mm / 719 mm | width mismatch |

Fenner conclusion:

The matcher received positioned text candidates and floor-gap candidates. It rejected Fenner because the eligible measured gap widths did not match nearby printed dimensions. This is expected conservative behavior.

## Beddis Detail

Production current run:

- jobId: `6f502da2-7eac-4b84-bc27-539f772a90fe`
- runId: `712c53a1-4e4b-4ede-ba5e-11eccef0e9e6`
- active authority: `persisted_current_run`

Dry-run on the same uploaded source PDF:

- page: 1
- parsed text candidates: 8
- text candidates with x/y: 8
- floor-gap rows: 43
- eligible exterior rows: 7
- rows with nearby `W x H` text: 26
- safe matches: 0

Eligible rejection examples:

| Gap | Gap width | Nearby text | Distance | Closest width deltas | Rejection |
| --- | ---: | --- | ---: | --- | --- |
| `floorplan-gap-2` | 1913 mm | `750 x 1500` | 70 pt | 413 mm / 1163 mm | width mismatch |
| `floorplan-gap-5` | 1806 mm | `2150 x 2000` | 49 pt | 194 mm / 344 mm | width mismatch |
| `floorplan-gap-7` | 1056 mm | `2150 x 800` | 28 pt | 256 mm / 1094 mm | width mismatch |

Beddis conclusion:

Text exists and is positioned. The current floor-gap widths do not match nearby printed dimensions tightly enough to support height recovery.

## Positive 15A Proof

15A local fresh run:

- parsed text candidates: 11
- eligible exterior floor gaps: 5
- safe matches: 2
- height filled: 2
- area calculated: 2

Successful rows:

| Ledger row | Gap width | Matched text | Width delta | Height selected | Area | Before | After |
| --- | ---: | --- | ---: | ---: | ---: | --- | --- |
| `opening-floorplan-gap-3` | 1820 mm | `1300 x 1800` | 16 mm | 1300 mm | 2.37 m2 | missing_evidence, height null, area null | extracted |
| `opening-floorplan-gap-4` | 1320 mm | `1300 x 1500` | 21 mm | 1500 mm | 1.98 m2 | missing_evidence, height null, area null | extracted |

Rejected 15A examples stayed null:

- `floorplan-gap-1`: width 1909 mm, nearby `1100 x 600`, `1100 x 1200`, `1100 x 600`; rejected by width mismatch.
- `floorplan-gap-2`: width 1816 mm, no nearby text; rejected by no nearby text.
- interior/ambiguous gap rows with nearby text stayed ineligible and did not promote.

## Additional Fixture Findings

O'Neil:

- 8 parsed W x H candidates with positions.
- 4 eligible exterior gaps.
- 0 safe matches.
- 2 eligible rows had no nearby text.
- 2 eligible rows rejected by width mismatch.

Christian:

- 18 parsed W x H candidates with positions.
- 1 eligible exterior gap.
- 0 safe matches.
- the eligible row rejected by width mismatch.
- many ineligible/interior rows had nearby W x H labels, but were correctly not promoted.

## Expected Or Bug?

Expected under the current rule.

There is no evidence of a same-page text plumbing bug:

- Fenner source PDF dry-run produced 15 parsed text dimensions;
- all 15 carried x/y positions;
- all inherited page context through the active door page;
- 20 floor-gap rows had nearby text;
- no text rows were rejected for missing page or position.

The zero-match cause is conservative filtering:

- eligible exterior gap rows are low-yield;
- eligible gap widths often appear to be wall-gap spans or partial gaps that do not match the nearby printed joinery dimension;
- most nearby text labels sit near interior/ineligible floor gaps and are intentionally not used.

## Safety

Held:

- no assumed `2100` height;
- no area from unmatched text;
- no ambiguous matches accepted;
- no schedule/legacy source used;
- no pricing behavior changed;
- rows without width proof stayed null/null;
- text witness status promotion occurred only in the 15A rows with strict width match.

## Recommendation

Next implementation slice:

`2H.4 - Floor-gap width quality diagnostics for exterior opening candidates`

Goal:

Explain why many eligible exterior floor-gap widths do not match nearby printed joinery dimensions.

Scope should remain diagnostic unless a narrow bug is found. Recommended checks:

- compare floor-gap measured width against nearby physical opening/code witnesses;
- classify whether the gap width is a true opening, wall span, doorway, partial gap, or detector artefact;
- record per-gap width quality reason in diagnostics/review evidence;
- keep height and area null when width quality is not proven.

Do not widen tolerance or accept mismatched text. If the width mismatch is genuine, the next evidence path should be schedule/code witness recovery or a stronger opening-width source, not looser text matching.

## Commands Run

```powershell
git status --short --branch
Invoke-WebRequest https://www.jennianiq.nz/version.json
# Read-only Supabase authority inspection for Fenner and Beddis
# Current-code dry-run on production uploaded PDFs for Fenner and Beddis
# Current-code local fresh runs on 15A, O'Neil, and Christian fixtures
```
