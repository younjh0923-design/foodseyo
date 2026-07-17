# Foodseyo C2.2-D Structured-Menu Schema Draft

**Status:** Static design accepted locally; not an active schema, migration, repository, or database change

**Reviewed:** 2026-07-17

This document records the C2.2-D realization of the accepted [physical integrity contract](./database-physical-integrity-contract.md) and [structured-menu decisions](./database-structured-menu-decisions.md). Under the [Core Consistency Database Program Charter](./database-program-charter.md), it is the isolated design for the first implementation slice, not the full database objective. It remains a design checkpoint only.

## Draft artifacts

- Drizzle design: `src/lib/database/schema/structured-menu-draft.ts`
- PostgreSQL review draft: `database/drafts/c2_2_d_structured_menu_projection.sql`
- Network-free validator: `scripts/validate-structured-menu-schema-draft.mts`

The Drizzle design is deliberately absent from `src/lib/database/schema/index.ts`. `drizzle.config.ts` continues to select that active index, which exports only the four implemented C2.1 tables. The SQL draft is deliberately outside `database/migrations`; the reviewed migration directory still contains only `0000_c2_1_b_analysis_cache_schema.sql`.

Neither draft is imported by runtime code. No migration was generated, no migration metadata changed, and no database or platform was accessed.

## Drafted dependency graph

```text
analysis_snapshots (implemented C2.1 source)
  -> menu_snapshots
      -> menu_sections
      -> menu_items
          -> menu_item_prices

menu_sections (id, menu_snapshot_id)
  -> menu_items (menu_section_id, menu_snapshot_id)
```

The graph is acyclic. Every foreign-key target is a primary or candidate key, and every foreign key uses `ON DELETE RESTRICT` and `ON UPDATE RESTRICT`.

## Physical realization

### `menu_snapshots`

- immutable UUID primary key;
- one required source `analysis_snapshot_id`;
- unique `(analysis_snapshot_id, projector_version)` idempotency key;
- projector version constrained to 1–100 safe token characters;
- nullable, nonblank-if-present title and currency;
- successful projection timestamp default.

### `menu_sections`

- immutable UUID primary key;
- required owning menu snapshot;
- unique canonical category and zero-based position within a snapshot;
- unique `(id, menu_snapshot_id)` target for same-snapshot item membership;
- nonblank category ID and label.

### `menu_items`

- immutable UUID primary key;
- required owning snapshot and optional section;
- composite section foreign key proves that an assigned section belongs to the same snapshot;
- unique canonical dish and zero-based position within a snapshot;
- distinct display name, optional original name, and optional menu description;
- partial section lookup index beginning with the foreign-key columns.

### `menu_item_prices`

- immutable UUID primary key;
- required owning menu item;
- unique zero-based position and canonical price-option identity per item;
- partial unique index permits at most one base price;
- exact unconstrained PostgreSQL `numeric`, rejecting negative, `NaN`, and positive or negative infinity;
- closed `base | option` kind with relational payload checks;
- nullable currency remains unknown rather than inferred;
- no row shape for ranges, market price, conversion, option groups, or add-on deltas.

## Static integrity result

The C2.2-D validator checks:

- exactly four draft tables and no extra entity;
- every column, PostgreSQL type, nullability, and default;
- explicit primary, candidate, and partial unique keys;
- exact foreign-key columns, targets, and restrictive actions;
- all nonblank, nonnegative, closed-kind, payload, and finite-money checks;
- same-snapshot section membership;
- Drizzle/SQL table, key, constraint, and index parity;
- explicit revocation from `PUBLIC` and `foodseyo_runtime`;
- runtime grants limited to `SELECT` and `INSERT`;
- absence of update/delete grants, prohibited source payloads, credentials, destructive SQL, and seed data;
- exclusion of the draft from the active schema export and migration directory;
- zero network calls.

`pnpm validate:structured-menu-schema-draft` is included in both quick and full network-free regression entry points.

## Application-enforced invariants remain deferred

The draft intentionally does not pretend that row constraints prove aggregate correctness. C2.3 must implement and test one guarded transaction that:

- validates the exact active source snapshot before writing;
- projects every section and item exactly once in canonical order;
- projects only the C2.2-C eligible base and canonical option prices;
- assigns contiguous persisted price positions after filtering;
- checks expected and inserted row counts before commit;
- rolls back the whole aggregate on validation, constraint, insert, or commit failure;
- reuses the committed winner after an idempotency race;
- never exposes a projection whose source becomes ineligible.

No repository or transaction service is part of C2.2-D.

## C2.3 entry gate

C2.3 is the exact next checkpoint and requires a separate explicit instruction. It may promote only this reviewed draft into the active schema and prepare a reviewed Development migration, then implement the bounded aggregate transaction and adversarial PostgreSQL validation.

C2.3 must remain Development-only and must not:

- alter the four C2.1 tables or their privileges;
- add a public or live-route read path;
- add evidence artifacts, restaurant identity, culinary knowledge, users, or community entities;
- expand the accepted price, retention, or deletion scope;
- retain raw images or prohibited source payloads;
- leave validation rows or disposable child branches behind;
- migrate Preview or Production;
- push, deploy, invoke the live analysis route, or call OpenAI.

Restaurant/branch candidates, dish concepts, reviewed culinary knowledge, typed claims, semantic merging, and GPT-aware reuse are current core program work, but they are not part of C2.3. Each requires its own decision and physical-contract gate before any schema draft or migration.
