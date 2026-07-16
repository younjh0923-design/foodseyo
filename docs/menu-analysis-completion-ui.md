# Foodseyo Menu Analysis Completion UI

**Status:** T5.4 canonical live-result navigation

**Date:** 2026-07-15

## Purpose

T5.3 established explicit completion, timeout, duplicate-request, stale-response, and mobile-feedback safeguards. T5.4 completes the menu-image vertical slice: after one successful analysis, Foodseyo validates and confirms session persistence, enters `navigating`, and replaces Menu Scan with the canonical `/analysis` destination. No second model or network call is made.

## Explicit UI phases

Menu Scan uses one discriminated state:

- `idle`
- `preparing`
- `requesting`
- `navigating`
- `success` — abnormal storage or navigation fallback only
- `error`

Loading is derived from `preparing`, `requesting`, and `navigating`. All three use exactly **Reading your menu…** with **This can take up to a minute for detailed menus.** No percentage or fabricated model stage is shown. Generic finalization clears request resources but does not reset `navigating`. The attempt gate remains held through normal navigation and is released by unmount or a navigation fallback.

## Normal success order

Normal success is frozen as:

```text
response JSON parsed once
→ strict API response validation
→ ok: true and HTTP success agree
→ canonical schema and semantic validation
→ non-failed result with at least one dish
→ write foodseyo.currentAnalysis to sessionStorage
→ read the value back and validate it again
→ navigating
→ router.replace("/analysis")
```

API success alone is not completion. A confirmed, schema-valid session write is required before navigation. Normal success shows no completion card, **Analyze again**, **View results**, or extra action. Menu Scan contains one `/api/analyze/menu-images` call site, and result navigation never reanalyzes.

## Abnormal completion fallbacks

Storage failure remains on Menu Scan with:

- heading: **Menu analysis complete**
- message: **This browser could not keep the result for the next screen.**
- no automatic navigation

Navigation failure remains on Menu Scan with:

- heading: **Menu analysis complete**
- message: **We couldn't open the results automatically.**
- action: **Open menu results**

After `router.replace`, one short fallback checks whether the browser is still at `/menu-scan` and whether the stored canonical result remains valid. It may call `window.location.replace("/analysis")` once. It does not loop, duplicate a model request, or place analysis data in the URL. Raw storage, navigation, JSON, and framework errors are never shown.

## Existing safeguards

The provider timeout remains 80 seconds, the Route maximum remains 90 seconds, and the browser watchdog remains 105 seconds. A synchronous attempt gate prevents fast duplicate submissions. Monotonic attempt IDs prevent late responses from navigating or overwriting a newer attempt. Settlement and unmount clear the watchdog, request controller, navigation timer, and preview object URLs. Manual abort remains silent.

## Accessibility and mobile behavior

Loading is announced through a polite live region. Fallback completion uses `role="status"`; failures use `role="alert"`. The T5.3 reduced-motion-aware feedback scrolling remains for abnormal completion and errors. Controls retain 44 px minimum targets, focus-visible styling, safe-area padding, and a 320 px minimum layout.

## Verification status

The network-free automated suites cover reducer transitions, strict response handling, readback-confirmed persistence, all stored-result read states, duplicate/stale guards, watchdog behavior, automatic navigation source order, one-shot hard fallback, and exact recovery copy. A paid OpenAI smoke is not run for this checkpoint. The already confirmed physical iPhone success established that the analyzer and persistence path work; post-T5.4 automatic navigation and live-result verification on the user's iPhone remains a user QA step.

## Post-200 response boundary hardening

The first Production iPhone retest after T5.4 showed the generic connection message even though Vercel recorded `POST /api/analyze/menu-images` as HTTP 200. The historical request cannot be assigned to a more specific client stage because the previous parser used `response.json().catch(() => null)` and collapsed body-read, JSON, API-schema, HTTP/body mismatch, failed-status, empty-menu, and semantic failures into one `response` error. A server 200 excludes the typed server non-200 path, but it does not by itself prove that the browser read and validated the body.

The client now reads response text once, parses JSON separately, then applies API schema, HTTP/body consistency, failed-status, dish-presence, and semantic checks in order. Each stage has distinct safe copy. Only a fetch `TypeError` uses connection guidance. Storage and navigation retain their existing completion fallbacks.

Every server response includes a random `X-Foodseyo-Correlation-Id`. The client may show only its first eight safe characters as a support reference. Production observation records exactly correlation ID, HTTP status, duration, response byte length, failure-stage code, structural error count, and semantic error count. It does not record images, filenames, restaurant or dish names, menu text, secrets, provider output, or canonical payloads.

The network-free regression suite validates small and 31-dish synthetic success bodies, body-read failure, truncated JSON, HTML 200, invalid API schema, HTTP/body mismatch, failed status, empty menu, semantic failure, network `TypeError`, storage failure, navigation failure, response correlation, and privacy-safe observation fields. The synthetic 31-dish response is measured at runtime and parses successfully; no paid request is used.
