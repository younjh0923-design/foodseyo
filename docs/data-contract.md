# Foodseyo Unified Analysis Data Contract

**Status:** Implemented for T3, executed by T4, and populated by T5.1 menu analysis

**Date:** 2026-07-15

The canonical contract is implemented in `src/domain/foodseyo-analysis.ts`. Zod schemas are the source of truth; public TypeScript contract types are derived with `z.infer`. The contract contains JSON-serializable data only and is designed for a future GPT Structured Output payload without connecting an API in T3.

## Envelope and payload

`FoodseyoAnalysis` is the app-managed envelope:

- `schemaVersion`: the literal `1.0.0`;
- `analysisId`: an app-generated string;
- `generatedAt`: an ISO 8601 string;
- `status`: `complete`, `partial`, or `failed`;
- `inputContext`: one of the six discriminated input contexts;
- `payload`: a `FoodseyoAnalysisPayload`;
- `issues`: recoverable information, warnings, and errors.

`FoodseyoAnalysisPayload` contains analysis and research results:

- restaurant resolution;
- a nullable restaurant;
- a nullable menu with one canonical dish collection;
- nullable ordering guidance;
- evidence items;
- the required allergy safety notice.

The envelope keeps app-generated IDs and timestamps outside the future model-generated payload.

## Input contexts

`InputContext` is a strict discriminated union on `type`:

- `menu_images`
- `restaurant_photo`
- `restaurant_screen`
- `restaurant_link`
- `nearby_search`
- `demo`

Every branch records only serializable context needed to interpret a result. Image inputs record `imageCount`, not image bytes. Location-aware inputs record whether location was used, not a permanent copy of exact user coordinates. The MVP storage scope is the literal `session_only`.

The contract has no fields for `File`, `Blob`, base64 image data, API keys, authentication tokens, browser objects, account IDs, or permanent image IDs.

## Evidence semantics

Three enums have intentionally separate responsibilities.

### `EvidenceSourceType`

Where evidence actually came from:

- `official_menu`
- `official_website`
- `official_social`
- `uploaded_menu`
- `user_provided_screen`
- `public_web`
- `web_search_result`
- `platform_api_sample`
- `staff_confirmation`
- `demo_data`

### `ClaimBasis`

How a claim was produced:

- `direct_observation`
- `external_source`
- `general_food_knowledge`
- `ai_inference`
- `user_confirmation`
- `deterministic_calculation`

### `Availability`

Whether a value was obtained:

- `available`
- `unknown`
- `unavailable`
- `insufficient`

AI inference and general food knowledge are not evidence sources. `unavailable` is not provenance. High-risk claims use source IDs, a basis, availability, and a limitation through named evidence structures.

## Restaurant resolution

Restaurant match status is one of:

- `confirmed`
- `likely`
- `unconfirmed`
- `not_attempted`

Resolution stores candidates, a nullable selected candidate ID, a nullable confirmation method, source IDs, and limitations. It has no numeric confidence field. A restaurant may be `null` while a partial analysis still contains useful general dish knowledge.

## Menu and dishes

`Menu.dishes` is the canonical dish collection. Categories contain IDs and labels only; dishes reference a category ID. `featuredDishIds` provides UI references without copying dish data.

Each dish separates:

- visible menu data and price;
- `generalKnowledge`, including typical taste, texture, spice, ingredients, background, and ordering considerations;
- `restaurantSpecific`, including evidence-backed ingredients, preparation, signature status, protein options, and modifications;
- image metadata and rights state;
- review consensus;
- dietary assessments;
- evidence IDs and limitations.

General recipe knowledge is not copied into restaurant-specific fields when restaurant evidence is absent.

## Null and unknown rules

- Unknown singular values use `null`, including price, restaurant, URLs, timestamps, and optional app inputs.
- Collections use arrays. An empty array is paired with availability or a limitation when its reason matters.
- Unknown price is `price: null`; zero is not used as a fallback.
- Unknown ordering totals are `estimatedTotal: null`.
- Unconfirmed restaurant identity does not force the whole analysis to `failed`.
- Object schemas are strict so unexpected raw or sensitive fields are rejected.

`Money` contains a finite non-negative amount, nullable currency, and display text. Price options and add-ons preserve their own evidence state.

## Reviews, freshness, and dietary safety

Review status is:

- `strong`
- `moderate`
- `mixed`
- `insufficient`

An evidence-free review can be represented with `insufficient`, zero source groups, zero evidence items, empty source IDs, and a limitation.

Menu freshness status is:

- `verified_against_official_source`
- `possible_differences`
- `could_not_verify`

