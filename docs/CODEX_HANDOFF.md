# Foodseyo Codex Handoff

**Updated:** 2026-07-17
**Current checkpoint:** C2.1-D complete locally; C2.1-E is next but not started

This file is intentionally operational and may change at every checkpoint. Stable product intent belongs in [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md).

## Repository position

- Current branch: `c2.1-d-exact-cache-integration`
- C2.1-D starting HEAD: `2564cc0b7407c035b3b5ac1042c8e9d2f4090f94`
- Latest completed implementation before C2.1-D: `2564cc0b7407c035b3b5ac1042c8e9d2f4090f94`
- C2.1-D delivery: the local checkpoint commit containing this handoff; use `git rev-parse HEAD` for its immutable SHA
- Local `main`: `cfbb93750c0b8f41f470963eddaf203d3b82457f`
- Local `origin/main` baseline: `d3c255d29b4029589e6f6b562a482134c0e28b99`
- Ahead/behind before the C2.1-D commit: `6/0`.
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
- project context freeze separating stable product intent, current handoff state, and the public README

Development contains four empty application tables and one migration-ledger row. Preview and Production contain no Foodseyo application tables. The local route now composes exact-cache behavior above the existing analysis flow, but no checkpoint commit has been pushed or deployed. The deployed Production application therefore remains on its existing uncached provider flow.

The C2.1-D focused suite passed 22 deterministic assertions, and the complete network-free suite passed 968 assertions. The controlled Development check used the scoped Vercel `DATABASE_URL` in process memory only, connected as `foodseyo_runtime` over a pooled TLS socket, quarantined a synthetic corrupt snapshot, persisted and re-read a valid exact snapshot, made zero provider calls, rolled back, and confirmed zero application rows afterward. No UI or user-visible copy changed, so browser visual QA was not required.

## Next checkpoint: C2.1-E

C2.1-E may add pre-provider lease acquisition, duplicate-request ownership, bounded polling, expired-owner recovery, provider-failure transitions, and the already frozen busy/indeterminate public policy.

C2.1-D deliberately creates and completes its temporary `processing` run only inside the post-provider persistence transaction. It does not prevent duplicate provider calls and must not be mistaken for the C2.1-E ownership protocol. C2.1-E must preserve fail-open behavior before ownership, prove ownership before provider execution, keep all provider calls outside database transactions, and preserve the unchanged UI/session/API behavior except for the already frozen safe busy/indeterminate cases.

Do not migrate Preview or Production, push, deploy, call OpenAI in automated tests, or start C2.1-F during C2.1-E. The D→E→F rollout gate remains mandatory: no cache rollout or deployment before C2.1-E is complete and the required C2.1-F Development integrity and concurrency validation passes.

## Delivery rules

- Run the smallest relevant checks during implementation.
- Run `pnpm verify:full` once before the final checkpoint commit.
- Run `git diff --check` and repository security validation.
- Update this handoff with the completed checkpoint, validation evidence, and exact next boundary.
- Keep secrets, environment values, raw images, menu content, and canonical results out of files and logs.
- Do not push or deploy without explicit user authorization.
