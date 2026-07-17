# C2.1 database and exact-cache contract

This file is the current source of truth for the C2.1 database/cache contract. The supplied `Foodseyo_Database_Architecture_v1.2.docx` and `Foodseyo_PostgreSQL_Schema_v1.2.sql` remain reference artifacts. Where they differ from this file, this file governs C2.1. The executable Drizzle schema and first reviewed Development migration were created in C2.1-B; the formal architecture artifact can be regenerated from the implemented schema afterward.

The contract-freezing checkpoint did not create a database, implement cache lookup or PostgreSQL repositories, acquire a real lease, persist a snapshot, or change the live API response. C2.1-B implemented only the physical schema and first Development migration. C2.1-C implemented the isolated runtime client and repository primitives. C2.1-D composed exact lookup, quarantine, provider bypass, and best-effort persistence into the local analysis route. C2.1-E implements the frozen pre-provider ownership and public busy/indeterminate policy locally. C2.1-F independently validates that implementation against adversarial real-PostgreSQL behavior in Development. The exact C2.1-G commit is preserved on a GitHub feature branch and has an automatic Git-sourced Preview build, but the Preview database remains unmigrated, the live POST route was not invoked, and Production remains on the uncached flow.

## Physical implementation status

C2.1-B defines exactly `analysis_contracts`, `menu_evidence_sets`, `analysis_runs`, and `analysis_snapshots` in `src/lib/database/schema/analysis-cache.ts`. The reviewed migration is `0000_c2_1_b_analysis_cache_schema` and its ledger is `public.__drizzle_migrations`.

The migration was applied once to Neon Development (`br-dark-cherry-awci0faj`) and a second run applied zero migrations. Preview (`br-misty-breeze-awy83urg`) and Production (`br-blue-night-awieb03l`) were verified through read-only transactions and were not migrated.

C2.1-C adds:

- a server-only module-scoped `pg.Pool` configured from `DATABASE_URL` only;
- a five-connection application pool attached to Vercel Fluid Compute lifecycle handling;
- parameterized repositories for all four tables;
- strict Zod validation for repository inputs and database rows;
- canonical structural, semantic, exact-contract, and whole-snapshot fingerprint validation;
- one short atomic transaction that locks the owned, unexpired processing run, inserts the ready snapshot, and transitions that run to `ready`.

The controlled Development verification connected as `foodseyo_runtime` through the pooled TLS contract, exercised all four repositories, re-read the validated canonical snapshot, and rolled the transaction back. All four application tables had zero rows before and after verification. No schema, migration, Preview/Production database, live API route, or provider path changed.

C2.1-D adds:

- complete source and five-value contract preparation before cache lookup or provider construction;
- strict active-snapshot inspection with structural, semantic, exact-identity, and whole-snapshot fingerprint validation;
- guarded, non-destructive quarantine for corrupt or expired snapshots;
- valid-hit provider bypass with the unchanged canonical API response;
- fail-open uncached analysis for cache-read failures and unconfirmed quarantine, without replacement persistence;
- best-effort persistence of a validated live result, with run creation, snapshot insert, and `ready` transition contained in one short post-provider transaction;
- privacy-safe cache read/write state and provider-call-count observation.

The C2.1-D post-provider transaction is deliberately not the C2.1-E ownership protocol. Its `processing` run is created and transitioned entirely inside the final transaction, so no lease is exposed before or during the provider request. It does not prevent duplicate provider calls, poll another owner, recover an expired lease, or add a new public cache error. A concurrent persistence conflict rolls back and returns the already validated live result uncached. C2.1-E must move ownership acquisition before provider execution and implement the frozen concurrency and failure policy.

The controlled C2.1-D Development verification used the same pooled TLS runtime role inside one outer transaction. It inserted a synthetic corrupt snapshot, confirmed guarded quarantine, persisted a valid replacement, re-read it as an exact hit, made zero provider calls, rolled back, and confirmed all four application tables still had zero rows. No DDL, migration credential, OpenAI request, live POST invocation, Preview/Production operation, push, or deployment occurred.

C2.1-E adds:

- one short acquisition transaction that locks the current processing attempt, returns an active owner as busy, or atomically fails an expired attempt as `LEASE_EXPIRED` and inserts the next attempt;
- application-generated proposed run UUID recovery after an ambiguous acquisition outcome;
- a strict ownership object carried from acquisition through provider execution, guarded failure transition, and atomic ready persistence;
- duplicate polling for at most 2 seconds at a fixed 200-millisecond interval, within the frozen 100–250 millisecond bounds;
- retryable HTTP 409 `ANALYSIS_IN_PROGRESS` with `Retry-After: 2`, and retryable HTTP 503 `ANALYSIS_TEMPORARILY_UNAVAILABLE`;
- pre-ownership-only uncached fail-open behavior and fail-closed behavior from the moment acquisition may have created state;
- deterministic concurrency, corruption, ambiguous-acquisition, expired-lease, owner-only persistence, and public-response validation with zero network or OpenAI calls.

