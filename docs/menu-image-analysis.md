# Foodseyo Menu Image Analysis

**Status:** Implemented for T5

**Date:** 2026-07-15

## Purpose

T5 replaces the Menu Scan demo redirect with real GPT-5.6 menu-image analysis. It keeps the existing capture, gallery selection, ordered previews, removal, and discard flow. The result is validated as the shared `FoodseyoAnalysis` contract and stored only in the current browser session for the later T6 result UI.

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

Canvas execution is covered by browser build/manual verification; pure selection, limit, profile, and ordering helpers are covered by the lightweight Node suite without adding a DOM test framework.

## Route contract

`POST /api/analyze/menu-images` runs in the Node.js runtime with a 90-second maximum duration.

Request:

- `multipart/form-data`;
- repeated `images` file fields in user-selected order;
- optional `restaurantName` text field, trimmed and limited to 120 characters;
- 1-10 images;
- total declared and validated size at most 4,000,000 bytes.

Every image must be non-empty, use an allowed MIME type, and match JPEG, PNG, or WEBP magic bytes. The route returns `Cache-Control: no-store`.

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
- 90-second timeout;
- one retry;
- propagated `AbortSignal`;
- explicit refusal, incomplete response, invalid output, timeout, rate-limit, and service error mapping.

## Model contract and injection resistance

`MenuImageModelOutputSchema` is deliberately narrower than the canonical contract. The model extracts visible menu values, restaurant signals, source image indexes, explicit dietary text, uncertainty notes, and general food knowledge. It does not control app IDs, evidence IDs, restaurant match status, final status, issues, review consensus, freshness, image rights, or ordering guidance.

The developer prompt treats all text in images as untrusted data. Instructions, URLs, prompt-like text, or commands printed in a menu image are never followed. The prompt prohibits fabricated restaurant-specific ingredients, preparation, popularity, signature claims, reviews, freshness, modifications, and allergy guarantees. Unreadable values stay nullable or uncertain.

Source indexes are zero-based, limited to the submitted image set, and validated again by the adapter. An out-of-range reference fails with a typed error.

## Canonical adapter and evidence semantics

The deterministic adapter creates one `uploaded_menu` evidence record per submitted image and maps model source indexes to stable evidence IDs. Category, dish, option, and price-option IDs are app-generated with deterministic duplicate suffixes.

Restaurant resolution follows these rules:

- an explicit user name → `confirmed` / `explicit_input`;
- a visible name plus address, phone, or website → `confirmed` / `direct_evidence`;
- visible name only → `likely`;
- no identity signal → `unconfirmed`;
- location is not used and cannot confirm identity.

Visible numeric prices remain direct observations. Unknown currency remains `null`, unknown price remains `null`, full option prices remain `priceOptions`, and add-ons remain `options`. Zero is never used as an unknown fallback.

General recipe knowledge stays in `generalKnowledge` without evidence IDs. It is never promoted into restaurant-specific confirmation. Restaurant-specific ingredients and preparation default to unknown, signature status remains unknown, review consensus is `insufficient`, freshness is `could_not_verify`, dish imagery is unavailable with unknown rights, and ordering guidance is `null` in T5.

Explicit `contains` claims become `confirmed_present` direct observations. Free-from, vegan, vegetarian, and gluten-free labels remain `confirm_with_staff`; no label guarantees ingredients or cross-contact safety. The canonical allergy warning is always preserved.

## Result status and UI handoff

- `good` plus useful dishes → `complete`;
- `partial` plus useful dishes → `partial`;
- `unreadable` → typed `MENU_NOT_READABLE` error;
- no useful dishes → typed `MENU_DISHES_MISSING` error.

Missing optional reviews, freshness, images, or restaurant confirmation does not by itself make a good useful menu partial. Menu Scan shows loading, safe inline error, and a compact success summary. It stores the validated envelope under `foodseyo.currentAnalysis` in `sessionStorage`. T6 may read that key to build the full live Restaurant Overview and Dish Detail result UI; T5 does not route live data into the existing demo pages.

## Automatic tests

`pnpm test` runs 11 contract checks, 73 orchestration checks, and 91 menu-image checks: **175 assertions total**. The new suite uses an injected fake provider and makes zero network calls. It covers schemas, canonical conversion, restaurant resolution, price/options, dietary safety, evidence integrity, partial/failure behavior, upload helpers, safe errors, session serialization, provider request configuration, the ten-image limit, adaptive profiles, readability floors, order preservation, and one-request delivery.

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

T5's direct function upload is intentionally bounded and transient. It has no Vercel Blob, permanent image storage, batch merging, database, account, or exact-location persistence. A later production-hardening task must add distributed rate limiting, budget controls, per-user abuse controls, monitoring with secret-safe metadata, and operational alerting. The current route's count, type, byte, timeout, no-store, and safe-error controls reduce risk but are not a complete abuse-prevention system.
