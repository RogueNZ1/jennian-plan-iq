# Live Production Artifact Regression Audit - 2026-06-30

## Result

PASS WITH WARNINGS after a tiny render/export-boundary fix and production redeploy.

The broken artifact Haydon saw is a stale PDF/workbook generated before the customer-facing text cleanup was available in the artifact being viewed. Current production is serving commit `5663891a5de7fb00ce4f465edb70a41b05be11a7`, and a fresh production verification PDF generated from JM-0061 no longer shows the mojibake or old opening-pricing wording.

The audit also found a separate presentation bug: current production workbook cells and the Review extracted-quantity header still leaked the raw floating point clean area value `17.630000000000003`. That was missed by the earlier packet scan because the workbook visibly formatted the value as `17.63`, but the raw XLSX cell value still contained the float tail. I fixed only the customer-facing display/export boundary.

## Executive Summary

Haydon was seeing an old artifact, not current production output. The broken artifact clue was the same active run `c2159cc7-aecd-4644-b339-fe3443acef9f` printed around `30/06/2026 08:42 / 08:43 NZT`; fresh production output from the same run printed `01/07/2026 07:49 NZT` and did not contain the old mojibake or `OPENING PRICING BLOCKED` customer wording.

Production itself is not stale: `/version.json` reports `5663891a5de7fb00ce4f465edb70a41b05be11a7`. The browser loaded current production verification/export/review routes, and the fresh production PDF matched the cleaned customer-facing wording.

The only live defect still proven before this patch was numeric formatting in customer surfaces: Review showed `Clean area 17.630000000000003 m2`, and the workbook contained raw numeric cell values `17.630000000000003` even though Excel displayed `17.63`. The patch rounds exported/displayed area values to two decimals without touching extraction, pricing, correction UI, detector logic, tolerances, ledger authority, or recovery scoring.

After pushing commit `92ed04392ff93dc441f996c4afa633b0c84ff0b4`, production `/version.json` served that commit and fresh production PDF/workbook/route scans passed.

## Scope

- Job reference: `JM-0061` / Fenner
- Job ID: `e0de62fb-f184-4b38-82df-68e6695fd325`
- Active run ID: `c2159cc7-aecd-4644-b339-fe3443acef9f`
- Production base URL: `https://www.jennianiq.nz`
- Production verification route: `https://www.jennianiq.nz/jobs/e0de62fb-f184-4b38-82df-68e6695fd325/verification`
- Production export route: `https://www.jennianiq.nz/jobs/e0de62fb-f184-4b38-82df-68e6695fd325/export`
- Production review route: `https://www.jennianiq.nz/review?job=e0de62fb-f184-4b38-82df-68e6695fd325&tab=extracted`
- Current production build: `5663891a5de7fb00ce4f465edb70a41b05be11a7`

Fresh production artifacts saved under `output/live-regression-audit-2026-06-30/`:

- PDF SHA256: `60707399D0C7581A0993AE3BAD4291D22DBBDDEB9699C1B2B43E6A60B0E3F3F9`
- Workbook SHA256: `C0D343D0D281111139B16302498E821B745FF7506B9A860B01CF8109D008D7AB`
- Generated: `2026-06-30T19:49:24.086Z` (`01/07/2026 07:49 NZT`)

Local after-fix artifacts saved under `output/live-regression-audit-2026-06-30/local-after-fix/`:

- PDF SHA256: `8FBDCE0D20C5842E411567DD69028B226008FD91A7320D7A9CDB2FDAA13E79A5`
- Workbook SHA256: `38E049E4D89F14C4D68AFA626FEE3CB709A180F1968DCA62CEAED4DFDCF26ACE`
- Generated: `2026-06-30T19:52:24.031Z` (`01/07/2026 07:52 NZT`)

Post-deploy production artifacts saved under `output/live-regression-audit-2026-06-30/production-after-fix/`:

- Production build: `92ed04392ff93dc441f996c4afa633b0c84ff0b4`
- PDF SHA256: `E8087604BA393AE9B0BFBF6DF0FAC212CDCB4297D4135BF6F194762729C0E918`
- Workbook SHA256: `38E049E4D89F14C4D68AFA626FEE3CB709A180F1968DCA62CEAED4DFDCF26ACE`
- Generated: `2026-06-30T20:01:59.485Z` (`01/07/2026 08:01 NZT`)

`output/` remains uncommitted.

## Artifact Comparison

