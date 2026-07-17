# Foodseyo Codex Handoff

**Updated:** 2026-07-17
**Current checkpoint:** C2.1-G rollout-readiness review complete locally; Production rollout is not approved

This file is intentionally operational and may change at every checkpoint. Stable product intent belongs in [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md).

## Repository position

- Current branch: `c2.1-g-rollout-review`
- C2.1-G starting HEAD and completed C2.1-F commit: `a010ffa5d8e0f0c0b47d17bdea36b0b70ec566cf`
- C2.1-G delivery: the local checkpoint commit containing this handoff; use `git rev-parse HEAD` for its immutable SHA
- Local `main`: `cfbb93750c0b8f41f470963eddaf203d3b82457f`
- Local `origin/main` baseline: `d3c255d29b4029589e6f6b562a482134c0e28b99`
- Ahead/behind at the committed C2.1-G checkpoint: `10/0`.
- No local checkpoint commit has been pushed or deployed.

The only untracked and unstaged files are:

- `database/Foodseyo_Database_Architecture_v1.2.docx`
- `database/Foodseyo_PostgreSQL_Schema_v1.2.sql`

They are reference artifacts only. Do not stage, modify, execute, or treat the supplied SQL as a migration.

## Source-of-truth map

| Concern | Source of truth |
| --- | --- |
| Stable product definition and long-term direction | `docs/PROJECT_OVERVIEW.md` |
| Active MVP scope and safety | `docs/product-rules.md` |
| Current checkpoint and next action | `docs/CODEX_HANDOFF.md` |
| C2.1 exact-cache behavior | `docs/database-cache-contract.md` |
| Non-secret environment and role setup | `docs/database-environment-setup.md` |
| Preview/Production rollout and recovery plan | `docs/database-rollout-plan.md` |
| Physical database shape | `src/lib/database/schema/analysis-cache.ts` and reviewed migrations |
| Canonical analysis contract | `src/domain/foodseyo-analysis.ts` and `docs/data-contract.md` |
| Historical decisions | `docs/decision-log.md` |
| Public setup and project entry point | `README.md` |

## Completed work

- T1–T5.5 mobile menu-photo experience and scope cleanup
- T6 cancelled from the MVP
- R1 development workflow optimization
- C1.1–C1.2.1 consistency, identity, live integration, and provenance correction
- C2.1-0 / C2.1-0.1 database audit and exact-cache contract freeze
- C2.1-A isolated Neon/Vercel database infrastructure
- C2.1-A.1 removal of migration credentials from Vercel application runtime
- C2.1-B exact four-table schema, reviewed Development migration, idempotency check, and least-privilege verification
- C2.1-C pooled runtime client, validated four-table repositories, atomic ready-snapshot persistence, and rollback-only Development verification
- C2.1-D exact lookup before provider construction, strict valid-hit reuse, corrupt/expired snapshot quarantine, safe uncached fallback, best-effort post-provider persistence, and rollback-only Development verification
- C2.1-E pre-provider lease ownership, duplicate coordination, bounded polling, expired-owner recovery, frozen 409/503 failure policy, strict owner persistence, and controlled PostgreSQL concurrency verification
- C2.1-F independent adversarial PostgreSQL concurrency, ambiguity, rollback, ownership, integrity, and quarantine-failure validation
- C2.1-G local rollout-readiness review, staged Preview plan, recovery design, Production go/no-go gate, and competition freeze recommendation
- project context freeze separating stable product intent, current handoff state, and the public README

Development contains four empty application tables and one migration-ledger row. Preview and Production contain no Foodseyo application tables. The local route now composes exact-cache behavior above the existing analysis flow, but no checkpoint commit has been pushed or deployed. The deployed Production application therefore remains on its existing uncached provider flow.

No UI or user-visible copy changed, so browser visual QA was not required.

## Completed C2.1-G review

The review independently inspected the local D→E→F implementation and evidence, live GitHub `main`, the linked Vercel project and active Production deployment, and all three permanent Neon branches. It performed only read-only platform and database checks. Development still has four empty application tables and one ledger entry; Preview and Production still have no application tables. No temporary Neon validation branch remains.

Vercel Fluid Compute is enabled. The project is on Hobby, has no Preview deployment, and links GitHub `main` to Production with automatic Production domain assignment. The active Ready Production deployment was created through the CLI and exposes no Git commit provenance. Vercel contains the environment-scoped pooled `DATABASE_URL` runtime contract and no `DATABASE_MIGRATION_URL`. Neon has zero snapshots, no automatic snapshot schedule, unprotected branches, and a 21,600-second history window.

The D→E→F evidence is necessary but not sufficient. Before Preview DDL, the repository needs an exact-branch migration wrapper and a target-aware full post-migration verifier; the current full verifier is Development-labelled and its Preview/Production mode verifies only schema absence. Before Production, Foodseyo also needs a Preview-proven Git SHA, a verified manual recovery point, and an immediate known-good Vercel rollback target.

The release recommendation is **NO-GO for Production**: preserve the current uncached Production analysis flow through the July 21, 2026 competition deadline. A separate Preview-only rehearsal may be authorized later, but Preview success would still require a new Production go/no-go decision. The exact staged sequence, validation matrix, rollback paths, and criteria are in [database-rollout-plan.md](./database-rollout-plan.md).

`pnpm verify:full`, `git diff --check`, and repository security validation pass at the completed worktree. The supplied DOCX and SQL references remain untracked and unstaged. No push, deployment, migration, Preview/Production mutation, live POST invocation, or OpenAI request occurred.

## Next release boundary

Do not push, deploy, migrate Preview or Production, merge `main`, invoke the live POST route, or call OpenAI without a new instruction. The next safe database action is a separately authorized Preview-only tooling and rehearsal checkpoint following `docs/database-rollout-plan.md`. Production remains explicitly blocked and must receive a fresh go/no-go review after Preview evidence exists.

## Delivery rules

- Run the smallest relevant checks during implementation.
- Run `pnpm verify:full` once before the final checkpoint commit.
- Run `git diff --check` and repository security validation.
- Update this handoff with the completed checkpoint, validation evidence, and exact next boundary.
- Keep secrets, environment values, raw images, menu content, and canonical results out of files and logs.
- Do not push or deploy without explicit user authorization.
