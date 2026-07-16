# Foodseyo Canonical Live Results

**Status:** T5.4 implementation

**Date:** 2026-07-15

## Scope

`/analysis` is the common live destination for validated `FoodseyoAnalysis`, independent of the analyzer that produced it. T5.4 connects only `menu_images`. Restaurant photo/screen analysis remains T6, link analysis remains T7, and restaurant identification/candidate confirmation remains T8.

Routes:

- `/analysis` — canonical Restaurant/Menu Overview
- `/analysis/dishes/[dishId]` — canonical Dish Detail

Both Route files remain server-component shells. Small Client Components read the current result after hydration, so server rendering does not inspect browser storage and the initial UI cannot flash a false empty state.

## Data boundary

The only Live result source is `foodseyo.currentAnalysis` in `sessionStorage`. A read distinguishes success, missing data, invalid JSON, invalid schema, unsupported schema version, failed analysis, zero-dish analysis, and unavailable browser storage. Every non-success state uses the same safe recovery UI; implementation terms are not exposed. Invalid values may remove only the current-analysis key.

Refresh works in the same tab. New tabs, browser restarts, other devices, permanent history, and shareable results are unsupported. Canonical analysis is never placed in an RSC prop, URL, hash, query string, `localStorage`, IndexedDB, global singleton, database, Blob store, or other persistence service.

## View-model adapter

`src/lib/live-analysis-results.ts` is the pure presentation boundary. It:

- preserves canonical category order and dish order within a category;
- hides empty categories and places unknown category references under **Menu**;
- deduplicates category and dish IDs defensively;
- creates encoded Dish Detail paths and safe lookups;
- derives confirmed/likely restaurant labels, friendly dish counts, completeness, limitations, and optional canonical ordering guidance;
- maps only nonempty canonical Dish Detail sections;
- performs conservative browser-side Food Passport comparison.

It does not expose evidence/source IDs or invent prices, ratings, review claims, popularity, bestseller status, nutrition, allergy safety, or food images.

## Overview

The Overview shows the canonical restaurant label, confirmed/likely state, optional canonical contact details, dish count, friendly completeness, actual limitations, ordered categories, and accessible full-card Dish links. Ordering guidance is omitted unless the canonical result contains it. Food Passport can be set or edited with the existing provider and local-storage contract.

**Scan another menu** removes only `foodseyo.currentAnalysis`, clears pending in-memory image intake and local result state, returns Home, and preserves Food Passport and every unrelated storage key. The header back action also returns Home. Because Menu Scan uses `router.replace`, ordinary browser Back from Overview naturally returns to the prior Home entry.

## Dish Detail and Food Passport

Dish Detail shows only nonempty canonical fields: name, original name, pronunciation, category, description, expectations, ingredients, dietary/allergy notes, ordering notes, and uncertainty/evidence limitations. An invalid ID uses the safe **Dish not found** state and returns to Overview.

Food Passport comparison is deterministic and local. It can report a listed dietary match or conflict, a possible allergen, a spice level above the saved preference, or incomplete information. Unknown never becomes safe. Every allergy-sensitive result preserves the canonical instruction to confirm ingredients and cross-contact with restaurant staff.

## Recovery, Demo, and network behavior

Missing or invalid session data shows:

- **No menu results yet**
- **Scan or upload menu images to see what to order.**
- **Scan a menu**
- **Back home**

Live never imports Demo fixtures, redirects to Demo, or merges Demo data. Existing Demo Overview, Dish Detail, analyzer, and nearby architecture remain unchanged.

Overview and Dish Detail make zero result-page network calls. They use validated session data, the existing Food Passport provider, and static application assets only. Opening a Dish, going back, refreshing, or editing Passport never calls OpenAI.

## Responsive and accessibility rules

The result experience supports 320×568, 360×800, 375×812, 390×844, 430×932, and centered desktop layouts. It keeps horizontal content clipped, safe-area spacing, long-name wrapping, vertical category rendering, 44 px targets, semantic headings, keyboard access, focus-visible styles, text-and-icon warnings, polite loading status, and reduced-motion behavior. A 31-dish menu remains a normal vertical document without a virtualization dependency.
