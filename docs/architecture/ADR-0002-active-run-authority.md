# ADR-0002 - Active Run Authority

## Status

Accepted

## Context

A known failure mode is stale rerun split-brain:
- fresh takeoff_json
- old review/opening rows
- verification/export/review/overlay disagree

The Extracted Quantity Ledger must not recreate this failure.

## Decision

Persisted extracted quantity rows must be scoped by jobId and runId.

Active views must read one active run only.

Old run rows may remain for history but must be superseded, inactive, or filtered out of active views.

Multiple runIds must never be silently mixed.

## Consequences

Slice 2B implements durable run-scoped persistence.

If activeRunId is missing and multiple runIds are present, the read path must fail loudly instead of guessing.