The C2.1-E implementation and deterministic suite are complete in the local worktree. The controlled real PostgreSQL verifier passed independently on ephemeral Development child branches `br-damp-poetry-awrh7604` and `br-wild-recipe-awnapjbv`. Each run connected over pooled TLS as `foodseyo_runtime`, verified exactly one owner and one provider call, duplicate snapshot reuse, active-owner 409 behavior, strict owner persistence, expired-lease recovery, and zero OpenAI calls. Both exact child branches were deleted by the guarded cleanup path. C2.1-F remained a separate required integrity and concurrency gate and is completed by the independent validation below.

C2.1-F adds no product capability, schema, migration, or Production behavior. Its independent validator runs four five-caller contention rounds per ephemeral branch and covers one-owner/one-provider election, completed-snapshot reuse, bounded 409 polling, indeterminate 503 behavior, append-only expired-lease recovery, owner failure, strict owner-only persistence, rollback before commit, ambiguous acquisition and persistence outcomes, and corrupt, invalid, expired, fingerprint-corrupt, or identity-mismatched snapshots. It also forces both unconfirmed and failed quarantine outcomes and confirms that neither path returns corrupt data or persists a replacement.

The C2.1-F validator passed with 67 assertions on each of ephemeral Development child branches `br-morning-lake-awicgpoy` and `br-crimson-fire-awezd52r`. Both used pooled TLS as `foodseyo_runtime`, made zero HTTP or OpenAI calls, and were deleted and confirmed absent. Read-only checks before and after the runs confirmed zero application rows on permanent Development. No C2.1-E contract defect required a Production-code, schema, or migration correction.

## Exact identity and immutable contracts

The exact-cache identity is the exact evidence identity plus the five-value analysis contract:

- evidence identity: `source_fingerprint` and `fingerprint_version`;
- analysis contract: resolved model, prompt, provider schema, canonical schema, and consistency profile versions.

`SOURCE_FINGERPRINT_VERSION` is `foodseyo-source-fingerprint-v1`. It is metadata stored beside the fingerprint and is not included in the existing source-hash input. The existing image count, image selection order, image-byte hashes, restaurant identifier normalization, and source-fingerprint output remain unchanged.

`analysis_contracts` is append-only. A row is uniquely identified by the five version values. A contract row is never updated to represent new behavior; a changed value creates or resolves to another row.

`menu_evidence_sets` identifies the exact transient input through `(source_fingerprint, fingerprint_version)`. The active application input `menu_images` maps to database `input_kind = uploaded_menu_images`. Image count is retained, but raw images, Base64, filenames, per-image hashes, and EXIF data are not persisted.

## Whole-snapshot result fingerprint

`createSnapshotResultFingerprint` accepts only a structurally and semantically valid `FoodseyoAnalysis`. It hashes the complete canonical object that would be written to `analysis_snapshots.canonical_result_json`, using stable recursive JSON serialization and SHA-256. The format is:

`foodseyo-snapshot-result-v1:<lowercase-sha256-hex>`

This fingerprint describes the exact immutable stored JSON object. It is not based on provider raw output, does not hash uploaded image bytes again, does not claim semantic equivalence between separate analyses, does not replace the source cache key, and is not globally unique. It is a non-unique diagnostic and immutable-snapshot identity index. Existing dish fingerprints and per-dish result fingerprints remain separate and unchanged. Fingerprints must never be logged.

## Runs, ownership, and leases

`analysis_runs` preserves every attempt. Before acquisition begins, the application generates the run UUID that will identify that proposed owner. The lease duration is 120 seconds. At most one unexpired `processing` owner may exist for an evidence/contract pair.

Guarded state transitions are `processing -> ready` and `processing -> failed`. An attempt row is never overwritten or reused as another attempt. Attempt numbers increase within the evidence/contract pair.

### Active owner

Do not call the provider. Poll for a valid snapshot for at most 2 seconds. Polling intervals are between 100 and 250 milliseconds; a future implementation may add bounded jitter within those limits. Return a valid snapshot if it appears. Otherwise return retryable `ANALYSIS_IN_PROGRESS` with HTTP 409 and a `Retry-After` target of 2 seconds.

### Expired owner

In one short transaction:

1. guard the old row as the currently expired `processing` attempt;
2. transition it to `failed`, set `safe_error_code = LEASE_EXPIRED`, set `finished_at` and `updated_at`, and clear `lease_expires_at` as required by the final state check;
3. insert a new `processing` attempt with `attempt_number + 1`, a new application-generated run UUID, and a new lease.

