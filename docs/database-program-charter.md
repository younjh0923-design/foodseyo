# Foodseyo Core Consistency Database Program Charter

**Status:** Active architecture charter through completed local C2.3

**Reviewed:** 2026-07-17

## Authority and boundary

This charter defines why Foodseyo is building a database program, which data
capabilities belong to that program, and how they must be sequenced. It is the
required starting point for future work involving databases, analysis reuse,
restaurant or branch identity, dish concepts, taste, texture, ingredients,
culinary knowledge, semantic merging, or GPT-aware retrieval.

This checkpoint does not activate the C2.2-D schema draft, create a table,
generate or run a migration, add a repository, change the canonical runtime
contract, connect to Neon or Vercel, call OpenAI, or change the live analysis
flow. Inclusion in the core program is an architecture commitment, not
authorization to implement or release every capability at once.

## Primary database objective

Foodseyo's database objective is to produce faster, semantically consistent,
evidence-aware, versioned, and safely reusable food guidance while reducing
unnecessary repeated full-provider reasoning.

The objective is broader than decomposing one canonical JSON snapshot into
structured-menu rows. Structured menu projection is the first bounded
relational slice because it has a reviewed source, narrow integrity boundary,
and deterministic mapping. It is not the end state of the database program.

The database must eventually let Foodseyo:

- reuse an exact validated analysis when the complete source and analysis
  contract match;
- recognize and retrieve reviewed culinary context for the same dish concept
  across safely resolved aliases and languages;
- reuse restaurant- or branch-scoped observations without upgrading a
  candidate into a confirmed identity;
- keep source observations, inference, reviewed culinary baselines, and
  unknown values distinguishable;
- reproduce the meaning of a result from explicit versions and provenance;
- constrain GPT with relevant reviewed context instead of asking it to repeat
  all culinary reasoning from scratch;
- validate, normalize, merge, and persist results deterministically after GPT
  returns.

## Three reuse paths

The three paths solve different identity problems and never substitute for one
another.

### Path A — exact analysis reuse

Path A is the implemented C2.1 boundary.

```text
exact transient source identity
+ source-fingerprint version
+ model, prompt, provider schema, canonical schema, and consistency profile
→ validated active canonical snapshot
```

It reuses only a structurally, semantically, contractually, and
fingerprint-valid whole snapshot. It owns exact-hit provider bypass,
lease-based duplicate ownership, corrupt-snapshot quarantine, and immutable
ready persistence. It does not claim semantic equivalence between different
sources, menus, restaurants, or preparations.

### Path B — semantic dish and culinary-knowledge reuse

Path B begins with a candidate link from a menu-item observation to a versioned
dish concept. It may retrieve reviewed culinary profiles containing:

- dish concepts, aliases, relationships, cuisine, and region context;
- separate basic-taste, flavor-note, texture, heat, and richness claims;
- ingredients and their `core`, `typical`, `optional`, `regional_variant`, or
  `preparation_dependent` baseline roles;
- preparation, dietary, and allergen knowledge with typed safety semantics;
- claim provenance, review state, lifecycle, and immutable profile versions.

Path B is a variable culinary baseline, not a universal fact about every
restaurant preparation. It may fill missing context only after menu evidence
has been evaluated. It cannot override a contradictory source observation and
cannot turn an unknown into a negative or safety assertion.

### Path C — restaurant- and branch-scoped reuse

Path C reuses observations only within a restaurant identity scope proven by
preserved evidence.

- A user-entered name is a declaration and may create a candidate.
- Restaurant-level confirmation does not establish a branch.
- Branch scope requires branch-specific evidence.
- Conflicts remain unresolved; neither candidate is silently selected.
- Restaurant and branch external references remain scope-specific.
- Restaurant resolution method and evidence remain versioned and queryable.

T7 source acquisition must first define URL normalization, SSRF protection,
source classification, and evidence preservation. Restaurant and branch
identity design follows that evidence contract. This sequencing makes identity
current core work without pre-approving unsupported confirmation.

## GPT and deterministic application ownership

### Before provider execution

The application owns:

1. source normalization and exact source identity;
2. Path A exact-snapshot lookup and ownership coordination;
3. when no exact result exists, safe retrieval of relevant Path B and Path C
   context under explicit identity, review, lifecycle, and version filters;
4. construction of a bounded provider request containing only relevant,
   provenance-aware context.

Context retrieval must not expose credentials, raw images, unrelated user
data, unreviewed knowledge as authoritative fact, or an unresolved restaurant
candidate as confirmed identity.

### During provider execution

GPT may:

- extract source-visible menu information;
- make only the limited inferences allowed by the provider and canonical
  contracts;
- propose restaurant candidates, dish-concept candidates, or culinary
  knowledge for later deterministic validation and review.

GPT may not:

- publish culinary knowledge automatically;
- override a source-stated fact with baseline knowledge;
- promote a restaurant or branch identity;
- invent prices, reviews, ingredients, allergens, dietary safety, or branch
  scope;
