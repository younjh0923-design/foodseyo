# Foodseyo Shared Analysis Orchestration

**Status:** Implemented for T4.1 and aligned for T5.5

**Date:** 2026-07-16

T4 turns the T3 `FoodseyoAnalysis` contract into one internal execution pipeline. The schema-v1 union has six branches for compatibility, while T5.5 exposes only the menu-image analyzer and the link entry UI. The dispatcher still centralizes analyzer boundaries, normalization, structural validation, semantic validation, status and issue derivation, and envelope creation.

The public internal service is:

```text
analyzeFoodseyoInput(request)
  → Promise<FoodseyoAnalysis>
```

The shared T4 core itself does not call a provider. T5 injects one server-only `menu_images` analyzer at the API route boundary; the default registry remains provider-free and capability-unavailable. The demo analyzer remains deterministic. Legacy `restaurant_photo` and `restaurant_screen`, future `restaurant_link`, and nearby inputs remain unavailable and never return demo data as a fallback.

## Execution flow

```text
Transient Analyze Request
→ Exhaustive Dispatcher
→ Input-specific Analyzer
→ AnalysisDraft
→ Conservative Normalization
→ Zod Payload Validation
→ Business Semantic Validation
→ Status Derivation
→ Issue Derivation and Deduplication
→ App-managed Envelope
→ Final Zod Validation
→ JSON Serialization Check
```

Each responsibility lives under `src/services/analysis`. The canonical schemas remain in `src/domain/foodseyo-analysis.ts`; orchestration logic does not modify or duplicate them.

## Transient requests and canonical results

`AnalyzeFoodseyoRequest` preserves the schema-v1 discriminated union for compatibility and exhaustive dispatch:

- `menu_images`
- `restaurant_photo`
- `restaurant_screen`
- `restaurant_link`
- `nearby_search`
- `demo`

Image requests use a transient binary handle with metadata and an asynchronous byte reader. This boundary can later be adapted to a browser `File`, `Blob`, or server upload without adding those objects to `FoodseyoAnalysis`.

Temporary location context may contain exact coordinates during execution. The canonical `InputContext` records only whether location was used; it does not retain the user's exact coordinates.

Transient requests are not persistence schemas. They may contain runtime functions and temporary binary or location access. Canonical results remain strict, JSON-serializable, session-scoped data without image bytes, base64, secrets, browser objects, account IDs, or permanent upload IDs.

## Dispatcher and analyzer registry

The analyzer registry has one typed entry for every canonical input type. The dispatcher uses an exhaustive switch so a new input union member cannot silently use the wrong analyzer.

Every analyzer implements the same interface:

```text
analyze(request, executionContext)
  → Promise<AnalysisDraft>
```

The execution context currently provides only an optional `AbortSignal`. It does not contain an OpenAI client, API key, web-search provider, Places client, or logger with sensitive data.

### Implemented analyzer

The demo analyzer:

- accepts the known demo fixture ID;
- clones `demoFoodseyoAnalysis.payload` so the canonical fixture is not mutated;
- creates a clearly labeled demo `InputContext`;
- reports the demo core capability as complete;
- keeps all evidence classified as `demo_data`;
- leaves ID, timestamp, status, issues, and final validation to the orchestrator.

### Default provider-free analyzers

The default registry keeps every non-demo input capability-unavailable. The menu-image API route overrides only `menu_images` with the concrete provider-backed analyzer. Legacy `restaurant_photo` and `restaurant_screen` remain compatibility-only, `restaurant_link` waits for T7, and all unavailable paths throw `AnalysisCapabilityUnavailableError` without fabricating data or falling back to Demo.

## Analysis draft

`AnalysisDraft` is internal runtime data, not a canonical public schema. It contains:

- canonical `inputContext`;
- an unknown payload candidate that must pass Zod before use;
- analyzer-reported operational issues;
- completed capabilities;
- degraded capabilities;
- the input path's core capability.

Analyzers do not generate the final envelope or unilaterally declare the final status.

## Normalization

Normalization is deliberately conservative. It:

- trims strings;
- converts empty strings to `null` so required-field validation can reject invalid emptiness;
- deduplicates safe string-list fields such as source IDs and limitations;
- creates new arrays and objects rather than mutating analyzer data.

It does not infer prices, produce review content, copy general ingredients into restaurant-specific fields, confirm restaurants, select featured dishes, alter image rights, or remap unknown categories.

## Structural validation

The normalized payload candidate must pass:

```text
FoodseyoAnalysisPayloadSchema.safeParse(candidate)
```

Invalid enums, URLs, field types, required fields, raw extra fields, and forbidden image sources produce `AnalysisStructuralValidationError`. The error stores only validation paths and messages, not the rejected raw payload.

After envelope creation, the complete result must pass `FoodseyoAnalysisSchema`. Envelope failures use a separate typed error.

## Semantic validation

Zod validates shape. `validateAnalysisSemantics` validates relationships and business meaning without adding complex refinements to the Structured Output schema.

Semantic errors include:

- missing or duplicate evidence references;
- confirmed restaurant states without restaurant data, confirmation method, or evidence;
- likely states without candidates;
- invalid candidate selections;
- confirmed restaurant-specific claims while restaurant identity is not confirmed;
- duplicate dish or category IDs;
- missing category and featured-dish references;
- prices that contradict their evidence state;
- strong or moderate reviews without evidence;
- verified freshness without official evidence;
- unavailable images with reusable fields;
- attribution-required images without attribution metadata;
- restaurant-specific general references;
- general references without source, reusable rights, or presentation limitation;
- persisted session-only images;
- restaurant-specific images without confirmed restaurant evidence;
- confirmed dietary states without direct or external evidence.

