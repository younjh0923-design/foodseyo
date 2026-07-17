# Foodseyo C2.3 Structured-Menu Projection

**Status:** Complete locally in Development; not connected to a live read path and not rolled out to Preview or Production

**Reviewed:** 2026-07-17

## Implemented boundary

C2.3 promotes only the four-table C2.2-B/C/D design:

- `menu_snapshots`
- `menu_sections`
- `menu_items`
- `menu_item_prices`

The existing C2.1 tables and contracts are unchanged. The active Drizzle source
is `src/lib/database/schema/structured-menu.ts`; the reviewed migration is
`database/migrations/0001_c2_3_structured_menu_projection.sql`.

There is no route, API, UI, provider, cache-read, or user-visible integration.
The structured projection remains a Development-only internal data capability.

## Projection layers

The implementation separates three responsibilities:

1. `buildStructuredMenuProjection` parses a valid canonical result and builds a
   persistence DTO before the transaction;
2. the structured-menu repository performs parameterized source reads, child
   reads, inserts, and aggregate count checks;
3. `materializeStructuredMenuSnapshot` revalidates the exact source under a
   transaction lock, inserts the full aggregate, validates the stored result,
   and commits or rolls back everything.

The source snapshot must exist, belong to a `ready` analysis run, remain active
and unexpired, pass canonical structural and semantic validation, match its
source and five-part analysis contract, match its whole-result fingerprint,
contain a non-failed result, and contain a menu with at least one dish.

Every eligible read repeats the source guard. A later invalidation or expiry
makes the existing projection ineligible without mutating it.

## Deterministic mapping

- menu title and currency preserve the canonical value, with blank optional
  text normalized to null;
- categories become flat sections in canonical array order;
- dishes become items in canonical array order and retain their optional
  same-snapshot section;
- display name, original name, and menu description remain separate;
- every category and dish is represented exactly once;
- persisted child positions are zero-based and contiguous.

Price rows include only:

1. an eligible base price, first; and
2. eligible non-null canonical `priceOptions`, in source order.

Eligibility requires `available` evidence, `direct_observation` or
`external_source` basis, at least one source ID, and finite nonnegative money
with nonblank display text. The projector excludes null or unsupported prices,
market/range/inferred/converted values, and every
`MenuOption.additionalPrice`. Currency remains nullable and amounts are
persisted as exact PostgreSQL `numeric`.

## Atomicity and idempotency

`(analysis_snapshot_id, projector_version)` is the successful-materialization
identity. The first transaction inserts one header, all sections, all items,
and all eligible prices, verifies actual aggregate counts, re-reads the stored
aggregate, and commits only when it exactly matches the prepared DTO.

Any validation, constraint, count, insert, read-back, or commit failure rolls
back all four tables. A concurrent loser recognizes only the exact
`menu_snapshots_source_projector_uk` conflict, rolls back, and then revalidates
the committed winner and its still-eligible source before returning it.

## Development migration and privileges

The reviewed migration was rehearsed on a disposable child of the permanent
Development branch and then applied only to Development branch
`br-dark-cherry-awci0faj`.

- migration ledger: `public.__drizzle_migrations`
- ledger count: `2`
- application tables: `8`
- permanent Development application rows after validation: `0`
- owner of the four C2.3 tables: `foodseyo_migrator`
- `foodseyo_runtime`: `SELECT`, `INSERT`
- runtime `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`, schema
  `CREATE`, ownership, and migration-ledger access: absent

Migration credentials were resolved only inside the controlled operator
process and were not written to repository files, logs, Vercel variables, or
documentation.

## Validation evidence

Network-free validation covers active schema/migration parity, the accepted
C2.2-D constraint identities, DTO construction, price filtering, order,
duplicate reuse, uniqueness-race recovery, aggregate rollback, source
invalidation, source expiry, and absence of route/OpenAI integration.

Real PostgreSQL validation on an isolated Development child branch covered:

- normal projection, ordered read-back, and exact aggregate counts;
- idempotent duplicate reuse;
- two concurrent callers producing one committed winner and one validated
  reuse result;
- a forced failure after completeness checks rolling back all four tables;
- rejection of cross-snapshot section membership;
- negative, `NaN`, infinite, duplicate-base, and incomplete-option prices;
- invalid source producing zero projection rows;
- source expiry making an already persisted projection ineligible.

The controlled run made zero OpenAI calls. Its exact disposable branch was
deleted and confirmed absent before the permanent Development migration.

## Boundary after C2.3

C2.3 does not authorize a public projection read path, live analysis-route
integration, C2.1 cache rollout, Preview/Production migration, restaurant or
branch tables, dish concepts, culinary profiles, typed menu claims, semantic
merging, raw-image storage, push, or deployment.

The next core-program boundary is a separately authorized T7 source-acquisition
contract checkpoint covering URL normalization, SSRF defense, source
classification, and evidence preservation before restaurant/branch identity
work.
