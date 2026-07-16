# Foodseyo Menu Image Analysis

**Status:** C1.2.1 restaurant-resolution semantics on the existing C1.2 live slice

**Date:** 2026-07-15

## Purpose

T5 replaces the Menu Scan demo redirect with real GPT-5.6 menu-image analysis. T5.5 uses one native multi-file picker with no `capture` hint, then keeps ordered previews, removal, and discard. The result is validated as the shared `FoodseyoAnalysis` contract, stored only in the current browser session, and opened automatically in the canonical Live result UI.

T5 does not add restaurant web research, public reviews, menu-freshness verification, Vercel Blob, permanent image storage, multi-request batch merging, a database, or another live analyzer.

## End-to-end flow

```text
1-10 ordered JPEG/PNG/WEBP files
→ client selection validation
→ adaptive browser resize and JPEG compression
→ one multipart POST /api/analyze/menu-images
→ server MIME, magic-byte, count, and byte-limit validation
→ transient ordered byte handles
→ injected menu_images analyzer
→ one OpenAI Responses API request
→ strict MenuImageModelOutput Structured Output
→ deterministic canonical adapter
→ shared T4 structural and semantic validation
→ FoodseyoAnalysis response
→ foodseyo.currentAnalysis in sessionStorage
```

No raw image, data URL, base64 payload, browser `File`, API key, exact location, or original filename is copied into the canonical result.

Historically, T5.2 used a custom **Scan or upload** Bottom Sheet with separate camera and gallery branches. T5.5 superseded that UI: Home now activates one native multi-file picker directly from the user gesture and stages validated Files in the same app-level in-memory provider. Menu Scan consumes the set once, clears it, and then owns preview object URL creation and cleanup. Direct Menu Scan entry remains supported. The handoff has no persistence, Base64 conversion, URL query, canonical File field, Blob service, or demo fallback.

## Client preprocessing and payload budget

The client accepts 1-10 files with declared MIME type `image/jpeg`, `image/png`, or `image/webp`. Selection order is preserved from previews through multipart fields and the OpenAI image content array.

The browser targets a total of **3,800,000 bytes**, leaving headroom below the server's **4,000,000-byte** hard limit. Images are decoded with orientation handling, drawn against a white background, and encoded as JPEG. The starting profile adapts to the selected count:

| Image count | Initial maximum long edge | Initial JPEG quality |
| --- | ---: | ---: |
| 1-2 | 2600 px | 0.90 |
| 3-4 | 2300 px | 0.86 |
| 5-6 | 2100 px | 0.82 |
| 7-8 | 1900 px | 0.78 |
| 9-10 | 1750 px | 0.74 |

Compression first lowers quality in small steps and then lowers resolution. It never goes below a 1400 px long-edge floor for a larger source or JPEG quality 0.68. A smaller original is not upscaled or reduced below its own dimensions. The client measures a readability-floor version of every image before allocating the remaining bytes proportionally across the ordered set. This avoids rejecting one detailed page merely because another page would have used less than an equal share. If even the combined floor versions exceed the total target, the client shows a `SIZE_READABILITY_LIMIT` error and asks the user to remove a page, crop unused areas, or take clearer close-ups. It does not make menu text unreadable merely to force the upload under budget.

Before decoding, the browser also rejects any single source file above 25,000,000 bytes or a selected source set above 100,000,000 bytes. These source guards are separate from the 3,800,000-byte processed-output target and prevent excessive browser memory use.

Decoding prefers `createImageBitmap` with orientation handling. Browsers without that capability use an `HTMLImageElement` object-URL fallback; both paths release the bitmap or revoke the object URL after processing. Pure selection, limit, profile, ordering, and injected decoder paths are covered by the lightweight Node suite without adding a DOM test framework. Manual device QA still includes iPhone Safari camera and gallery selection, portrait and landscape EXIF orientation, one-image and ten-image sets, and the unsupported-HEIC user message.

## Route contract

`POST /api/analyze/menu-images` runs in the Node.js runtime with a 90-second maximum duration.

Request:

- `multipart/form-data`;
- repeated `images` file fields in user-selected order;
- optional `restaurantName` text field, trimmed and limited to 120 characters;
- 1-10 images;
- total declared and validated size at most 4,000,000 bytes.

