# Foodseyo Codex Handoff

**Updated:** 2026-07-17
**Current checkpoint:** C2.3 Development-only structured-menu projection complete and published for team review; no live read path or rollout

This file is intentionally operational and may change at every checkpoint.
Stable product intent belongs in [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md).

## Repository position

- Current branch: `c2.3-structured-menu-projection`
- C2.3 starting HEAD: `0db6d2207d80936b00ca84b1e9640696578137fe`
- C2.3 implementation checkpoint: `bbb09f4e506f4572724a5fd5835cd3fa1bceae4e`
- C2.3 review delivery: the current committed branch tip containing the
  collaboration documentation
- Local `main`: `cfbb93750c0b8f41f470963eddaf203d3b82457f`
- Local `origin/main` baseline: `d3c255d29b4029589e6f6b562a482134c0e28b99`
- Ahead/behind at the review-publication commit: `18/0`
- The cumulative `c2.3-structured-menu-projection` branch is published with
  upstream tracking and a draft pull request for team review.
- The draft pull request is review provenance only. It is not merge,
  Preview/Production migration, or deployment approval.
- Intermediate checkpoint branch pointers remain documented locally rather
  than being pushed separately. Every checkpoint commit is reachable from the
  cumulative review branch.
- GitHub `main`, the preserved `c2.1-g-rollout-review` branch, and its automatic
  Vercel Preview were not changed.
- The complete branch map and collaboration boundary are in
  `docs/collaboration-branch-map.md`.

The only untracked and unstaged files are:

- `database/Foodseyo_Database_Architecture_v1.2.docx`
- `database/Foodseyo_PostgreSQL_Schema_v1.2.sql`

They are reference artifacts only. Do not stage, modify, execute, or treat the
supplied SQL as a migration.

## Environment position

- Neon project: `lucky-shadow-32441683`
- Permanent Development branch: `br-dark-cherry-awci0faj`
- Development application tables: `8`
- Development migration ledger rows: `2`
- Development application rows after validation: `0`
- C2.3 table owner: `foodseyo_migrator`
- C2.3 runtime privileges: `SELECT`, `INSERT`
- C2.3 runtime mutation, DDL, ownership, and migration-ledger access: absent
- Preview and Production: no Foodseyo application tables and no C2.3 migration
- Vercel: unchanged
- Production application: unchanged uncached flow

Migration credentials were handled only inside the controlled operator
process. No credential or connection value was printed, persisted, pulled into
the repository, or stored in Vercel.

## Source-of-truth map

| Concern | Source of truth |
| --- | --- |
| Stable product definition and long-term direction | `docs/PROJECT_OVERVIEW.md` |
| Active MVP scope and safety | `docs/product-rules.md` |
| Current checkpoint and next action | `docs/CODEX_HANDOFF.md` |
| GitHub review branch and checkpoint pointers | `docs/collaboration-branch-map.md` |
| Core database objective and phased program | `docs/database-program-charter.md` |
| C2.1 exact-cache behavior | `docs/database-cache-contract.md` |
| Implemented active database schema | `src/lib/database/schema/index.ts` |
| Reviewed migrations | `database/migrations` |
| C2.3 physical contract | `docs/database-physical-integrity-contract.md` |
| C2.3 price, retention, and invalidation decisions | `docs/database-structured-menu-decisions.md` |
| C2.3 implementation and Development evidence | `docs/database-structured-menu-projection.md` |
| Historical C2.2-D review | `docs/database-schema-draft.md` |
| Canonical analysis contract | `src/domain/foodseyo-analysis.ts` and `docs/data-contract.md` |
| Historical decisions | `docs/decision-log.md` |

## Completed C2.3

C2.3 promotes exactly four structured-menu tables:

- `menu_snapshots`
- `menu_sections`
- `menu_items`
- `menu_item_prices`

The existing C2.1 schema was not altered. The active schema is
`src/lib/database/schema/structured-menu.ts`; the reviewed migration is
`database/migrations/0001_c2_3_structured_menu_projection.sql`.

The implementation has three layers:

1. a deterministic canonical-to-projection DTO builder;
2. a parameterized structured-menu repository;
3. an atomic materializer service.

The service validates the source snapshot before the transaction and again
under a source/run lock inside the transaction. The source must be ready,
active, unexpired, structurally and semantically valid, exact-contract valid,
whole-result-fingerprint valid, non-failed, and contain at least one dish.

The projector preserves category, dish, and eligible price order and counts.
It stores only source-backed base prices and canonical price options under the
C2.2-C evidence contract. It never persists `additionalPrice`, null,
market/range/inferred/converted, or unsafe price data.

One transaction inserts the header and all children, verifies exact aggregate
counts, re-reads the stored result, and commits only if it exactly matches the
prepared DTO. Any failure rolls back all four tables. The unique
`(analysis_snapshot_id, projector_version)` identity produces one concurrent
winner; the loser revalidates the complete winner and its source before reuse.

## Validation evidence

Network-free:

- active Drizzle/migration/C2.2-D parity: `43` checks
- projection builder/repository/materializer: `14` checks
- zero external network or OpenAI calls

Real PostgreSQL on a disposable Development child:

- migration ledger rehearsal: `1 -> 2`, one migration applied
- `15` adversarial assertions
- normal ordered projection and read-back
- duplicate idempotency
- concurrent one-winner/one-reuse behavior
- forced rollback leaving all four projection tables at zero rows
- same-snapshot composite foreign-key enforcement
- negative, `NaN`, infinite, duplicate-base, and incomplete-option rejection
- invalid source producing zero rows
- expired source making an existing projection ineligible
- pooled TLS runtime as `foodseyo_runtime`
- zero OpenAI calls

The exact successful disposable branch was
`br-autumn-breeze-aw0n7du8`; it was deleted and confirmed absent.

The same migration was then applied only to permanent Development. Read-only
verification confirmed eight application tables, zero application rows, two
ledger rows, migrator ownership, runtime `SELECT`/`INSERT`, and absence of
prohibited privileges.

No UI or user-visible copy changed, so browser visual QA was not required.

## Next boundary

The next core-program boundary is a separately authorized T7
source-acquisition contract checkpoint. It should define URL normalization,
SSRF defense, source classification, and preserved evidence before any
restaurant/branch identity schema or implementation.

Do not infer authorization to:

- connect structured projection reads to the live analysis route;
- alter the C2.1 cache rollout gate;
- migrate Preview or Production;
- add restaurant, branch, dish-concept, culinary-knowledge, typed-claim,
  semantic-merge, user, Passport, or community tables;
- retain raw images or prohibited source payloads;
- make another push without explicit authorization, deploy, merge `main`,
  invoke the live POST route, or call OpenAI.

## Delivery rules

- Run the smallest relevant checks during implementation.
- Run `pnpm verify:full` once before the next final checkpoint commit.
- Run `git diff --check` and repository security validation.
- Keep the two supplied reference artifacts untracked and unstaged.
- Keep secrets, environment values, raw images, menu content, and canonical
  results out of files and logs.
- Do not push or deploy without explicit user authorization.
