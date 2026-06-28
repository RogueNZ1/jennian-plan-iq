# ADR-0003 - AI Check Is Reviewer, Not Author

## Status

Accepted

## Context

Vision AI and AI checks are useful for finding missing items, duplicates, false positives, and conflicts.

But AI output must not become an uncontrolled source of authoritative dimensions.

## Decision

AI check may:
- flag possible missing items
- flag possible duplicates
- flag false positives
- flag dimension conflicts
- flag marker misalignment
- recommend needs_review

AI check may not:
- mint authoritative dimensions
- create clean extracted status by itself
- override deterministic/vector/text/schedule evidence
- author pricing

## Consequences

Verification should later display AI check alongside Vector, Vision, Text/Schedule, Human Correction, and derived evidence.

AI check output is review evidence, not the source of truth.
