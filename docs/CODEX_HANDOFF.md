# Foodseyo Codex Handoff

**Updated:** 2026-07-17
**Current checkpoint:** C2.2-E core consistency database program charter complete locally; C2.3 is the exact next checkpoint and has not started

This file is intentionally operational and may change at every checkpoint. Stable product intent belongs in [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md).

## Repository position

- Current branch: `c2.2-e-database-program-charter`
- C2.2-A starting HEAD and preserved C2.1-G commit: `e08249182241d30a21aeebd17a0cd75e110591af`
- C2.2-A delivery: `6c11da84325373eedce5d6e5cf551912e9c8205a`
- C2.2-A1 starting HEAD: `6c11da84325373eedce5d6e5cf551912e9c8205a`
- C2.2-A1 delivery: `0b95e5423d706beec6d889cda8448e125a4a0f7c`
- C2.2-B starting HEAD: `0b95e5423d706beec6d889cda8448e125a4a0f7c`
- C2.2-B delivery: `b0bcae6ae7a2210ea58c7fbdd4e774ba42c9af1a`
- C2.2-C starting HEAD: `b0bcae6ae7a2210ea58c7fbdd4e774ba42c9af1a`
- C2.2-C delivery: `8e4cce4ae23826146bca3e1b7bba058c64dff41c`
- C2.2-D starting HEAD: `8e4cce4ae23826146bca3e1b7bba058c64dff41c`
- C2.2-D delivery: `9bafb1f78a6bf0988bdd759644f5aafeec7d88be`
- C2.2-E starting HEAD: `9bafb1f78a6bf0988bdd759644f5aafeec7d88be`
- C2.2-E delivery: the current committed branch tip containing this handoff
- Local `main`: `cfbb93750c0b8f41f470963eddaf203d3b82457f`
- Local `origin/main` baseline: `d3c255d29b4029589e6f6b562a482134c0e28b99`
- Ahead/behind at the committed C2.2-E checkpoint: `16/0`.
- GitHub branch `c2.1-g-rollout-review` points to exact preserved commit `e08249182241d30a21aeebd17a0cd75e110591af`; no pull request or `main` change occurred.
- That branch push created automatic Ready Preview deployment `dpl_3xMW3EWK5PWYpAEDPPhsnSk4akSZ` from the exact Git SHA. It was not promoted, tested through the live POST route, or accompanied by a Preview database migration.
- The C2.2-A, C2.2-A1, C2.2-B, C2.2-C, C2.2-D, and C2.2-E branches and checkpoint commits have not been pushed or deployed.

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
| Core database objective, three reuse paths, GPT boundary, and phased program | `docs/database-program-charter.md` |
| C2.1 exact-cache behavior | `docs/database-cache-contract.md` |
| Non-secret environment and role setup | `docs/database-environment-setup.md` |
| Preview/Production rollout and recovery plan | `docs/database-rollout-plan.md` |
| Future relational logical scope and ERD v3 | `docs/database-logical-model-v3.md` |
| Implemented physical database shape | `src/lib/database/schema/analysis-cache.ts` and reviewed migrations |
| Candidate structured-menu physical integrity contract | `docs/database-physical-integrity-contract.md` |
| Structured-menu retention, invalidation, and first-slice price decisions | `docs/database-structured-menu-decisions.md` |
| Isolated structured-menu Drizzle/SQL draft and C2.3 entry gate | `docs/database-schema-draft.md` |
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
- C2.2-B exact C2.1 compatibility mirror and bounded structured-menu PostgreSQL integrity contract
- C2.2-C Development-only retention/source-invalidation and canonical price-option scope decisions
- C2.2-D isolated Drizzle/SQL schema draft and network-free static integrity validation
- C2.2-E core database objective, three reuse paths, GPT/application authority, current/deferred scope, versions, evaluation, completion, and phased rollout charter
- project context freeze separating stable product intent, current handoff state, and the public README

Development contains four empty application tables and one migration-ledger row. Preview and Production contain no Foodseyo application tables. The exact-cache route exists in the preserved automatic Preview build, but the absent Preview schema means that build is not a validated database rollout and its analysis POST route was not invoked. The deployed Production application remains on its existing uncached provider flow.

No UI or user-visible copy changed, so browser visual QA was not required.

## Completed C2.2-A