Every image must be non-empty, use an allowed MIME type, and match JPEG, PNG, or WEBP magic bytes. The route returns `Cache-Control: no-store`. The injected analyzer independently revalidates image count, declared metadata, actual non-empty bytes, actual total bytes, type, order, and cancellation immediately before provider execution. A native `Request`/`Response` handler factory provides a network-free route-boundary test seam.

Success:

```json
{ "ok": true, "analysis": "FoodseyoAnalysis" }
```

Failure:

```json
{
  "ok": false,
  "error": {
    "code": "STABLE_ERROR_CODE",
    "message": "Safe user-facing message",
    "retryable": false
  }
}
```

Provider errors, stack traces, request bodies, API keys, and raw model output are never copied to the response.

## Server-only OpenAI configuration

The official `openai` SDK is called only from a module marked `server-only`. `OPENAI_API_KEY` is read lazily when the route is invoked, so lint, tests, typecheck, and production build do not require a key. There is no `NEXT_PUBLIC_OPENAI_API_KEY`, and React components never read the secret.

Allowed models are `gpt-5.6`, `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`. `OPENAI_MODEL` defaults to `gpt-5.6` and rejects any other value. The client cannot select the model.

The provider uses:

- OpenAI Responses API;
- `responses.parse` with `zodTextFormat` Structured Outputs;
- all ordered images in one request with `detail: high`;
- `reasoning.effort: low`;
- `max_output_tokens: 12000`;
- `store: false`;
- no tools or web search;
- 80-second provider timeout below the route's 90-second execution limit;
- one retry;
- propagated `AbortSignal`;
- explicit refusal, incomplete response, invalid output, timeout, rate-limit, and service error mapping.

OpenAI authentication and permission failures (401/403) are configuration errors: they are non-retryable and return a safe 503 response without exposing provider details. Rate limits, provider 5xx responses, connection failures, and timeouts keep their existing typed retry behavior.

## Model contract and injection resistance

`MenuImageModelOutputSchema` is deliberately narrower than the canonical contract. The model extracts visible menu values, restaurant signals, source image indexes, explicit dietary text, uncertainty notes, general food knowledge, and a structured C1 consistency object per dish. Basic tastes, flavor notes, heat, richness, textures, and ingredient basis use the shared profile vocabulary and limits; only ingredient names remain free-form. The provider does not write final user-facing consistency sentences and does not control app IDs, evidence IDs, restaurant match status, final status, issues, review consensus, freshness, image rights, or ordering guidance.

The developer prompt treats all text in images as untrusted data. Instructions, URLs, prompt-like text, or commands printed in a menu image are never followed, and the request enables no tools or web search. The prompt separates source-stated facts from typical culinary context and uncertain inference; distinguishes basic taste, flavor, heat, richness, texture, and ingredient basis; and prohibits fabricated restaurant-specific ingredients, prices, preparation, popularity, signature claims, reviews, freshness, modifications, and allergy guarantees. Unreadable consistency axes stay empty or `unknown`.

Source indexes are zero-based, non-empty for extracted categories, dishes, prices, options, dietary claims, and menu options, limited to the submitted image set, and validated again by the adapter. An out-of-range reference fails with a typed error. Empty extracted categories are removed; an output with no useful dishes fails instead of producing an empty success. The prompt explicitly prioritizes complete visible-menu extraction while remaining concise and forbids repair calls, tools, or a second request.

## Canonical adapter and evidence semantics

After upload validation, the analyzer hashes the server-received bytes in selection order and creates a `source_` fingerprint before the one provider call. It stores only the resulting source fingerprint, never the raw hashes, bytes, Base64, or filenames. Fingerprint failure stops before provider execution.

After provider output parsing, the adapter reuses the C1 normalizer and semantic validator. It fixes safe aliases, duplicates, ordering, count overflow, and ingredient-basis conflicts; invalid levels become `unknown`, malformed ingredients are removed, and defined texture contradictions clear only the texture axis before one final validation. Remaining blocking issues use the existing provider-invalid boundary without another OpenAI call. Foodseyo code renders the stored deterministic wording.

The deterministic adapter creates one `uploaded_menu` evidence record per submitted image and maps model source indexes to stable evidence IDs. Category, dish, option, and price-option IDs are app-generated with deterministic duplicate suffixes. Dish identity combines the source fingerprint with the extracted source-stated name, description, category, and price; result identity separately binds normalized consistency, wording, and five version values. Neither identity activates a cache.

