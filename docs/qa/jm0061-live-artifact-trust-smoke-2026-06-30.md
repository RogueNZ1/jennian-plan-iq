# JM-0061 Live Artifact Trust Smoke - 2026-06-30

Result: PASS

Scope:
- JM-0061 / Fenner live artifact smoke from current local main.
- Generated fresh verification PDF and workbook through the browser against `http://127.0.0.1:5188`.
- Inspected saved PDF text, Quick Export page text, and workbook cells.
- No extraction, detector, tolerance, pricing, correction UI, or ledger authority changes were made.

Committed review packet:
- `docs/qa/jm0061-live-artifact-trust-smoke-2026-06-30/JM-0061-Fenner-347dd02-verification.pdf`
- `docs/qa/jm0061-live-artifact-trust-smoke-2026-06-30/JM-0061-Fenner-347dd02.xlsx`
- `docs/qa/jm0061-live-artifact-trust-smoke-2026-06-30/JM-0061-Fenner-347dd02-pdf-text.txt`
- `docs/qa/jm0061-live-artifact-trust-smoke-2026-06-30/JM-0061-Fenner-347dd02-export-page-text.txt`
- `docs/qa/jm0061-live-artifact-trust-smoke-2026-06-30/JM-0061-Fenner-347dd02-workbook-inspection.json`

Artifact hashes:
- PDF SHA256: `69BF33EC916C73B980650B9648FCE451FBCDA162C7FFEE8C70F8B30A8E9654CE`
- Workbook SHA256: `A6969C8D729C0063955F9EA292B52537AF325678B06CCF06DC428EEAD730126F`

## Artifact Findings

PDF:
- Forbidden token scan passed: no `Â`, `â`, `â€`, `âš`, `mÂ²`, `AI NOTES & ASSUMPTIONS`, `OPENING PRICING BLOCKED`, `Review Notes`, `CONFIDENCE REVIEW NOTES`, or `AI opening check`.
- Page count: before 35, after 33.
- Practical opening block count: 1.
- External wall area blocked wording count: 1.
- Page 1 external wall area now states: `Review External wall area Not calculated - opening reconciliation required m2 DRV`.
- Extracted Quantity summary area is rounded: `Clean count 9 Clean length - mm Clean area 17.63 m2 needs_review 19 missing 1 conflict 13 ignored 0`.
- Raw floating point summary output absent: no `17.630000000000003`.

Workbook:
- Sheets after: `Cover`, `Review flags`, `Extracted Quantities`, `5. Data Input House `, `IQ Import`.
- Forbidden token scan passed.
- Old `Review Notes` sheet name removed.
- Old `OPENING PRICING BLOCKED` wording absent.
- Practical opening block count: 1, in `Review flags!B31`.
- `IQ Import` carries only a pointer: `Review flags required before pricing windows, openings, or cladding from this export.`
- Inspection JSON now reports `masterbed1100x800: 2`.

Quick Export page:
- Raw repeated row text removed.
- Before contained repeated `Opening pricing blocked: unresolved Visual QS reconciliation error. AI opening check...`.
- After contains one practical block in Review flags and a separate `Review-only opening rows` table notice.

## Before / After Snippets

PDF before:
- `O1 window Master Bed 1100 Ã- 600...`
- `Opening pricing blocked: unresolved Visual QS reconciliation error. AI opening check found 17 QS-glazed external openings...`

PDF after:
- No `Ã` size separator hits.
- No `AI opening check` hits.
- `Review External wall area Not calculated - opening reconciliation required m2 DRV`
- `Clean count 9 Clean length - mm Clean area 17.63 m2 needs_review 19 missing 1 conflict 13 ignored 0`

Workbook before:
- Sheet name: `Review Notes`.
- Extracted Quantities remained useful but customer-facing labels were inconsistent.

Workbook after:
- Sheet name: `Review flags`.
- `Review flags!B31`: `Opening reconciliation blocked Floor-plan and elevation opening counts disagree. Use Extracted Quantities Review; do not price openings or cladding from this run. Detail: review found 17 QS-glazed external openings; composed opening set has 13.`

## Clean Totals Preserved

From the generated workbook `Extracted Quantities` sheet:
- Clean window rows: 9.
- Clean window area: 17.63 m2.
- Clean interior doors: 20.
- Exterior perimeter: 89.1 lm.
- MASTERBED 1100 x 800 rows preserved: 2.

MASTERBED rows:
- `opening-floorplan-label-11`, widthMm 800, heightMm 1100, area 0.88, evidence text includes `1100 x 800`.
- `opening-floorplan-label-12`, widthMm 800, heightMm 1100, area 0.88, evidence text includes `1100 x 800`.

## Validation

Passed:
- `git diff --check`
- `npx tsc --noEmit`
- `npx vitest run src/lib/__tests__/verification-model.test.ts tests/convergence/qs-export-flags.test.ts tests/convergence/qs-export-flat-openings.test.ts`
- `npm run test` - 103 files passed, 9 skipped; 996 tests passed, 1 expected fail, 26 skipped.
- `npm run build` - Vitest pass plus production Vite build and postbuild passed.
- Regenerated artifact scans: PDF forbidden token scan passed, workbook forbidden token scan passed, external wall blocked wording present, practical opening block count 1, clean totals unchanged, MASTERBED 1100 x 800 rows counted as 2.

Notes:
- Temporary smoke working files under `output/` are not committed.
- The actual PDF/workbook review artifacts are committed in the review packet above.
- Two throwaway `.test.ts` files created under `output/` during smoke setup were removed because Vitest picked them up during `npm run test`.