C2.2-A audits the external Complete ERD v2 without accepting it as an implementation plan. The v3 logical source of truth preserves the implemented C2.1 cache, narrows the next candidate to four structured-menu projection tables, sequences restaurant identity behind T7/T8 evidence, replaces ambiguous fact/evidence links with a future claim-parent model, and excludes persisted images, users, Passport, community, and generic audit payloads until their own decisions exist. C2.2-E later classifies restaurant identity and culinary knowledge as gated core work without removing those prerequisites.

The audit defines entity responsibilities, v2 retain/replace/defer/exclude dispositions, ten relationship corrections, fourteen scoped product decisions, and an implementation order that treats rollout as a per-slice protocol rather than a final all-at-once phase. It creates no physical column contract, Drizzle schema, SQL, migration, repository, runtime integration, platform resource, or new capability.

The exact C2.1-G commit is now preserved on GitHub. Its automatic Vercel Preview is Ready and traceable to the exact SHA, but Preview Neon remains unmigrated, so the deployment is build provenance only and not cache rollout evidence. Production remains unchanged and uncached.

The v3 logical model and master map are [database-logical-model-v3.md](./database-logical-model-v3.md) and [database-erd-master-map-v3.mmd](./database-erd-master-map-v3.mmd).

`pnpm verify:full`, `git diff --check`, and repository security validation pass at the completed worktree. The supplied DOCX and SQL references remain untracked and unstaged. No push, deployment, migration, Preview/Production mutation, live POST invocation, or OpenAI request occurred.

## Completed C2.2-A1

C2.2-A1 compared logical ERD v3 with the canonical `FoodseyoAnalysis` types, `foodseyo-consistency-v1`, C1 repeatability decisions, and the active product and safety contracts. The C1 runtime contract was already sound; the gap was that v3's generic vocabulary and claim wording did not fully prevent a future relational design from collapsing established axes or weakening baseline semantics.

The corrected logical contract now explicitly preserves separate basic-taste, flavor-note, texture, heat, and richness axes; scale-bound heat and richness values; variable versioned baselines with range, prevalence, variability, confidence, basis, provenance, review, and lifecycle; ingredient roles distinct from menu evidence basis; strict menu precedence and unknown safety; separate source-backed heat adjustability; and exactly one relational typed detail per common claim parent. EAV, opaque claim JSON, and unverifiable polymorphic references are rejected.

Successful projection remains represented directly by one unique `menu_snapshots` row per analysis snapshot and projector version. The future physical contract must insert the snapshot and all children atomically, roll back every structural row on failure, re-read a committed winner after a uniqueness race, and keep failure observability in allowlisted safe telemetry rather than partial menu rows. A durable attempt entity requires a separate future justification.

`pnpm verify:full`, `git diff --check`, and repository security validation pass at the completed C2.2-A1 worktree. No runtime code, canonical schema, C2.1 database schema, Drizzle definition, SQL, migration, repository, database connection, platform resource, OpenAI call, push, or deployment changed.

## Completed C2.2-B

C2.2-B accepts the implemented `analysis_contracts`, `menu_evidence_sets`, `analysis_runs`, and `analysis_snapshots` shape and least-privilege boundary without alteration. It defines the non-executable candidate contract for `menu_snapshots`, flat `menu_sections`, `menu_items`, and `menu_item_prices` in [database-physical-integrity-contract.md](./database-physical-integrity-contract.md).

The candidate uses one source-snapshot foreign key instead of duplicated evidence/contract columns, `(analysis_snapshot_id, projector_version)` idempotency, flat parent-scoped ordering, a same-snapshot section composite foreign key, exact finite source-backed prices, restrictive foreign-key actions, no soft deletion, and immutable runtime access. One guarded transaction validates the source, inserts every structural row, verifies completeness, and commits or rolls back the whole aggregate. Failed attempts create no menu row and use safe structural telemetry.

No C2.1 object changes. No Drizzle schema, SQL, migration, repository, connection, database row, database or platform access, runtime behavior, OpenAI request, push, or deployment occurred. `pnpm verify:full`, `git diff --check`, and repository security validation pass. The supplied DOCX and SQL remain untracked and unstaged.

## Completed C2.2-C

C2.2-C closes P-04 and P-06 for the bounded structured-menu slice in [database-structured-menu-decisions.md](./database-structured-menu-decisions.md). The first implementation remains internal to Development with no public read path, projection TTL, row deletion, soft deletion, or runtime mutation. Source invalidation or expiry immediately makes a projection ineligible without mutating it. Validation must use rollback or disposable Development child branches and leave no application rows or temporary branches.