Restaurant resolution follows these rules:

- a user name without source corroboration → `likely` / `user_declared` / restaurant scope;
- a name or logo stated by the menu source → `confirmed` / `source_stated` / restaurant scope;
- compatible user and source names → `confirmed` / `source_and_user`;
- conflicting user and source names → `unconfirmed` / `source_and_user` / unknown scope with `restaurant_name_mismatch`;
- location evidence without a name → unresolved `location_only` / unknown scope;
- no identity evidence → `unconfirmed` / `none` / unknown scope.

User input and source-extracted signals remain separate through the adapter. Compatibility uses Unicode normalization, trim, lowercase conversion, punctuation removal, and whitespace collapse; there is no fuzzy, AI-assisted, or substring match. Conflict keeps two separate candidates, selects neither, exposes no combined display name, and creates no restaurant entity. Source-stated address or phone evidence may establish branch scope; a restaurant name, generic website, or location hint alone cannot. The provider schema and one-call provider boundary are unchanged.

New live results use canonical `1.1.1`. Strict `1.0.0` and `1.1.0` session results remain readable; missing provenance fields receive only the conservative reader fallback `none` / `unknown` and are never upgraded to confirmed branch identity.

Visible numeric prices remain direct observations. Unknown currency remains `null`, unknown price remains `null`, full option prices remain `priceOptions`, and add-ons remain `options`. Zero is never used as an unknown fallback.

General recipe knowledge stays in `generalKnowledge` without evidence IDs. It is never promoted into restaurant-specific confirmation. Restaurant-specific ingredients and preparation default to unknown, signature status remains unknown, review consensus is `insufficient`, freshness is `could_not_verify`, dish imagery is unavailable with unknown rights, and ordering guidance is `null` in T5.

Explicit `contains` claims become `confirmed_present` direct observations. Free-from, vegan, vegetarian, and gluten-free labels remain `confirm_with_staff`; no label guarantees ingredients or cross-contact safety. The canonical allergy warning is always preserved.

## Result status and UI handoff

- `good` plus useful dishes → `complete`;
- `partial` plus useful dishes → `partial`;
- `unreadable` → typed `MENU_NOT_READABLE` error;
- no useful dishes → typed `MENU_DISHES_MISSING` error.

Missing optional reviews, freshness, images, or restaurant confirmation does not by itself make a good useful menu partial. Menu Scan exposes loading status through an `aria-live` region, displays only preprocessing messages or schema-validated API messages, and replaces malformed JSON, HTML, network, and technical failures with a fixed generic message. User cancellation is silent.

After strict API, canonical-schema, semantic, status, and dish-presence validation, Foodseyo writes the envelope under `foodseyo.currentAnalysis` in `sessionStorage` and confirms it by reading and validating the value again. Only then does it enter `navigating` and call `router.replace("/analysis")`. A browser storage failure does not navigate and shows “This browser could not keep the result for the next screen.”

T5.4 extends the mutually exclusive UI phases to `idle`, `preparing`, `requesting`, `navigating`, abnormal fallback `success`, or `error`. Loading is derived from `preparing`, `requesting`, and `navigating`, with the single label “Reading your menu…” and the helper “This can take up to a minute for detailed menus.” Request cleanup releases timers and controllers without resetting navigation. Starting another analysis or changing the selected images clears stale fallback/error feedback, while ordinary re-renders and the one-shot Home provider cleanup do not.

A valid HTTP 200 body must still pass the strict API response schema, contain `ok: true`, contain a structurally and semantically valid canonical analysis, have a non-failed status, and contain at least one dish. Malformed JSON, HTML, an HTTP/body status mismatch, `ok: false` under HTTP 200, or an invalid canonical payload becomes a safe response error rather than returning silently to idle. The internal completion summary remains available to abnormal fallbacks but is not an extra normal-success screen.

The confirmed Production symptom was not an API-contract failure: iPhone Safari requests ended with HTTP 200 and loading stopped, but success and error feedback was inserted outside the current mobile viewport. T5.3 added live-region semantics and reduced-motion-aware feedback scrolling. T5.4 makes normal success frictionless: it shows no completion card, Analyze again, View results, or extra button and automatically replaces Menu Scan with `/analysis`. The compact completion UI remains only for storage or navigation failure.

