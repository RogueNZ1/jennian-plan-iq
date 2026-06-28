# ADR-0001 - Extracted Quantity Ledger Authority

## Status

Accepted

## Context

Jennian IQ historically allowed multiple quantity authorities:
- takeoff_json
- opening_schedule
- visual_opening_audit
- verification model
- review-only candidates
- overlay markers
- export rows

This caused split-brain outputs where review, verification, overlay, and export could disagree.

The current product need is reliable extracted numbers, not autonomous QS pricing.

## Decision

All user-visible extracted numbers must eventually flow through Extracted Quantity ledger rows.

Evidence collectors feed the ledger. Views read the ledger.

The ledger must carry:
- category
- count/dimensions
- status
- confidence
- warnings
- evidence
- jobId
- runId

## Consequences

Export, verification, review, overlay, job summary, and completion dialog must migrate toward ledger-backed display.

Old stores may remain as compatibility layers during migration, but they must not remain independent authorities.

Pricing is downstream of extraction.
