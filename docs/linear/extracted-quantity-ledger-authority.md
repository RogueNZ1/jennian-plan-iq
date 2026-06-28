# Linear Parent Issue - JEN-46 Extracted Quantity Ledger Authority

## Title

Extracted Quantity Ledger Authority

## Description

Jennian IQ is being refocused from autonomous QS pricing toward reliable extracted takeoff numbers with evidence and uncertainty.

Immediate product need:
- exterior perimeter
- interior doors
- windows/openings
- exterior doors
- garage doors
- known dimensions
- unknown dimensions as null
- warnings/status/confidence
- evidence
- exportable numbers

Problem:
The app historically allowed multiple authorities:
- takeoff_json
- opening_schedule
- visual_opening_audit
- verification model
- review-only candidates
- overlay markers
- export rows

This caused split-brain outputs where review, verification, overlay, and export could disagree.

Doctrine:
Every user-visible extracted number must eventually come from an active-run Extracted Quantity ledger row.

Evidence collectors such as Vision AI, vector geometry, PDF text, schedules, and human corrections are not final authorities. They feed the ledger.

Views such as export, verification, review, and overlay must read the ledger. They must not invent independent totals.

## Milestones

### M1 - Visible Extracted Quantity Output

Status: completed / PASS WITH WARNINGS

Completed:
- Extracted Quantity Ledger
- Read model
- Extracted Quantities worksheet
- JM-0060 smoke test
- existing QS workbook sheets unchanged
- null unknown dimensions
- assumed-height rows quarantined
- clean totals separated
- evidence columns present

Warning:
Ledger still reads pricing-shaped upstream fields:
- candidate.priced
- candidate.status === "priced"

Accepted as transitional debt and tracked in JEN-47.

### M2 - Run-Scoped Persistence

Status: implemented / pushed

Commit:
20f5537 feat: persist extracted quantity rows by run

Completed:
- extracted_quantity_rows migration
- run-scoped persistence service
- superseding / active reads
- null/evidence round trip
- export prefers active persisted ledger rows when available
- existing QS/pricing workbook behaviour unchanged

### M3 - Verification Reads Ledger

Status: next

Goal:
Verification summarises active ledger rows and evidence stack. Verification must not compute independent totals.

### M4 - Review and Overlay Read Ledger

Status: future

Goal:
Review rows and overlay markers reference extractedQuantity.id and active run only.

## Current Next Issue

Slice 2C - Verification reads active extracted quantity ledger.
