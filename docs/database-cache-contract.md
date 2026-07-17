# C2.1 database and exact-cache contract

This file is the current source of truth for the C2.1 database/cache contract. The supplied `Foodseyo_Database_Architecture_v1.2.docx` and `Foodseyo_PostgreSQL_Schema_v1.2.sql` remain reference artifacts. Where they differ from this file, this file governs C2.1. Executable Drizzle schema and reviewed migrations will be created in C2.1-B; the formal architecture artifact can be regenerated from the implemented schema afterward.

This checkpoint freezes contracts only. It does not create a database, implement cache lookup or PostgreSQL repositories, acquire a real lease, persist a snapshot, or change the live API response.

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

C2.1 does not persist raw images; create restaurant, dish-concept, observation, or logical-menu catalogs; implement dish-level reuse; analyze links; change the canonical schema, provider prompt/schema/model defaults, or source/dish fingerprint semantics; or change UI/session behavior. C2.1-0.1 adds no database dependency, connection, schema, migration, SQL execution, cache hit, provider bypass, or new public live error response.

## Manual infrastructure prerequisites

Before C2.1-B, the user must complete the C2.1-A infrastructure boundary outside this checkpoint:

- create or select the managed Neon account, project, and region;
- create isolated Development, Preview, and Production database branches or projects;
- authorize the existing Vercel project integration without relinking or creating a second project;
- create separate least-privilege runtime and migration roles;
- configure environment-scoped runtime and migration variable names through the hosting dashboards;
- confirm backup/PITR, restore, TLS, connection-limit, and operational monitoring policies.

Return only non-secret evidence such as project/branch names, selected region, environment-scope confirmation, role names, and readiness screenshots with values redacted. Never paste or commit passwords, tokens, database URLs, connection strings, API keys, or environment values.
