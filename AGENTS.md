# AGENTS.md - Jennian IQ

## Product Doctrine

Jennian IQ is currently a residential plan extraction assistant, not an autonomous QS pricing engine.

The immediate product goal is reliable extracted numbers:
- exterior perimeter
- interior doors
- windows/openings
- exterior doors
- garage doors
- known dimensions
- unknown dimensions as null
- warnings/status/confidence/evidence
- exportable numbers

Pricing is downstream. Pricing must not drive extraction authority.

## Architecture Doctrine

Every user-visible extracted number must eventually come from an active-run Extracted Quantity ledger row.

Evidence collectors are not final authorities:
- Vision AI
- vector geometry
- PDF text
- schedules
- human corrections
- AI check

Views are not authorities:
- export
- verification
- review
- overlay
- job summary
- completion dialog

Views may filter, group, format, or display ledger rows. They must not invent independent totals.

## Current Migration Order

1. Extracted Quantity Ledger
2. Extracted Quantity Read Model
3. Visible Extracted Quantities export
4. Run-scoped persistence
5. Verification reads active ledger
6. Review reads active ledger
7. Overlay references ledger IDs
8. Improve extraction intelligence

## Current Accepted State

Slice 2A-visible is complete:
- Extracted Quantities worksheet exists.
- Existing QS/pricing workbook behaviour is unchanged.
- Unknown dimensions export as null/blank-null.
- Assumed-height rows remain needs_review with null height and null area.
- Clean totals include only status === "extracted".
- Evidence columns are present.

Slice 2B is implemented:
- extracted quantity rows are persisted by jobId/runId.
- active reads use active run rows.
- old rows are superseded or inactive.
- export prefers active persisted ledger rows when available.

Known debt:
The ledger still reads upstream pricing-shaped fields:
- candidate.priced
- candidate.status === "priced"

This is tracked in JEN-47. Do not clean it up unless the active issue explicitly scopes it.

## Forbidden Unless Explicitly Scoped

Do not touch these areas unless the current issue explicitly allows it:
- detector tuning
- Fenner/JM-0060 extraction hacks
- O'Neil probes
- pricing gate changes
- tolerance changes
- proof gate changes
- AI prompt changes
- correction-memory changes
- overlay migration
- review migration
- verification migration
- dead module deletion
- broad refactors

## Null and Assumption Rules

Unknown dimensions stay null.

Assumed height must not create:
- clean extracted status
- heightMm
- areaM2

Needs-review rows remain visible and excluded from clean totals.

Clean totals include only:
status === "extracted"

## Run Scope Rules

Every durable extracted quantity row must have:
- jobId
- runId

Active views must read one active run only.

Multiple runIds must not be silently mixed.

If activeRunId is missing and multiple runIds are present, fail loudly.

## Evidence Rules

Evidence must not be flattened away.

Preserve where available:
- source type
- page
- bbox
- evidence text
- scale
- witness IDs
- confidence
- warnings

This matters because verification/overlay will later show Vision AI, Vector, Text/Schedule, Human Correction, and AI Check evidence per row.

## Required Handback Format

Every Codex task handback must include:
- branch and latest commit
- changed files
- what changed
- what was intentionally not touched
- tests/checks run
- manual smoke result if applicable
- acceptance criteria passed
- warnings/debt discovered
- next recommended slice
