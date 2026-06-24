# Phase 0 Preservation Manifest

Date: 24-25 Jun 2026

Purpose: freeze JEN-38 recovery long enough to make local-only work recoverable, quarantine the separate 007 repo, and keep the tracked project truth aligned with the current ledgers.

## Main repo state

- Repo: `C:\Users\Haydon\Documents\jennian-plan-iq`
- Branch: `convergence`
- Current pushed commit: `c44dc88e68477b7a7f9dd88a1d14e77bdc9fe563`
- Commit message: `docs(state): record phase 0 preservation gate`
- Local status at manifest time: clean against `origin/convergence`
- Verification on the `STATE.md` commit: pre-commit Vitest ran green with `795 passed`, `1 expected fail`, and `26 skipped`

## Current opening ledger truth

These are saved diagnostic artifacts, not regenerated values.

- Fenner: `2/17` production-priceable rows, `17.73m2` recovered priceable area, signed total `58.13m2`, shortfall `40.40m2`
- 15a: `2/15` production-priceable rows, `4.35m2` recovered priceable area, signed total `33.66m2`, shortfall `29.31m2`
- Fenner remains expected-fail overall

## Stash disposition

Original stashes were not dropped. Material stashes were copied into normal git branches and pushed.

| Stash | Description | Disposition |
| --- | --- | --- |
| `stash@{0}` | Carters stage-load rewrite WIP | Preserved and pushed as `preserve/stash-0-carters-20260624` at `a6c9a2b09b73a5d1bb707c9cda6b36614763deee`; original stash retained |
| `stash@{1}` | Exterior-wall-trace diagnostic WIP | Preserved and pushed as `preserve/stash-1-exterior-trace-20260624` at `d005b46cb22bbd06fb8d34a04de453694f96e91c`; original stash retained |
| `stash@{2}` | Line-ending noise after sync | Not promoted to branch; original stash retained as local evidence/noise until Haydon approves cleanup |
| `stash@{3}` | Line-ending noise | Not promoted to branch; original stash retained as local evidence/noise until Haydon approves cleanup |
| `stash@{4}` | Engine audit/lint WIP | Preserved and pushed as `preserve/stash-4-engine-audit-20260624` at `927ba0ebcb339d8d8ae05deaa260c7067b7c77b6`; original stash retained |
| `stash@{5}` | Entry vector/opening extraction WIP based on stale `3ba670b` | Preserved from original base and pushed as `preserve/stash-5-entry-vector-20260624` at `00aa30b1993302e5682048198b8235a68b3be5ec`; original stash retained |

## 007 dirty repo quarantine

- Dirty repo: `C:\Users\Haydon\Documents\jennian-007-v2`
- Current HEAD: `f76b95b`
- Remote: none configured
- Status: dirty working tree with tracked and untracked source changes
- Unsafe tracked artifacts: `.env`, logs, `__pycache__`, and `.pyc`
- Disallowed tracked artifact count observed: `229`
- Secret names present in tracked env files: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`
- Secret values were not printed into this manifest
- Hard rule: do not push this dirty repo as-is

## OneDrive containment check

- Literal path `C:\Users\Haydon\Documents` is a normal directory, not a reparse point or junction
- Literal dirty repo path `C:\Users\Haydon\Documents\jennian-007-v2` is also a normal directory, not a reparse point or junction
- Windows known Documents folder points to `C:\Users\Haydon\OneDrive - Jennian Homes Manawatu\Documents`
- Current evidence treats the dirty 007 secrets as contained-local, not public; key rotation remains a hygiene decision unless later sync/copy exposure is found

## Clean 007 baseline

- Clean repo: `C:\Users\Haydon\Documents\jennian-007-v2-clean`
- Initial source-only commit: `f4a331f chore: clean source-only baseline`
- Tightened commit: `bb1732d chore: remove deprecated scheduler files from clean baseline`
- Remote: none configured
- Status at manifest time: clean
- Excluded from tracked files: `.env`, logs, `__pycache__`, `.pyc`, `scheduler.py`, `scheduler.py.deprecated`, and `agents/gjgardner_agent.py.deprecated`
- Disallowed tracked-file scan at manifest time returned no matches
- This clean repo is not yet promoted to production operation

## Scheduled task boundary

- Windows task: `Jennian007v2WeeklyScrape`
- State: `Ready`
- Execute: `C:\Users\Haydon\AppData\Local\Programs\Python\Python312\python.exe`
- Arguments: `run_phase1.py`
- Working directory: `C:\Users\Haydon\Documents\jennian-007-v2`
- Last run: `21/06/2026 5:00:00 pm`
- Last result: `0`
- Next run: `28/06/2026 5:00:00 pm`
- The task still points at the old dirty repo. It must not be moved to the clean repo without Haydon approval.

## Linear gates

- `JEN-42`: Phase 0 blocker for preserved WIP and 007 quarantine
- `JEN-43`: 007 repo promotion and secrets hygiene gate
- `JEN-41`: parser/detector hardening stop-loss before more recovery
- `JEN-40`: recovery continuation, blocked until Phase 0 and JEN-41 clear
- `JEN-38`: remains the parent recovery issue, but feature work is frozen while the above gates are open

## Next allowed work

1. Finish Linear blocker comments and relations for `JEN-42`, `JEN-43`, `JEN-41`, `JEN-40`, and `JEN-38`.
2. Decide whether to promote `jennian-007-v2-clean` and whether to rotate keys as hygiene.
3. Run `JEN-41` hardening against the four-job audit before resuming `JEN-40` or deeper `JEN-38` recovery.
