# Foodseyo Codex Handoff

**Updated:** 2026-07-17
**Current checkpoint:** C2.2-A1 culinary-contract gap audit complete locally; C2.2-B is next but not started

This file is intentionally operational and may change at every checkpoint. Stable product intent belongs in [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md).

## Repository position

- Current branch: `c2.2-a1-culinary-contract-audit`
- C2.2-A starting HEAD and preserved C2.1-G commit: `e08249182241d30a21aeebd17a0cd75e110591af`
- C2.2-A delivery: `6c11da84325373eedce5d6e5cf551912e9c8205a`
- C2.2-A1 starting HEAD: `6c11da84325373eedce5d6e5cf551912e9c8205a`
- C2.2-A1 delivery: the local checkpoint commit containing this handoff; use `git rev-parse HEAD` for its immutable SHA
- Local `main`: `cfbb93750c0b8f41f470963eddaf203d3b82457f`
- Local `origin/main` baseline: `d3c255d29b4029589e6f6b562a482134c0e28b99`
- Ahead/behind at the committed C2.2-A1 checkpoint: `12/0`.
- GitHub branch `c2.1-g-rollout-review` points to exact preserved commit `e08249182241d30a21aeebd17a0cd75e110591af`; no pull request or `main` change occurred.
- That branch push created automatic Ready Preview deployment `dpl_3xMW3EWK5PWYpAEDPPhsnSk4akSZ` from the exact Git SHA. It was not promoted, tested through the live POST route, or accompanied by a Preview database migration.
- The C2.2-A and C2.2-A1 branches and checkpoint commits have not been pushed or deployed.

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
| Future relational logical scope and ERD v3 | `docs/database-logical-model-v3.md` |
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
- C2.1-H exact C2.1-G feature-branch preservation and read-only automatic Preview provenance verification
- C2.2-A complete v2 logical audit, scoped ERD v3, entity responsibilities, relationship corrections, and unresolved decision register
- C2.2-A1 C1 culinary/sensory preservation audit, typed-claim clarification, variable-baseline contract, and materialization-failure observability boundary
- project context freeze separating stable product intent, current handoff state, and the public README

Development contains four empty application tables and one migration-ledger row. Preview and Production contain no Foodseyo application tables. The exact-cache route exists in the preserved automatic Preview build, but the absent Preview schema means that build is not a validated database rollout and its analysis POST route was not invoked. The deployed Production application remains on its existing uncached provider flow.

No UI or user-visible copy changed, so browser visual QA was not required.

## Completed C2.2-A

C2.2-A audits the external Complete ERD v2 without accepting it as an implementation plan. The v3 logical source of truth preserves the implemented C2.1 cache, narrows the next candidate to four structured-menu projection tables, defers restaurant identity until T7/T8, replaces ambiguous fact/evidence links with a future claim-parent model, and excludes persisted images, users, Passport, community, and generic audit payloads until their own decisions exist.

The audit defines entity responsibilities, v2 retain/replace/defer/exclude dispositions, ten relationship corrections, fourteen scoped product decisions, and an implementation order that treats rollout as a per-slice protocol rather than a final all-at-once phase. It creates no physical column contract, Drizzle schema, SQL, migration, repository, runtime integration, platform resource, or new capability.

The exact C2.1-G commit is now preserved on GitHub. Its automatic Vercel Preview is Ready and traceable to the exact SHA, but Preview Neon remains unmigrated, so the deployment is build provenance only and not cache rollout evidence. Production remains unchanged and uncached.

The v3 logical model and master map are [database-logical-model-v3.md](./database-logical-model-v3.md) and [database-erd-master-map-v3.mmd](./database-erd-master-map-v3.mmd).

`pnpm verify:full`, `git diff --check`, and repository security validation pass at the completed worktree. The supplied DOCX and SQL references remain untracked and unstaged. No push, deployment, migration, Preview/Production mutation, live POST invocation, or OpenAI request occurred.

## Completed C2.2-A1

C2.2-A1 compared logical ERD v3 with the canonical `FoodseyoAnalysis` types, `foodseyo-consistency-v1`, C1 repeatability decisions, and the active product and safety contracts. The C1 runtime contract was already sound; the gap was that v3's generic vocabulary and claim wording did not fully prevent a future relational design from collapsing established axes or weakening baseline semantics.

The corrected logical contract now explicitly preserves separate basic-taste, flavor-note, texture, heat, and richness axes; scale-bound heat and richness values; variable versioned baselines with range, prevalence, variability, confidence, basis, provenance, review, and lifecycle; ingredient roles distinct from menu evidence basis; strict menu precedence and unknown safety; separate source-backed heat adjustability; and exactly one relational typed detail per common claim parent. EAV, opaque claim JSON, and unverifiable polymorphic references are rejected.

Successful projection remains represented directly by one unique `menu_snapshots` row per analysis snapshot and projector version. The future physical contract must insert the snapshot and all children atomically, roll back every structural row on failure, re-read a committed winner after a uniqueness race, and keep failure observability in allowlisted safe telemetry rather than partial menu rows. A durable attempt entity requires a separate future justification.

`pnpm verify:full`, `git diff --check`, and repository security validation pass at the completed C2.2-A1 worktree. No runtime code, canonical schema, C2.1 database schema, Drizzle definition, SQL, migration, repository, database connection, platform resource, OpenAI call, push, or deployment changed.

## Next checkpoint: C2.2-B

C2.2-B is a documentation-only physical integrity contract. It starts from the C2.2-A plus C2.2-A1 logical source of truth and may specify columns, PostgreSQL types, nullability, defaults, candidate keys, foreign keys, deletion/update actions, uniqueness, checks, partial or exclusion indexes, immutability, grants, and enforcement ownership for the implemented C2.1 compatibility boundary and only `menu_snapshots`, `menu_sections`, `menu_items`, and `menu_item_prices`.

Do not create Drizzle schema code, SQL, migration files, repositories, connections, database rows, platform changes, or live-route behavior in C2.2-B. Do not push, deploy, migrate Preview or Production, merge `main`, invoke the live POST route, or call OpenAI without a separate instruction.

## Delivery rules

- Run the smallest relevant checks during implementation.
- Run `pnpm verify:full` once before the final checkpoint commit.
- Run `git diff --check` and repository security validation.
- Update this handoff with the completed checkpoint, validation evidence, and exact next boundary.
- Keep secrets, environment values, raw images, menu content, and canonical results out of files and logs.
- Do not push or deploy without explicit user authorization.