- reinterpret an older result under an unrecorded newer vocabulary;
- own final IDs, evidence links, merge precedence, lifecycle, or persistence.

### After provider execution

The application owns:

1. provider-output structural validation;
2. canonical semantic validation;
3. C1 normalization and deterministic wording;
4. restaurant and dish candidate validation without silent promotion;
5. the frozen evidence-precedence merge;
6. safety rules and unknown preservation;
7. complete version and provenance capture;
8. atomic persistence or complete rollback.

Navigation to Overview or Dish Detail consumes the already validated canonical
result. It never makes another GPT call.

## Current core program scope

The core backend and data program includes:

1. exact analysis cache and ownership;
2. deterministic structured-menu projection;
3. restaurant and branch identity candidates;
4. dish concepts and aliases;
5. versioned culinary profiles;
6. separate basic-taste, flavor-note, texture, heat, and richness knowledge;
7. ingredient concepts, aliases, and baseline roles;
8. provenance, review, generation origin, and lifecycle;
9. menu-item-to-concept candidates;
10. relational typed menu-specific claims;
11. deterministic effective-profile merging;
12. pre-provider reusable context retrieval;
13. explicit GPT extraction and inference constraints;
14. post-provider validation, normalization, merge, persistence, and
    versioning;
15. adversarial evaluation of all three reuse paths.

“Core” means required for the intended Foodseyo consistency architecture. Each
area remains gated and sequenced. Only an explicitly authorized slice may
receive a physical contract, schema, migration, runtime integration, or
rollout.

## Deferred product scope

The following remain outside the current core database implementation:

- accounts and persistent anonymous identity;
- Food Passport and personal food history;
- stored dietary, allergy, language, or sensory preferences;
- personalized compatibility or recommendation scoring;
- community reviews, media, moderation, and social features;
- permanent raw-image or source-artifact storage;
- nearby discovery, reservations, payments, and map-app sharing.

These capabilities require separate product, authentication, authorization,
privacy, retention, deletion, moderation, and possibly row-level-security
decisions. Deferral here does not weaken the current core restaurant,
dish-concept, culinary-knowledge, or merge program.

## Frozen semantic and integrity invariants

### Evidence precedence

The exact merge precedence is:

```text
source_stated
> inferred_from_source
> reviewed culinary_baseline
> unknown
```

- A lower-precedence claim fills only missing context.
- Contradictory source evidence suppresses the affected baseline claim.
- Suppression does not mutate the shared baseline or unrelated axes.
- Every effective result records its merge-policy version and baseline
  versions.

`unknown` never means absent, false, allergen-safe, dietary-safe, confirmed, or
compatible. It cannot authorize an automatic match or a negative claim.

### C1 sensory axes

The C1 axes remain separate and versioned:

- basic tastes: `sweet`, `salty`, `sour`, `bitter`, `savory`;
- flavor notes: the versioned `foodseyo-consistency-v1` vocabulary;
- textures: the versioned `foodseyo-consistency-v1` vocabulary;
- heat: `none`, `mild`, `medium`, `hot`, `very_hot`, `unknown`;
- richness: `light`, `moderate`, `rich`, `unknown`.

There is no generic relational `taste` bucket. Heat and richness use different
ordered scales, and value references remain bound to their scale. Heat
adjustability or a user-selectable spice level is a separate source-backed
claim from observed or typical heat.

### Ingredients and claims

Baseline ingredient role is one of:

```text
core
typical
optional
regional_variant
preparation_dependent
```

That role is independent from menu-specific claim basis. A common claim parent
must own exactly one allowed relational typed detail. Polymorphic `(type, id)`
references, unrestricted EAV, arbitrary claim-value JSON, and unverifiable
generic pointers are not acceptable replacements for referential integrity.

### Review and lifecycle

Generation origin, review state, and lifecycle are orthogonal:

- model-generated knowledge starts unreviewed;
- review never rewrites generation origin;
- only reviewed current knowledge may supply a culinary baseline;
- corrections append a version;
- replaced knowledge becomes superseded;
- intentionally withdrawn knowledge becomes retired.

No model-generated proposal becomes published merely because generation
succeeded.

## Version and provenance ledger

Foodseyo must record the versions needed to reproduce why a result means what
it means:

| Layer | Required version or provenance |
| --- | --- |
| Source identity | source fingerprint and source-fingerprint version |
| Provider behavior | model version, prompt version, provider-schema version |
| Canonical result | canonical-schema version |
| Normalization | C1 consistency-profile version |
| Structured projection | projector version |
| Culinary baseline | dish-profile version and included knowledge-claim versions |
| Effective resolution | merge-policy version and effective-profile version |
| Identity resolution | restaurant-resolution method/version and preserved evidence |

Dish aliases, restaurant candidates, menu observations, and claims also retain
their source and review provenance. Version identity and lifecycle state are
not interchangeable: an old immutable version may remain queryable while no
longer being current.

## Revised phased roadmap

Each implementation phase is bounded. A physical contract and relevant
product/security decisions precede every new database slice.