Verification means comparison with an official source, not a guarantee that the menu is current.

Dietary status is:

- `confirmed_present`
- `likely_present`
- `confirmed_absent`
- `may_be_modifiable`
- `unknown`
- `confirm_with_staff`

Dietary keys reuse the concepts already present in Food Passport and the demo UI. Every dish carries the required warning that recipes may change, Foodseyo cannot guarantee allergy safety, and ingredients and cross-contact must be confirmed with staff.

## Dish images

Image source type is:

- `uploaded_menu`
- `user_provided_screen`
- `official_menu`
- `official_website`
- `official_social`
- `general_reference`
- `demo_data`
- `unavailable`

`ai_generated` is not allowed.

Rights status is:

- `cleared`
- `attribution_required`
- `session_only`
- `unknown`
- `not_reusable`

The schema supports a nullable URL, nullable local asset path, source page, restaurant-specific flag, user label, attribution, limitation, alt text, and display position. A third-party image visible in a user-provided screen can be session evidence while remaining `session_only` or `not_reusable`.

## Issues and partial results

Issues use central codes and `info`, `warning`, or `error` severity. The initial codes cover restaurant uncertainty, insufficient reviews, unverified freshness, unavailable or non-reusable images, staff confirmation, unknown price, research failure, and partial analysis.

Information gaps and operational failure are distinct. For example, restaurant identity may be `unconfirmed`, analysis status may be `partial`, and general dish knowledge may remain available.

## Demo migration

`src/data/demoFoodseyoAnalysis.ts` is the canonical demo fixture and is created with `FoodseyoAnalysisSchema.parse`. It is clearly labeled as `demo`, uses `demo_data` evidence, stores explicit fixture prices, records image provenance and rights, and does not claim to be live restaurant evidence.

`src/data/demoRestaurant.ts` is a UI adapter. It derives the existing `Restaurant` and `Dish` view models from the canonical fixture so Restaurant Overview, Dish Detail, Food Passport, Meal Planner, Assistant mock, and routes can remain unchanged. The previous hand-authored `demoRestaurant` dataset is no longer a second source of truth.

## Validation and T5 Structured Output

`npm test` runs the lightweight Node validation module. It checks demo parsing, enum rejection, nullable prices, insufficient reviews, forbidden AI image sources, partial analysis, session-only screen imagery, separated evidence semantics, strict rejection of raw image fields, and JSON serialization.

The T5 menu-image integration uses a narrow `MenuImageModelOutputSchema` before canonical mapping:

- use `FoodseyoAnalysisPayloadSchema` as the payload boundary;
- let the app create `analysisId`, `generatedAt`, status, and input context where appropriate;
- preserve required nullable fields instead of omitting unknown values;
- validate model or orchestrator output before exposing it to UI;
- keep UI adapters and deterministic recommendation calculations outside the model contract.

The application, not GPT, creates evidence IDs, entity IDs, restaurant resolution state, final status, issues, image-rights defaults, and the envelope. This separation keeps model output small and prevents raw provider data from bypassing the canonical contract.

## T4 runtime boundary

T4 consumes the canonical schemas through `analyzeFoodseyoInput`. Input-specific analyzers return an internal draft rather than constructing envelopes. The shared orchestrator normalizes payload candidates, runs Zod structural validation, runs separate business semantic validation, derives status and issues, creates the app-managed envelope, validates the final result, and verifies JSON serialization.

Transient binary and exact-location access exists only in the analyze request. It is never copied into this canonical contract. T5.1 supplies a route-injected `menu_images` analyzer while the default registry remains provider-free. Explicit restaurant input counts as user evidence without source IDs; unmatched image identity and contact details are not borrowed into that user-owned resolution. Direct-evidence confirmation still requires evidence source IDs. Demo remains implemented; restaurant photo, screen, link, and nearby inputs still return typed capability-unavailable errors.

Runtime details are defined in [analysis-orchestration.md](./analysis-orchestration.md).

## T5.4 browser read contract

The canonical schema is unchanged. T5.4 does not add a result-specific contract or copy canonical data into URL, Route props, local storage, IndexedDB, or a database. The browser session reader distinguishes valid data, a missing/empty key, invalid JSON, invalid schema or semantics, unsupported schema version, `failed` status, a zero-dish result, and unavailable session storage. Only a valid, non-failed result with at least one dish may render Live Overview or Dish Detail.

`foodseyo.currentAnalysis` remains the only analysis result key. Food Passport continues to use its existing independent local-storage key. Removing the current result must not clear Passport or unrelated browser storage.
