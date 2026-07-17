# Foodseyo C2.2-C Structured-Menu Decisions

**Status:** Accepted locally for the bounded structured-menu slice; no schema, migration, database, or runtime change

**Reviewed:** 2026-07-17

This document is the product and security decision source of truth for the next structured-menu slice. It closes only P-04 and P-06 from the logical model. Decisions for evidence artifacts, restaurant identity, culinary knowledge, users, and community remain deferred and do not block this slice.

The decisions below authorize C2.2-D to prepare an unexecuted Drizzle and SQL draft for the four candidate projection tables. They do not authorize a migration, a database connection, a repository, live-route integration, a public read path, Preview or Production changes, or deployment.

## Reviewed contract boundary

The accepted C2.1 source remains the exact, validated `analysis_snapshots` row. The bounded projection remains:

- `menu_snapshots`;
- flat `menu_sections`;
- `menu_items`;
- `menu_item_prices`.

The canonical analysis already distinguishes:

- `dish.price`, the optional base `Money`;
- `dish.priceOptions[]`, labeled canonical price alternatives with their own IDs, optional `Money`, order, and evidence;
- `dish.options[].additionalPrice`, an add-on amount whose option-group semantics are outside the four-table slice.

`Money` contains an exact finite nonnegative amount, nullable currency, and nonblank display text. Every price field has separate claim evidence. The projection does not invent a price, infer a currency, convert an amount, or treat unknown as zero.

## P-04 — Projection retention and source invalidation

### Decision

The first implementation is an internal Development-only projection with no application read path and no public or user-visible consumer.

Projection rows are immutable historical derivatives of one source analysis snapshot. The first slice has no projection TTL, automatic row deletion, soft deletion, cascade deletion, or runtime cleanup operation. Its foreign keys remain `ON DELETE RESTRICT`, and `foodseyo_runtime` receives no `UPDATE` or `DELETE` privilege on the four projection tables.

Projection eligibility never outlives source eligibility:

1. A reader must join through `menu_snapshots.analysis_snapshot_id`.
2. The source snapshot must still be structurally valid, semantically valid, exact-contract valid, non-invalidated, and unexpired at read time.
3. An invalidated or expired source snapshot makes every projection derived from it immediately ineligible.
4. Source invalidation does not mutate or delete projection rows.
5. A projection can never be used as an independent fallback after its source becomes ineligible.

Because C2.3 remains Development-only and has no live read integration, validation data must be isolated through transaction rollback or disposable Neon Development child branches. Validation must leave no application rows or temporary child branches behind. Removing an exact disposable child branch is environment cleanup, not an application row-deletion policy.

### Security and privacy consequences

- This decision does not authorize permanent source-image storage. Raw images, filenames, Base64, and per-image hashes remain transient and absent from the projection.
- Projection rows may contain structured menu text and price observations, so they remain server-only and excluded from logs and safe telemetry.
- No user, tenant, account, or personal profile is introduced. RLS is therefore not part of this slice.
- Preview or Production rollout remains blocked until a separate release decision defines the retention clock, deletion authority, source/projection deletion order, operational cleanup, recovery, and least-privilege verification for the target environment.

### Why this is sufficient now

The Development slice needs deterministic projection, idempotency, and rollback evidence, not a speculative production retention service. Restrictive references preserve auditability and avoid silently erasing derived data while the product has no approved public structured-menu read behavior.

## P-06 — First-slice price scope

### Decision

The first implementation includes both:

- at most one eligible base price from `dish.price`; and
- every eligible non-null canonical price option from `dish.priceOptions[]`.

A base price or price option is eligible only when all of the following are true:

- its `Money` value is non-null;
- evidence availability is `available`;
- evidence basis is `direct_observation` or `external_source`;
- at least one valid source ID is present;
- the amount is finite and nonnegative;
- display text is nonblank.

The projector builds one ordered eligible-price sequence per menu item:

1. the base price first, when eligible;
2. eligible canonical price options in their original array order.

Persisted rows receive contiguous zero-based positions in that sequence. A base row retains `price_kind = base`; an option row retains `price_kind = option`, its canonical price-option ID, and its label. Amount, nullable currency, and display text are copied exactly from canonical `Money`.

### Explicit exclusions

The first slice does not store:

- `dish.options[].additionalPrice`;
- a canonical price option whose `price` is null;
- a numeric price with unsupported, unavailable, insufficient, or unconfirmed evidence;
- ranges, “from” prices, market-price markers, inferred prices, estimates, or ordering totals;
- option groups, option values, quantities, modifiers, or add-on-delta semantics;
- currency conversion, exchange rates, currency inference, or normalized display values.

An item with no eligible price remains a valid item with no `menu_item_prices` row. Zero is stored only when the source-backed canonical `Money` explicitly contains zero; zero is never a missing-value fallback.

### Why canonical price options are included

Canonical `priceOptions` already have stable IDs, labels, order, `Money`, and independent evidence. They fit the reviewed `menu_item_prices` contract without inventing option-group semantics. Excluding them would discard source-backed price observations that the existing canonical contract deliberately preserves.

`MenuOption.additionalPrice` is different: persisting the delta without its option group and value would remove the context needed to interpret it safely. It remains deferred to a later bounded option model.

## C2.2-D entry gate

C2.2-D may draft only the four accepted projection tables and their static validation. The draft must preserve:

- one immutable source-snapshot reference and `(analysis_snapshot_id, projector_version)` idempotency;
- flat ordered sections and items with same-snapshot section integrity;
- the exact P-06 eligibility filter, price ordering, and exclusions above;
- one aggregate transaction with complete rollback on any failure;
- source eligibility as a mandatory read guard;
- restrictive foreign-key actions and immutable `SELECT`/`INSERT` runtime access;
- no public read path, live-route integration, or database execution.

C2.2-D must remain an unexecuted design checkpoint. C2.3, any Development migration, and any Preview or Production action require separate authorization.

The completed static realization is recorded in [database-schema-draft.md](./database-schema-draft.md). It does not broaden these decisions or authorize execution.