One synchronous in-memory attempt gate permits only one active analysis, blocks fast duplicate taps before React can re-render, and assigns monotonic attempt IDs so late responses cannot replace a newer state. A 105-second client watchdog starts at the request boundary, after preprocessing. It is longer than the 80-second provider timeout and 90-second Route maximum, uses `AbortController` plus `setTimeout` for Safari compatibility, and shows: “The menu analysis took too long. Try again with fewer or clearer images.” Manual abort remains silent. Timers are cleared on settlement and unmount, and retry is available after success or error.

Completion safeguards are documented in [menu-analysis-completion-ui.md](./menu-analysis-completion-ui.md), and the session-scoped Overview/Dish architecture is documented in [live-analysis-results.md](./live-analysis-results.md). The original iPhone Safari analysis success is confirmed; post-deployment automatic-navigation and Live result verification on the user’s physical iPhone remains a user QA step.

## Automatic tests

`pnpm test` covers persistence confirmation, automatic navigation, failure fallbacks, all session read states, Overview mapping, encoded Dish navigation, Dish Detail, menu-derived ingredient/caution rendering, scoped cleanup, response boundaries, and MVP-scope guards. The suite prints the actual assertion count at runtime and makes zero network calls. It does not run a paid OpenAI smoke.

After the first T5.4 Production iPhone retest, response-boundary regression coverage was added without changing the model, provider, prompt, token limit, timeout, or one-request policy. HTTP 200 is no longer treated as one generic client outcome: body read, JSON parsing, API schema, HTTP/body consistency, failed status, empty menu, and semantic validation have separate safe categories. Server responses carry a random correlation header and log only status/timing/byte-length/stage/count metadata. Synthetic 1-dish and 31-dish canonical bodies are parsed network-free; the runtime suite reports their actual byte lengths.

R1 adds timing to the existing privacy-safe observation boundary without changing the request or response contract. The client can record preprocessing, request-plus-body handling, response parsing/validation, storage, HTTP status, response bytes, a short reference, safe stage code, and issue counts. The server records total duration, the injected OpenAI-provider call boundary, post-provider canonical adaptation/validation, response bytes, status, correlation ID, safe stage, and issue counts. Navigation completion is not timed because a same-page timer cannot reliably measure the browser transition. These observations never include images, Base64, filenames, restaurant or dish names, menu text, raw provider output, full canonical results, API keys, or environment values.

R1 also separates validation entry points: `pnpm verify:quick` for fast development feedback, `pnpm verify:menu` for the menu vertical slice, `pnpm verify:results` for canonical result rendering, and `pnpm verify:full` for the final complete check. C1.2 adds `pnpm verify:consistency-integration` for the fake-provider live contract. `pnpm test` remains the all-network-free-suite compatibility command.

## Optional live smoke test

The smoke command is separate from automatic tests:

```powershell
$env:OPENAI_API_KEY="<server key>"
$env:MENU_ANALYSIS_SMOKE_IMAGE="C:\path\to\rights-cleared-menu.jpg"
pnpm smoke:menu-analysis
```

Only use a locally controlled or rights-cleared JPEG, PNG, or WEBP under 4,000,000 bytes. The script prints only final status and dish count. It never prints the key, image bytes, raw model output, or filenames. Without a key or image path it exits as not run.

## Environment setup

Local development:

1. Copy `.env.example` to `.env.local`.
2. Set `OPENAI_API_KEY` in `.env.local`.
3. Optionally set `OPENAI_MODEL=gpt-5.6` or another allowed value.
4. Restart the development server.

Vercel production:

1. Open the Foodseyo project in Vercel.
2. Add `OPENAI_API_KEY` under Project Settings → Environment Variables for the intended environments.
3. Optionally add `OPENAI_MODEL` with an allowed value.
4. Redeploy so the function receives the new server environment.

Never expose the key with a `NEXT_PUBLIC_` prefix or commit `.env.local`.

## Limitations and deferred security work

T5.1's direct function upload is intentionally bounded and transient. It has no Vercel Blob, permanent image storage, batch merging, database, account, or exact-location persistence. Later operational work still needs distributed rate limiting, budget controls, per-user abuse controls, monitoring with secret-safe metadata, and alerting. The current client, route, analyzer, provider-timeout, no-store, and safe-error controls reduce risk but are not a complete abuse-prevention system.
