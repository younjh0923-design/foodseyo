# Foodseyo Codex Handoff

**Updated:** 2026-07-17
**Current checkpoint:** C2.1-C ready; implementation not started

This file is intentionally operational and may change at every checkpoint. Stable product intent belongs in [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md).

## Repository position

- Current branch: `c2.1-b-analysis-cache-schema`
- Current HEAD at the start of this correction: `f34387c386f5c56fa7458f250bfa275aea0c9d8e`
- Latest implementation commit before the documentation checkpoint: `c11332d1ed3c643257e9dc533c3e4ed118879ac8`
- Implementation commit message: `feat: add analysis cache database schema`
- Local `main`: `cfbb93750c0b8f41f470963eddaf203d3b82457f`
- Local `origin/main` baseline: `d3c255d29b4029589e6f6b562a482134c0e28b99`
- Ahead/behind at the start of this correction: `4/0`.
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
- project context freeze separating stable product intent, current handoff state, and the public README

Development contains four empty application tables and one migration-ledger row. Preview and Production contain no Foodseyo application tables. The live menu-image API does not connect to PostgreSQL and still performs the existing uncached provider flow.

The C2.1-B final validation passed lint, typecheck, all 924 network-free assertions, production build, repository security validation, and `git diff --check`.

The documentation context checkpoint repeated `pnpm verify:full`: lint, typecheck, all 924 network-free assertions, production build, and repository security validation passed. `git diff --check` also passed. No UI or user-visible application copy changed, so browser visual QA was not required.

## Next checkpoint: C2.1-C

C2.1-C may implement:

- one server-only pooled PostgreSQL runtime client using only `DATABASE_URL`;
- repository modules for the four existing tables;
- Zod validation at persistence and read boundaries;
- short transactions and atomic `persistReadyAnalysisSnapshot` behavior;
- deterministic unit tests and controlled Development database verification.

C2.1-C must not:

- obtain or store `DATABASE_MIGRATION_URL` in application runtime;
- create or alter tables, write or apply another migration, or execute the supplied SQL;
- migrate Preview or Production;
- connect cache lookup to the live analysis route;
- implement lease polling, duplicate-request waiting, or public cache error behavior;
- change the provider model, prompt, canonical schema, image intake, session storage, UI, or navigation;
- make a real OpenAI request, invoke the live analysis POST route, push, or deploy.

Cache integration begins in C2.1-D, ownership/concurrency behavior in C2.1-E, real Development concurrency validation in C2.1-F, and reviewed Preview/Production rollout in C2.1-G. C2.1-D must not be rolled out or deployed before C2.1-E is complete and the required C2.1-F validation passes.

## Start-of-checkpoint checklist

1. Confirm the recorded feature branch and current HEAD.
2. Confirm no tracked or staged change exists.
3. Confirm the two reference artifacts are the only untracked files and remain unstaged.
4. Confirm local/origin divergence without pulling or rewriting the feature branch.
5. Read `AGENTS.md`, this handoff, the cache contract, environment setup, executable schema, and migration before C2.1-C work.
6. Preserve the working menu-photo pipeline and use network-free tests by default.

## Delivery rules

- Run the smallest relevant checks during implementation.
- Run `pnpm verify:full` once before the final checkpoint commit.
- Run `git diff --check` and repository security validation.
- Update this handoff with the completed checkpoint, validation evidence, and exact next boundary.
- Keep secrets, environment values, raw images, menu content, and canonical results out of files and logs.
- Do not push or deploy without explicit user authorization.
