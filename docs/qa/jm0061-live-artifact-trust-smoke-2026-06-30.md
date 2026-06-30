# JM-0061 Live Artifact Trust Smoke - 2026-06-30

Result: PASS

Scope:
- JM-0061 / Fenner live artifact smoke from current local main.
- Generated fresh verification PDF and workbook through the browser against `http://127.0.0.1:5187`.
- Inspected saved PDF text, Quick Export page text, and workbook cells.
- No extraction, detector, tolerance, pricing, correction UI, or ledger authority changes were made.

Generated artifacts, not committed:
- `output/live-artifact-smoke-2026-06-30/JM-0061-Fenner-current-after-verification.pdf`
- `output/live-artifact-smoke-2026-06-30/JM-0061-Fenner-current-after.xlsx`
- `output/live-artifact-smoke-2026-06-30/current-after-pdf-text.txt`
- `output/live-artifact-smoke-2026-06-30/current-after-export-page-text.txt`
- `output/live-artifact-smoke-2026-06-30/current-after-workbook-inspection.json`

## Artifact Findings

PDF:
- Forbidden token scan passed: no `Â`, `â`, `â€`, `âš`, `mÂ²`, `AI NOTES & ASSUMPTIONS`, `OPENING PRICING BLOCKED`, `Review Notes`, `CONFIDENCE REVIEW NOTES`, or `AI opening check`.
- Page count: before 35, after 33.
- Practical opening block count: 1.
- External wall area blocked wording count: 1.
- Page 1 external wall area now states: `Review External wall area Not calculated - opening reconciliation required m2 DRV`.

Workbook:
- Sheets after: `Cover`, `Review flags`, `Extracted Quantities`, `5. Data Input House `, `IQ Import`.
- Forbidden token scan passed.
- Old `Review Notes` sheet name removed.
- Old `OPENING PRICING BLOCKED` wording absent.
- Practical opening block count: 1, in `Review flags!B31`.
- `IQ Import` carries only a pointer: `Review flags required before pricing windows, openings, or cladding from this export.`

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
- `npx vitest run src/lib/__tests__/verification-model.test.ts tests/convergence/qs-export-flags.test.ts tests/convergence/qs-export-flat-openings.test.ts`
- `npx tsc --noEmit`
- `npm run test` - 103 files passed, 9 skipped; 996 tests passed, 1 expected fail, 26 skipped.
- `npm run build` - Vitest pass plus production Vite build and postbuild passed.

Notes:
- Temporary smoke files under `output/` are not committed.
- Two throwaway `.test.ts` files created under `output/` during smoke setup were removed because Vitest picked them up during `npm run test`.
