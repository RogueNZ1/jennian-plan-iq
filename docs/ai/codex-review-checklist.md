# Codex Review Checklist - Jennian IQ

Use this checklist before handback on every non-trivial Codex task.

## Authority

- Did this introduce a new quantity authority?
- Does any user-visible number bypass ExtractedQuantity ledger/read model?
- Does any view compute independent totals?
- Does export read the same authority as verification/review/overlay where migrated?

## Run Scope

- Are jobId and runId preserved?
- Can rows from multiple runs mix?
- Are stale rows excluded from active output?
- If activeRunId is missing, does the path fail loudly instead of guessing?

## Dimensions

- Are unknown dimensions null?
- Can assumed height create heightMm?
- Can assumed height create areaM2?
- Are needs_review rows excluded from clean totals?
- Are needs_review rows still visible?

## Evidence

- Is source/page/bbox/text preserved?
- Is Vision/Vector/Text/Schedule/Human/AI-check provenance preserved where available?
- Has any evidence been flattened into count-only rows?

## Scope

- Did this touch forbidden areas?
- Did this change detectors?
- Did this change pricing?
- Did this change AI prompts?
- Did this change correction memory?
- Did this touch overlay/review/verification outside scope?

## Output

- Are old workbook sheets unchanged unless explicitly scoped?
- Was a real-job smoke test run if user-visible output changed?
- Are warnings/debt reported?

## Required Handback

- changed files
- summary
- checks run
- smoke artifacts if any
- not touched
- warnings/debt
- next slice recommendation
