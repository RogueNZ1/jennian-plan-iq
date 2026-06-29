# Fenner Review / Export Trust Defects - 2026-06-30

## Result
PASS WITH WARNINGS

## User Finding
- External wall area said "Not found" even though useful perimeter/wall-height evidence existed and opening reconciliation was deliberately blocked.
- The visible notes label said "AI NOTES & ASSUMPTIONS", which undermined confidence.
- Verification/export surfaces contained mojibake and fragile symbols.
- Opening mismatch warnings led with raw count differences instead of practical action.

## What Changed
- Added a shared customer-facing text helper for Review/export/verification strings.
- Verification model now shows:
  - External wall area: "Not calculated - opening reconciliation required" when perimeter and height exist but opening reconciliation blocks the calculation.
  - Printed cladding area as a separate review-only evidence row when title-block cladding area exists.
  - Opening reconciliation warnings headed by "Opening reconciliation blocked".
- Export workbook builders now:
  - Rename the visible notes worksheet header to "Review flags".
  - Sanitize worksheet string cells for customer-facing mojibake.
  - Use practical opening reconciliation wording in manual/blocked/cladding sections.
- Upload and quick export surfaces now:
  - Rename AI notes/assumptions labels to "Review flags".
  - Use "Unknown" or the blocked external-wall-area wording instead of "Not found".
  - Format mismatch warnings through the same opening reconciliation helper.

## What Did Not Change
- No pricing logic changed.
- No extraction logic changed.
- No detector, tolerance, or recovery logic changed.
- No correction UI changed.
- No legacy authority was promoted.
- Clean extracted quantity totals remain driven by `status === "extracted"`.

## Before / After Wording
Before:
- External wall area: Not found - enter manually
- AI NOTES & ASSUMPTIONS
- Window mismatch - floor plan: 16, elevations: 45
- External opening mismatch - floor plan: 16, elevations: 48
- OPENING PRICING BLOCKED - unresolved opening reconciliation

After:
- External wall area: Not calculated - opening reconciliation required
- Printed cladding area: review only - not calculated external wall area
- Review flags
- Opening reconciliation blocked. Floor-plan and elevation opening counts disagree. Use Extracted Quantities Review; do not price openings or cladding from this run.

## Validation
- `git diff --check` passed.
- Focused tests passed: 5 files, 89 tests.
- `npx tsc --noEmit` passed.
- `npm run test` passed: 103 files passed, 993 tests passed, 1 expected fail, 26 skipped.
- `npm run build` passed, including its internal full test run and Vite build.

## Product Verdict
Fenner-style blocked opening reconciliation should now read as an honest review artifact at the model/export string level:
- calculated external wall area is blocked, not missing;
- printed cladding is review evidence only;
- clean extracted quantities remain visible and unchanged;
- review warnings lead with practical action;
- customer-facing touched surfaces no longer expose the previous mojibake strings.

Warning: this slice verified generated models, workbook builders, routes, tests, and production build. It did not include a live JM-0061 browser/PDF screenshot smoke.
