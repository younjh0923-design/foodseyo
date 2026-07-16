# Foodseyo Menu Analysis Completion UI

**Status:** T5.3 implementation

**Date:** 2026-07-15

## Confirmed symptom and root cause

On Production iPhone Safari, a user selected one image, started analysis, saw the loading label end, and saw the button return without visible success, error, or storage feedback. The matching Vercel requests returned HTTP 200. T5 already rendered a compact success panel for a schema-valid response, but that panel and the error panel were inserted after the image grid and immediately before a sticky footer. The client did not move new feedback into the current viewport. A user who remained near the sticky action could therefore see loading end without seeing the newly inserted panel farther up or down the page.

The API handler was not found to return failure payloads as HTTP 200. It returns 200 only for `{ ok: true, analysis }`, maps failures to typed non-200 responses, preserves `Cache-Control: no-store`, and passes the request abort signal through the existing analyzer/provider path. The client also reads JSON once and validates the strict success/error schema. The defect was a general mobile feedback-visibility problem first reproduced on Safari, not evidence of a Safari-only state reset.

The previous independent `analyzing`, `analysisError`, `analysisSummary`, and `storageWarning` values also left avoidable race and invalid-combination risk. There was no synchronous guard before React applied the loading render and no client watchdog for a fetch that remained pending at the browser boundary.

## Explicit UI phases

Menu Scan now has one discriminated UI state:

- `idle`
- `preparing`
- `requesting`
- `success`
- `error`

Loading is derived only from `preparing` and `requesting`. Generic finalization clears timers, the active controller, and the attempt gate but does not reset success or error. A new attempt clears previous feedback. Adding or removing an image clears stale feedback. Preview, scrolling, provider handoff cleanup, and ordinary re-renders do not.

Success stores a compact summary and an optional storage warning. Error stores one safe user message and one of `input`, `network`, `timeout`, `api`, or `response`. Manual abort is silent and is not represented as timeout.

## Success and storage behavior

A completion requires all of the following:

1. response received;
2. JSON parsed once;
3. strict Foodseyo API response schema passed;
4. HTTP success and body `ok: true` agreed;
5. canonical analysis existed and was not `failed`;
6. compact summary derived;
7. success phase set;
8. `foodseyo.currentAnalysis` sessionStorage write attempted.

The summary is:

```text
{confirmed or likely restaurant label} · {dish count} dish/dishes · {complete or partial}
```

If identity is not confirmed or likely, the label is `Restaurant not confirmed`. Dish count comes from the canonical menu. Storage failure preserves success and adds:

> Menu analysis succeeded, but this browser could not keep the result for the next screen.

No raw storage exception is shown. No raw image is stored. No persistent storage was added.

## Mobile visibility and accessibility

Success uses `role="status"`, `aria-live="polite"`, and `aria-atomic="true"`. Errors use `role="alert"`. When either feedback phase first appears, Menu Scan calls `scrollIntoView({ block: "nearest" })` on the compact panel. Smooth movement is disabled when `prefers-reduced-motion: reduce` matches. Scroll margin keeps the panel clear of the sticky safe-area footer and iPhone browser controls without forcing focus.

After success, the action label is **Analyze again**. The panel remains visible. There is no `View results` action and no T6 Route.

## Timeout, abort, and duplicate prevention

The provider timeout remains 80 seconds and the Route maximum remains 90 seconds. Menu Scan adds a 105-second browser watchdog at the request boundary. It uses `AbortController` and `setTimeout`, not `AbortSignal.timeout()`, for Safari compatibility. Settlement and unmount clear the timer. Timeout shows exactly:

> The menu analysis took too long. Try again with fewer or clearer images.

The action becomes available for retry. Manual navigation or unmount aborts silently.

A synchronous, in-memory attempt gate permits one active request. Fast double taps are rejected before a second request can start. Monotonic attempt IDs prevent late success or failure from an older attempt from replacing the latest UI state. IDs are not persisted or logged.

## Verification status

The automated completion suite is network-free and covers the phase reducer, strict response handling, storage separation, duplicate gate, watchdog scheduling and cancellation, stale-response protection, and source-level mobile/accessibility guards. Local responsive QA records the viewports that were actually checked. A real paid OpenAI smoke is not run without both an already configured local key and an explicitly rights-cleared input image.

The original Production symptom on iPhone Safari is confirmed. Post-fix verification on the user’s physical iPhone Safari is pending after deployment; it must not be reported as completed by desktop automation.
