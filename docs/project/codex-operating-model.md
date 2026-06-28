# Codex Operating Model - Jennian IQ

## Roles

GPT / architecture gate:
- frames the slice
- defines acceptance criteria
- identifies drift
- writes Codex briefs
- reviews whether the work moves the product forward

Codex:
- implements one scoped slice
- runs tests/build/smoke
- reports changed files and warnings
- does not decide broad roadmap alone

Claude / independent audit:
- read-only contamination audits
- adversarial review
- map live/compat/dead paths
- do not implement unless explicitly scoped

Linear:
- scope contract
- acceptance criteria
- decision history

Repo docs:
- durable doctrine
- anti-drift rules
- legacy contamination register

## One-Slice Rule

One Codex task equals one Linear child issue or one clearly scoped Linear update.

No broad prompts like:
- improve extraction
- fix openings
- clean old code
- make verification better

Use scoped prompts:
- implement Slice 2C verification reads ledger only
- audit readers read-only only
- contain correction memory only

## Required Pre-Codex Checklist

Before coding:
- What slice is this?
- What is the business outcome?
- What is forbidden?
- What tests must pass?
- What manual smoke proves it?
- What warnings/debt must not be touched?

## Required Post-Codex Checklist

After coding:
- Did it touch forbidden areas?
- Did it create a new authority?
- Did it preserve nulls?
- Did it preserve evidence?
- Did it preserve runId?
- Did it update tests?
- Did it smoke test a real job if visible output changed?
- Did it update Linear or provide update text?

## Branching

Prefer:
- one branch/worktree per slice
- one commit per accepted slice
- merge only after audit/smoke
- tag major milestones

Suggested tags:
- m1-ledger-visible-pass
- m2-run-persistence-pass
- m3-verification-ledger-pass