| Check | Broken user artifact | Signed-off packet | Fresh production before patch | Production after fix |
| --- | --- | --- | --- | --- |
| Run ID | `c2159cc7-aecd-4644-b339-fe3443acef9f` | `c2159cc7-aecd-4644-b339-fe3443acef9f` | `c2159cc7-aecd-4644-b339-fe3443acef9f` | `c2159cc7-aecd-4644-b339-fe3443acef9f` |
| Printed timestamp | Around `30/06/2026 08:42 / 08:43 NZT` | Around `30/06/2026 13:14 NZT` | `01/07/2026 07:49 NZT` | `01/07/2026 08:01 NZT` |
| PDF hash | Not available from uploaded view | Packet hash in committed review packet | `60707399D0C7581A0993AE3BAD4291D22DBBDDEB9699C1B2B43E6A60B0E3F3F9` | `E8087604BA393AE9B0BFBF6DF0FAC212CDCB4297D4135BF6F194762729C0E918` |
| PDF forbidden tokens | Present in the viewed artifact | None in packet scan | None | None |
| External wall area wording | Dash/blank | `Not calculated - opening reconciliation required` | `Not calculated - opening reconciliation required` | `Not calculated - opening reconciliation required` |
| Clean window area in PDF | `17.630000000000003 m2` with mojibake | `17.63 m2` | `17.63 m2` | `17.63 m2` |
| Old opening wording | `OPENING PRICING BLOCKED`, repeated AI wording | Absent from customer artifact | Absent from PDF | Absent from PDF |
| Workbook raw clean area | Broken artifact showed raw float | Packet raw cells still had `17.630000000000003`; old scan missed it | Raw cells still had `17.630000000000003` before this patch | Raw float absent |
| Review extracted header | Broken artifact not separately hashable | Not applicable | `17.630000000000003 m2` before this patch | Raw float absent |
| Workbook sheet label | Broken artifact had old wording | `Review flags` | `Review flags` | `Review flags` |
| MASTERBED 1100 x 800 rows | Not trusted from broken artifact | 2 after corrected inspection | 2 | 2 |

## Findings

### 1. Deployment/Version State

- Local `main` before this patch was at `5663891a5de7fb00ce4f465edb70a41b05be11a7`.
- Production `/version.json` returned `{"build":"5663891a5de7fb00ce4f465edb70a41b05be11a7"}`.
- Current production was not serving the old `1f627c6`/pre-cleanup bundle.
- Fresh production route assets included current verification/export/review bundles.
- Local dev `/version.json` returns a 404 shell page, which is expected for Vite dev and not evidence of production drift.

### 2. Verification PDF

Fresh production PDF text scan:

- Forbidden hits: none.
- Required hits: `Not calculated - opening reconciliation required`, `Opening reconciliation blocked`, `Clean area 17.63 m2`.
- Practical opening block count: 1.
- External wall blocked wording count: 1.
- Raw float count: 0.
- Printed line: `TAKEOFF RUN c2159cc7 / 30/06/2026, 08:40 NZT PRINTED 01/07/2026, 07:49 NZT`.

Local after-fix PDF text scan:

- Forbidden hits: none.
- Required hits: `Not calculated - opening reconciliation required`, `Opening reconciliation blocked`, `Clean area 17.63 m2`.
- Practical opening block count: 1.
- External wall blocked wording count: 1.
- Raw float count: 0.

### 3. Workbook Export

Fresh production workbook scan before this patch:

- Sheets: `Cover`, `Review flags`, `Extracted Quantities`, `5. Data Input House `, `IQ Import`.
- Required text present: `Opening reconciliation blocked`, `Review flags`.
- Practical opening block count: 1.
- Clean window rows: 9.
- Clean window area: 17.63.
- Interior doors: 20.
- Perimeter: 89.1 lm.
- MASTERBED 1100 x 800 rows: 2.
- Defect: raw XLSX cell values still contained `17.630000000000003`.

Post-deploy production workbook scan:

- Forbidden hits: none.
- Required text present: `Opening reconciliation blocked`, `Review flags`.
- Practical opening block count: 1.
- Clean window rows: 9.
- Clean window area: 17.63.
- Interior doors: 20.
- Perimeter: 89.1 lm.
- MASTERBED 1100 x 800 rows: 2.

### 4. Quick Export

The export route was exercised through the browser and workbook download. The route shell text itself stayed clean, and the downloaded workbook is the meaningful customer artifact for this path. The scan found no forbidden strings in the route shell text.

### 5. Review Page

Correct Review route is:

`/review?job=e0de62fb-f184-4b38-82df-68e6695fd325&tab=extracted`

The guessed route `/jobs/:id/review` returns `Not Found`; that was an audit-script route mistake, not a product route split.

