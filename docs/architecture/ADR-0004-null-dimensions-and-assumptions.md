# ADR-0004 - Unknown Dimensions and Assumptions

## Status

Accepted

## Context

Previous logic could allow assumed standard heights to appear as authoritative dimensions or area.

The product needs useful extracted numbers without inventing missing dimensions.

## Decision

Unknown dimensions remain null.

Assumed dimensions may be shown as warnings or review evidence, but must not create:
- clean extracted status
- heightMm
- areaM2

Counts may remain useful even when dimensions are incomplete.

Example:
- window count: 1
- widthMm: 1400
- heightMm: null
- areaM2: null
- status: needs_review
- warning: height_not_extracted

## Consequences

Extraction output may include needs_review rows with null dimensions.

Clean totals include only extracted rows.

Needs-review rows remain visible and exportable separately.