The first price slice includes an eligible base price plus eligible non-null canonical `priceOptions` in source order. It preserves exact amount, nullable currency, display text, option identity, and label. It excludes `MenuOption.additionalPrice`, null or unsupported prices, ranges, market-price markers, inference, conversion, option groups, and add-on deltas. Raw-image retention remains prohibited.

No Drizzle schema, SQL, migration, repository, connection, database row, database or platform access, runtime behavior, OpenAI request, push, or deployment occurred. `pnpm verify:full`, `git diff --check`, and repository security validation pass. The supplied DOCX and SQL remain untracked and unstaged.

## Completed C2.2-D

C2.2-D realizes only `menu_snapshots`, flat `menu_sections`, `menu_items`, and `menu_item_prices` as an isolated Drizzle design and PostgreSQL review draft. Exact columns, types, nullability, defaults, keys, restrictive foreign-key actions, same-snapshot section integrity, finite numeric prices, partial indexes, and `SELECT`/`INSERT` runtime grants match C2.2-B/C.

The Drizzle draft is not exported by the active schema index. The SQL draft is outside `database/migrations`, which still contains only the reviewed C2.1-B migration. The 42-check network-free validator confirms Drizzle/SQL parity, least privilege, no C2.1 alteration, no prohibited payload or credentials, and no active schema or migration expansion.

No migration was generated or executed. No repository, transaction service, database connection, database or platform access, runtime behavior, OpenAI request, push, or deployment occurred. `pnpm verify:full`, `git diff --check`, and repository security validation pass. The supplied DOCX and SQL remain untracked and unstaged.

The durable draft review and application-level invariants still required are in [database-schema-draft.md](./database-schema-draft.md).

## Completed C2.2-E

C2.2-E corrects the forward-looking database-program scope without changing the live MVP or activating a schema. The primary objective is now faster, semantically consistent, evidence-aware, versioned, safely reusable analysis with less unnecessary repeated full-provider reasoning.

The charter defines three non-interchangeable paths: exact canonical snapshot reuse, semantic dish and reviewed culinary-knowledge reuse, and restaurant/branch-scoped reuse. Structured-menu projection remains the first bounded implementation slice. Restaurant/branch candidates, dish concepts and aliases, reviewed culinary profiles, separate sensory knowledge, ingredient roles, typed menu claims, deterministic effective merging, and GPT-aware context retrieval are current core program work, but remain sequenced behind their own evidence, decision, physical-contract, Development-validation, and rollout gates.

The charter preserves `source_stated > inferred_from_source > reviewed culinary_baseline > unknown`, strict unknown safety, separate C1 axes, scale-bound heat/richness, ingredient-role separation, exactly one relational typed detail per claim, orthogonal generation/review/lifecycle, and full version/provenance capture. Accounts, Food Passport, personalization, community, and permanent raw-image storage remain deferred.

The isolated C2.2-D Drizzle/SQL draft remains outside the active schema export and migration directory. The active migration set remains only `0000_c2_1_b_analysis_cache_schema.sql`. No product implementation, schema activation, migration, repository, database/platform access, OpenAI call, push, or deployment occurred.

The new 18-check network-free charter validator, `pnpm verify:quick` with 318 assertions, `pnpm verify:full` with 1,025 assertions, `git diff --check`, and repository security validation pass at the completed worktree. No UI or user-visible copy changed, so browser visual QA was not required. The supplied DOCX and SQL references remain untracked and unstaged.

## Next checkpoint: C2.3

C2.3 is the one exact next checkpoint and requires a separate explicit instruction. It may promote only the reviewed four-table draft into the active schema, prepare and apply a reviewed Development-only migration, implement the atomic structured-menu projection transaction, and perform deterministic plus real PostgreSQL adversarial validation. Validation must leave no application rows or temporary Development branches.

Do not alter C2.1 tables, add a public or live-route read path, expand entity or price scope, retain source images, migrate Preview or Production, push, deploy, merge `main`, invoke the live POST route, or call OpenAI without a separate instruction.

## Delivery rules

- Run the smallest relevant checks during implementation.
- Run `pnpm verify:full` once before the final checkpoint commit.
- Run `git diff --check` and repository security validation.
- Update this handoff with the completed checkpoint, validation evidence, and exact next boundary.
- Keep secrets, environment values, raw images, menu content, and canonical results out of files and logs.
- Do not push or deploy without explicit user authorization.
