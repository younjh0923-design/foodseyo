# Foodseyo Canonical Live Results

**Status:** C1.2 canonical vNext rendering with legacy compatibility

**Date:** 2026-07-16

## Scope and routes

`/analysis` and `/analysis/dishes/[dishId]` render a validated `FoodseyoAnalysis` produced by the live `menu_images` flow. They read the current result after hydration and do not call a provider, OpenAI, web research, or another enrichment service.

The link entry remains visible on Home, but live link analysis is a separate T7 task.

## Data boundary

`foodseyo.currentAnalysis` in `sessionStorage` is the only live-result storage key. Reads distinguish success, missing data, invalid JSON, invalid schema, unsupported schema version, failed analysis, zero-dish analysis, and unavailable storage. Non-success states use the safe recovery UI and never fall back to Demo.

Refresh works in the same tab. New tabs, browser restarts, other devices, permanent history, and shareable result links are unsupported. Raw menu Files and Base64 are never stored with the canonical result.

## Overview

For canonical `1.1.0`, Overview cards use stored deterministic taste, flavor, heat, richness, and texture wording. Canonical `1.0.0` keeps its existing display fields. The Overview retains:

- restaurant name and match status;
- dishes found and extraction status;
- limitations under **What to keep in mind**;
- category-ordered menu lists and accessible Dish Detail links;
- menu-derived labels;
- optional canonical ordering guidance;
- **Scan another menu**.

There is no personalization card or empty personalization state. Removing it does not leave a reserved spacer between the summary/limitations and the remaining content.

## Dish Detail

Dish Detail shows nonempty canonical name, description, expectations, menu-derived ingredients, dietary/allergy caution notes, ordering notes, uncertainty, and the canonical safety notice. In `1.1.0`, stated ingredients and typical-but-unconfirmed ingredients have separate headings; uncertain ingredients are not rendered as confirmed tags and use the fixed summary `Some ingredients could not be confirmed.` It performs no comparison against stored user allergies, diets, or spice settings.

Menu-derived ingredient evidence and conservative uncertainty remain intact. Unknown information is never converted into a safety claim, and users are told to confirm ingredients and cross-contact with restaurant staff.

## Recovery and accessibility

Missing or invalid session data shows the centralized recovery state. Dish IDs are encoded safely, invalid IDs return to Overview, category and dish order are preserved, and 44 px targets, semantic headings, long-text wrapping, safe-area spacing, and reduced-motion behavior remain supported.
