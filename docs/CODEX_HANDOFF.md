# Foodseyo Codex Handoff

**Updated:** 2026-07-17
**Current checkpoint:** C2.1-F complete locally; C2.1-G is next but not started

This file is intentionally operational and may change at every checkpoint. Stable product intent belongs in [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md).

## Repository position

- Current branch: `c2.1-f-postgres-concurrency-validation`
- C2.1-F starting HEAD and completed C2.1-E commit: `d3912cf37bb10a68a8033363046a0af6f44595d6`
- C2.1-F delivery: the local checkpoint commit containing this handoff; use `git rev-parse HEAD` for its immutable SHA
- Local `main`: `cfbb93750c0b8f41f470963eddaf203d3b82457f`
- Local `origin/main` baseline: `d3c255d29b4029589e6f6b562a482134c0e28b99`
- Ahead/behind after the C2.1-F commit: `9/0`.
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
- project context freeze separating stable product intent, current handoff state, and the public README

Development contains four empty application tables and one migration-ledger row. Preview and Production contain no Foodseyo application tables. The local route now composes exact-cache behavior above the existing analysis flow, but no checkpoint commit has been pushed or deployed. The deployed Production application therefore remains on its existing uncached provider flow.

No UI or user-visible copy changed, so browser visual QA was not required.

## Completed C2.1-F

C2.1-F adds an independent validation harness without changing the C2.1-E production path, four-table schema, or migration. It repeatedly validates one-owner/one-provider election, duplicate snapshot reuse, bounded 409 polling, indeterminate 503 handling, expired append-only recovery, provider failure before persistence, strict owner-only persistence, rollback atomicity, and ambiguous acquisition or persistence outcomes against real PostgreSQL.

The integrity matrix seeds corrupt canonical JSON, an invalid row shape, an expired snapshot, a whole-result fingerprint mismatch, and an exact-identity mismatch. It confirms the exact safe quarantine code and never returns those rows. Separate fault adapters force both unconfirmed and failed quarantine; each returns only a synthetic uncached result without ownership or replacement persistence. All provider callbacks are synthetic, and an HTTP network guard confirms zero OpenAI or other HTTP calls.

The guarded runner passed twice, with 67 assertions and four five-caller concurrency rounds on each of ephemeral Development child branches `br-morning-lake-awicgpoy` and `br-crimson-fire-awezd52r`. Each connected as `foodseyo_runtime` over pooled TLS. Both exact branches were deleted and confirmed absent. Read-only checks before and after confirmed zero application rows on permanent Development. No E contract defect required a production-code, schema, or migration correction.

`pnpm verify:full`, `git diff --check`, and repository security validation pass at the completed worktree. The supplied DOCX and SQL references remain untracked and unstaged. No push, deployment, Preview/Production change, live POST invocation, or OpenAI request occurred.

## Next checkpoint: C2.1-G

C2.1-G is the separate reviewed Preview and Production rollout checkpoint. Do not migrate Preview or Production, push, deploy, call OpenAI, or start C2.1-G without a new instruction. Completion of the local D→E→F gate does not itself authorize rollout.

## Delivery rules

- Run the smallest relevant checks during implementation.
- Run `pnpm verify:full` once before the final checkpoint commit.
- Run `git diff --check` and repository security validation.
- Update this handoff with the completed checkpoint, validation evidence, and exact next boundary.
- Keep secrets, environment values, raw images, menu content, and canonical results out of files and logs.
- Do not push or deploy without explicit user authorization.