Fresh production Review route before this patch:

- Forbidden hits: `17.630000000000003`.
- Raw float count: 1.

Post-deploy production Review route:

- Forbidden hits: none.
- Raw float count: 0.

### 6. Persisted Data vs Render-Layer Text

Searches confirmed the old raw wording still exists in internal adjudication, tests, and sanitizer code paths. That is expected: the system still needs to hold internal failure reasons, but customer surfaces must sanitize them. Current production PDF and local after-fix workbook/review scans prove those raw strings are not exposed through the verified customer artifacts.

The remaining raw float problem was not persisted historical text and not ledger authority. It was render/export formatting of a calculated clean area total.

## Root Cause Classification

Primary root cause: **A. stale artifact**.

Evidence:

- The broken artifact printed around `30/06/2026 08:42 / 08:43 NZT`.
- The committed cleaned packet printed later, around `30/06/2026 13:14 NZT`.
- Fresh production generated from the same job/run on `01/07/2026 07:49 NZT` has no PDF mojibake, no old opening pricing block wording, and correct external wall blocked wording.
- Production `/version.json` is current at `5663891a5de7fb00ce4f465edb70a41b05be11a7`.

Secondary root cause: **G. test/audit false positive** plus a small render/export precision leak.

Evidence:

- The earlier packet workbook visibly displayed `17.63`, but raw XLSX cells still contained `17.630000000000003`.
- The earlier scan did not include that raw numeric token as a workbook failure.
- Current production Review displayed the raw clean-area number directly from the model.
- Local after-fix workbook and Review scans remove the raw float while keeping the clean totals unchanged.

Not supported by evidence:

- **B. stale production deploy**: production `/version.json` is current.
- **C. route split**: production verification/export/review routes were exercised; `/jobs/:id/review` was only a wrong audit URL.
- **D. persisted raw string leakage**: customer artifact scans after cleanup do not show persisted old opening strings leaking through.
- **E. browser print vs model mismatch**: fresh production browser print/PDF text is clean.
- **F. cache/CDN issue**: current browser-loaded assets and `/version.json` are current.

## User-Visible Impact

The stale PDF/workbook looked like the product was still guessing, exposing internal AI/pricing failure language, and corrupting text encoding. That destroys trust even when the extracted quantities are actually useful.

The current production PDF no longer has that trust problem, but the workbook/Review raw float leak was still ugly enough to fail artifact signoff. The patch closes that presentation gap.

## Recommended Next Action

Replace any stale uploaded/shared JM-0061 PDF/workbook links with fresh artifacts generated from production commit `92ed04392ff93dc441f996c4afa633b0c84ff0b4`.

## What Was Not Changed

- No extraction changes.
- No pricing changes.
- No correction UI changes.
- No detector or tolerance changes.
- No ledger authority changes.
- No opening recovery or Fenner scoring changes.
- No `output/` files committed.

## Validation

Commands run:

- `git status --short` before patch: only source changes from this fix and untracked `output/`.
- `git branch --show-current`: `main`.
- `git rev-parse HEAD`: `5663891a5de7fb00ce4f465edb70a41b05be11a7`.
- Production `/version.json`: `{"build":"5663891a5de7fb00ce4f465edb70a41b05be11a7"}`.
- Generated fresh production PDF/workbook under `output/live-regression-audit-2026-06-30/`.
- Generated fresh local after-fix PDF/workbook under `output/live-regression-audit-2026-06-30/local-after-fix/`.
- Pushed commit `92ed04392ff93dc441f996c4afa633b0c84ff0b4` to `main`.
- Production `/version.json` confirmed `{"build":"92ed04392ff93dc441f996c4afa633b0c84ff0b4"}`.
- Generated fresh post-deploy production PDF/workbook under `output/live-regression-audit-2026-06-30/production-after-fix/`.
- PDF forbidden token scan: passed.
- Workbook forbidden token scan: passed after fix.
- Review route forbidden token scan: passed after fix.
- External wall blocked wording: present.
- Practical opening block count: 1.
- Clean totals unchanged: 9 clean window rows, 17.63 m2 clean window area, 20 clean interior doors, 89.1 lm perimeter, 2 MASTERBED 1100 x 800 rows.
- `git diff --check`: passed.
- `npx vitest run tests/convergence/extracted-quantity-export.test.ts`: 1 file passed, 10 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run test`: 103 files passed, 9 skipped; 997 tests passed, 1 expected fail, 26 skipped.
- `npm run build`: passed; build test suite passed, Vite client/server build passed, postbuild passed.