Semantic errors prevent a result from being returned and produce `AnalysisSemanticValidationError`.

Semantic warnings represent conservative limitations that may still allow a useful result: restaurant uncertainty, insufficient reviews, unverified freshness, unavailable or evidence-only images, staff confirmation, and unknown price.

## Status derivation

`deriveAnalysisStatus` uses input core capability completion and result usefulness.

- `failed`: semantic errors exist, no usable restaurant/menu/order result exists, or the core capability did not produce anything useful.
- `partial`: useful data exists but a core or analyzer-reported capability is incomplete or degraded.
- `complete`: the input path's core purpose succeeded.

Restaurant uncertainty, insufficient reviews, `could_not_verify` freshness, missing optional images, and staff-confirmation warnings do not automatically make a useful analysis partial or failed.

## Issue derivation

`deriveAnalysisIssues` merges:

- analyzer operational issues;
- semantic warnings;
- issues derived from the validated payload;
- external-research degradation;
- final partial status.

Issues are deduplicated by code plus a stable, order-independent set of related-entity IDs. Repeated limitations cannot create duplicate issues for the same entity. When duplicates have different severity, the merged issue preserves `error` over `warning` over `info`; if any duplicate is non-recoverable, the merged issue remains non-recoverable.

## Envelope creation

The orchestrator owns:

- the analyzer-selected supported schema version (`1.0.0` legacy, `1.1.0` compatibility, or `1.1.1` live consistency);
- `analysisId`;
- `generatedAt`;
- final status;
- final issues;
- final schema validation;
- JSON serialization verification.

Default IDs use `crypto.randomUUID`. The clock and ID factory are injectable, which makes demo tests deterministic without hardcoding production values. Legacy analyzers default to `1.0.0`; the live menu-image analyzer explicitly supplies `1.1.1` and its validated source/version metadata. The reader continues to accept the historical `1.1.0` consistency envelope.

## Image reuse safety

`isDishImageReusableForDisplay` and `getReusableDishImageSource` allow persistent UI adapters to display only images with `rightsStatus: cleared` and a URL or local asset path. They prevent persistent UI adapters from displaying:

- `attribution_required` images until attribution UI exists;
- images with `unknown` rights;
- `session_only` images;
- `not_reusable` images;
- unavailable images;
- image records with no URL or local asset.

An `attribution_required` image must still carry non-empty attribution metadata to pass semantic validation, but metadata alone does not make it displayable. The current cleared local demo asset remains displayable. The Restaurant/Dish adapter uses this helper, preserves actual category labels, maps missing categories to `Other`, preserves `$$$$`, and uses `Unknown` rather than a false price-level default.

## Tests

The lightweight Node validation entry point runs the existing contract checks and the T4 orchestration checks. Coverage includes:

- demo dispatch, deterministic envelope creation, final parsing, and serialization;
- T3 fixture corrections;
- evidence, restaurant, menu, category, featured-dish, price, review, freshness, image, and dietary semantics;
- explicit complete, partial, and failed status behavior, including optional-evidence cases that remain complete;
- all current image-rights display states and missing attribution metadata;
- actual dispatcher execution and typed rejection for all five unimplemented analyzers, including input-type preservation and no demo fallback;
- issue deduplication;
- highest-severity and strictest-recoverability issue merging;
- complete canonical fixture immutability before and after demo analysis.

No test framework dependency was added.

## T5/T5.1 menu-image implementation

T5 implements the menu-image analyzer behind the existing interface. `/api/analyze/menu-images` validates 1-10 ordered transient images, creates a server-only OpenAI provider, and injects only the `menu_images` registry entry. T5.1 adds independent analyzer-side count, type, actual-byte, metadata, total-byte, order, and cancellation checks. The analyzer returns an `AnalysisDraft`; the orchestrator still owns normalization, validation, status, issues, envelope creation, and serialization. Provider and route dependencies remain replaceable by fakes, so automatic tests never call OpenAI or the network.

Future restaurant-photo, screen, link, nearby, and research providers connect through the same boundary. They must not bypass structural or semantic validation.

## T5.4 presentation boundary

The canonical envelope is validated again before session persistence and on every Live result read. `src/lib/live-analysis-results.ts` is a pure view-model adapter above the orchestrator: it preserves canonical category and dish ordering, resolves safe Dish links, and maps nonempty presentation sections including menu-derived ingredients and cautions. It does not mutate the envelope or call an analyzer, provider, OpenAI, web research, review source, restaurant endpoint, or any other network service.

`/analysis` is the canonical result destination, and only `menu_images` is live. T6 is cancelled from the MVP. C1.1/C1.1.1 establish the contract and identity foundations; C1.2 integrates them into the existing menu-image analyzer; C1.2.1 corrects restaurant provenance without another provider call. C2.1-A/B established isolated infrastructure and the Development schema without changing this live orchestration. C2.1-C–G will add and roll out the exact-cache runtime in reviewed stages; T7 link analysis follows C2, and T8 identification will be reconsidered after T7.

## T5 transport boundary

The concrete T5 transport is a Node.js multipart route at `/api/analyze/menu-images`. It validates MIME and magic bytes, enforces a 4,000,000-byte total limit, returns stable safe errors with `Cache-Control: no-store`, and keeps the OpenAI key server-only. Full details are in [menu-image-analysis.md](./menu-image-analysis.md).

## Demo asset limitation

The canonical demo remains clearly labeled `demo_data`, but it uses the real name PAI Northern Thai Kitchen while prices, reviews, representative status, and other details are static illustrative data. Replacing it with a fictional or explicitly approved demo asset remains a later Demo Assets task before public submission.