### Foundation — complete locally

- C1.1–C1.2.1: normalized sensory semantics, repeatability, fingerprints, and
  canonical provenance;
- C2.1: exact cache, ownership, repositories, adversarial Development
  validation, and rollout review;
- C2.2-A/A1: logical ERD and culinary-contract audit;
- C2.2-B/C/D: structured-menu physical contract, scoped decisions, and isolated
  unexecuted draft;
- C2.2-E: this program charter.

### First implementation slice

- **C2.3 — Development-only structured-menu projection (complete locally):**
  the reviewed four-table draft is active, the reviewed migration is applied
  only to Development, and deterministic plus real PostgreSQL adversarial
  validation proves the atomic projector transaction. No live read path was
  added.

### Source and scoped identity

- T7 source-acquisition checkpoints: normalized URL intake, SSRF defense,
  source classification, evidence extraction, and preservation contracts;
- restaurant/branch decision gate: confirmation authority, candidate
  selection, external-reference scope, conflict, retention, and review policy;
- restaurant/branch physical contract and isolated draft;
- Development-only identity-candidate implementation and validation.

### Dish concepts and reviewed culinary knowledge

- culinary governance decision gate: proposal, reviewer authority,
  publication, source citation, calibration, and retirement;
- dish-concept and alias physical contract, draft, and Development
  implementation;
- vocabulary, profile, ingredient, typed-claim, provenance, and lifecycle
  physical contract;
- bounded Development implementation with real PostgreSQL integrity tests.

### Menu-specific claims and deterministic resolution

- concept-candidate and menu-claim decision/physical-contract gate;
- typed menu-specific claim and effective-profile draft;
- deterministic precedence merge with explicit versions;
- Development implementation and adversarial cross-context tests.

### GPT-aware reuse integration

- bounded Path B/Path C context retrieval before provider execution;
- provider-context size, provenance, and stale-version policy;
- post-provider candidate validation and deterministic merge;
- evaluation proving that context reduces redundant reasoning without
  weakening evidence or safety.

### Rollout

Each independently safe slice follows:

```text
Development migration and adversarial validation
→ least-privilege verification
→ separately authorized Preview migration and live QA
→ rollback rehearsal
→ separate Production go/no-go
```

The existing C2.1-G competition freeze and uncached Production recommendation
remain in force until a later release decision explicitly supersedes them.

## Evaluation program

The database program is not complete on schema creation alone. Synthetic and
real-PostgreSQL evaluation must cover:

| Case | Required property |
| --- | --- |
| Exact repeat | Path A returns one valid exact snapshot and avoids duplicate provider work |
| Equivalent source | Semantic reuse is proposed only under explicit equivalence rules, never exact-cache identity |
| Same dish, different restaurant | Shared baseline remains distinguishable from restaurant-scoped observations |
| Same dish, conflicting preparation | Source evidence wins for the affected claim; other axes remain intact |
| Same restaurant, different source | Identity scope and source revision remain preserved |
| Aliases and multilingual names | Candidate resolution is deterministic, provenance-aware, and reversible |
| Changed knowledge profile | A new profile/effective version is produced; old results are not silently reinterpreted |
| Changed model, prompt, schema, or profile | Exact reuse misses unless the complete contract matches |
| Unknown or allergy-related data | Unknown never becomes absence or safety |
| Concurrency and failure | One owner, atomic writes, rollback, ambiguity handling, and no partial structures |

All automated evaluation is network-free unless a separately authorized
Development integration explicitly requires a managed database. No validation
may call OpenAI.

## Program completion definition

The core consistency database program is complete only when:

- the three reuse paths have explicit identities and non-overlapping authority;
- all current-core slices have reviewed decisions and physical integrity
  contracts;
- active schemas and migrations match those contracts;
- provenance, review, lifecycle, and required versions are queryable;
- deterministic merging preserves precedence and unknown semantics;
- GPT pre-context and post-validation boundaries are enforced;
- deterministic and real-PostgreSQL adversarial suites pass;
- least-privilege runtime and migration roles are verified per environment;
- Preview evidence, rollback rehearsal, and a separate Production go/no-go
  exist for every released slice;
- raw-image, secret, and sensitive-observability exclusions remain intact.

Completion does not require accounts, Food Passport, personalization, or
community features.

## Migration and rollout boundaries

- The C2.2-D files remain historical review evidence; C2.3 promotes their exact
  four-table boundary through the active schema and reviewed `0001` migration.
- C2.3 Development completion does not authorize a live read path, Preview or
  Production migration, push, or deployment.
- No restaurant, dish-concept, knowledge, claim, or effective-profile table may
  be added before its own decision and physical-contract checkpoint.
- Development success never authorizes Preview or Production.
- Preview and Production require exact target verification, least privilege,
  recovery evidence, and separately approved rollout actions.
- Production remains on the uncached flow until the C2.1-G gate is explicitly
  reopened and passed.
- Reference DOCX and SQL artifacts remain untracked, unstaged, and
  non-executable.
