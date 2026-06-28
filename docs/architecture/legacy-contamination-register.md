# Legacy Contamination Register

## Purpose

Track old authority stores, compatibility paths, diagnostic tools, and risky legacy gates so they can be migrated deliberately instead of deleted blindly.

## Status Labels

- LIVE_SOURCE: still actively produces evidence or quantities
- LIVE_AUTHORITY: still acts as a user-visible authority
- LIVE_RISK: live path with contamination/drift risk
- COMPAT_ONLY: retained for compatibility during migration
- DIAGNOSTIC_ONLY: scripts/fixtures/harnesses only
- DEAD_TO_VERIFY: appears unused but must be verified before deletion
- FORBIDDEN_IN_PROD: must not feed production extraction/export
- TARGET_AUTHORITY: intended future authority

## Register

| Path / Store | Status | Reads | Writes | Risk | Migration plan |
|---|---:|---|---|---|---|
| extracted quantity ledger | TARGET_AUTHORITY | read model/export now; future verification/review/overlay | compose/projection/persistence | must remain run-scoped | keep as active quantity authority |
| extracted_quantity_rows | TARGET_AUTHORITY | active export/read model; future verification/review/overlay | Slice 2B persistence | stale rows if active run not enforced | active run only |
| Extracted Quantities worksheet | LIVE_VIEW | extractedQuantityReadModel / active persisted rows | workbook export | first visible ledger consumer | keep as read-only view |
| takeoff_runs.takeoff_json | COMPAT_ONLY / LIVE_RISK | export/review/verification paths to audit | takeoff persistence | can be fresh while other stores are stale | migrate active user-visible numbers to extracted quantity ledger |
| opening_schedule | COMPAT_ONLY / LIVE_RISK | review/export paths to audit | projection code | stale rerun rows / old review truth | migrate review to active ledger rows |
| visual_opening_audit | LIVE_SOURCE | compose/evidence paths | vision audit | useful evidence but not authority | preserve as evidence source only |
| visual_opening_corrections | LIVE_RISK | prompt memory | human correction persistence | cross-job answer priming | contain to same-job or pattern-level only |
| module_items ASSUMED rows | LIVE_SOURCE / LIVE_RISK | concept/export paths | concept assumptions | invented standard values | keep labelled assumed; never clean extracted without proof |
| signed workbook / truth fixtures | DIAGNOSTIC_ONLY / FORBIDDEN_IN_PROD | scripts/tests only | fixtures | answer-key contamination | never feed production selection/extraction |
| exterior-wall-trace.ts | DEAD_TO_VERIFY | unknown | unknown | old module confusion | verify no prod importers before quarantine |
| windows-schedule.ts | DEAD_TO_VERIFY | unknown | unknown | old module confusion | verify no prod importers before quarantine |

## Rules

Do not delete DEAD_TO_VERIFY paths in feature slices.

Do not migrate consumers without first mapping their current reads/writes.

Do not allow FORBIDDEN_IN_PROD sources into production extraction/export.