The expired row remains as audit history.

### Indeterminate acquisition

Re-read once by the application-generated run UUID. If that row exists in `processing`, this request owns the lease. If another active run exists, treat the request as busy. If ownership still cannot be proven, do not call the provider and return retryable `ANALYSIS_TEMPORARILY_UNAVAILABLE` with HTTP 503.

No transaction or row lock remains open during an OpenAI request. Acquisition and final persistence use separate short transactions. Snapshot insertion and the owned run's `ready` transition are one atomic transaction.

## Snapshot integrity and replacement

An `analysis_snapshots` row belongs to one evidence set, one contract, and the ready run that produced it. A composite foreign key must guarantee that the run has the same evidence and contract. Repository guards must require the run to be the owned `processing` attempt before the atomic final transaction and `ready` after it. After commit:

- a `ready` run never exists without its snapshot;
- a snapshot never exists for a non-ready run;
- canonical JSON and its result fingerprint are immutable;
- only `last_accessed_at`, `invalidated_at`, and `safe_invalidation_code` may change under their specific rules.

The v1.2 design is corrected with two nullable columns:

- `invalidated_at timestamptz`;
- `safe_invalidation_code text`.

Both are null for an active snapshot. Invalidation changes `invalidated_at` once from null to a timestamp and adds one nonblank safe code in the same guarded update. A future CHECK requires the two columns to be either both null or both populated. Invalidated rows remain for audit and are never cache hits.

The v1.2 table-level `UNIQUE(menu_evidence_set_id, analysis_contract_id)` is replaced by an active-snapshot partial unique index equivalent to:

```sql
UNIQUE (menu_evidence_set_id, analysis_contract_id)
WHERE invalidated_at IS NULL
```

Expired rows must be explicitly invalidated before replacement. `result_fingerprint` remains a non-unique index.

### Invalid cached JSON

1. Read the active snapshot.
2. Validate its canonical JSON structurally and semantically with the versioned application validator.
3. If invalid, attempt a guarded quarantine update.
4. If quarantine is confirmed, continue as a normal cache miss.
5. If quarantine cannot be confirmed, never return the invalid value and do not persist a replacement.
6. The request may continue as explicitly uncached analysis only if no database ownership state was created.

## Mixed failure policy

Before an ownership transaction, cache availability is fail-open where duplicate ownership cannot be created:

- database connection failure: continue with uncached analysis;
- cache read timeout: continue with uncached analysis;
- invalid snapshot successfully quarantined: continue as a normal miss;
- quarantine not confirmed: never return the value; continue uncached only without ownership or persistence.

During or after ownership acquisition, ownership safety is fail-closed:

- active owner: bounded poll, then `ANALYSIS_IN_PROGRESS`;
- expired owner: fail the old attempt and insert the new attempt atomically;
- indeterminate acquisition: re-read once, then return `ANALYSIS_TEMPORARILY_UNAVAILABLE` unless ownership is proven;
- provider failure: best-effort guarded transition of the owned run to `failed`;
- canonical structural or semantic validation failure: never persist and never return the invalid result;
- snapshot insert or run-ready failure: roll back both and return the already validated live result explicitly as uncached.

## Safe observability

Future cache telemetry may contain only cache stage, hit/miss/busy/uncached state, numeric timing, provider call count, result byte size, and a safe error code. It must not contain source or snapshot fingerprints, image hashes or bytes, Base64, filenames, menu text, restaurant or dish names, ingredients, raw provider output, canonical JSON, database URLs, environment values, or credentials.

## C2.1 non-goals

C2.1 does not persist raw images; create restaurant, dish-concept, observation, or logical-menu catalogs; implement dish-level reuse; analyze links; change the canonical schema, provider prompt/schema/model defaults, or source/dish fingerprint semantics; or change UI/session behavior. C2.1-E adds only the already frozen ownership and 409/503 cache policy locally, and C2.1-F validates it without expanding scope. C2.1-G completed the separate rollout review and withheld Production approval. The preserved automatic Preview is build provenance only: there is still no Preview/Production database migration or authorization to roll out cache behavior. C2.2-A changes only the future logical model and does not alter this contract.

## Infrastructure prerequisite status

C2.1-A is complete. The verified non-secret architecture, environment mapping, least-privilege roles, variable scopes, operational limits, and C2.1-B entry boundary are recorded in [database-environment-setup.md](./database-environment-setup.md).

The infrastructure setup does not activate the cache or authorize schema creation outside C2.1-B. Passwords, tokens, database URLs, connection strings, API keys, hostnames, and environment values remain excluded from repository files and reports.
