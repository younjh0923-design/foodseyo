# Foodseyo Web Research Policy

**Status:** Frozen for T2

**Date:** 2026-07-15

This policy governs restaurant discovery, menu verification, public review research, image-source discovery, and evidence enrichment. It applies only when research would add information that is missing or useful for deciding what to order. Dish image usage is governed by [image-policy.md](./image-policy.md).

## Default provider

Foodseyo’s default web research provider is **OpenAI Responses API web search**.

Approved research purposes are:

- find restaurant candidates;
- find an official restaurant website;
- find official or publicly accessible menus;
- find publicly accessible review evidence;
- research public opinions about a specific dish;
- compare an uploaded menu with online menu evidence;
- find evidence relevant to menu freshness;
- find official pages that clearly connect a dish to an image;
- find original source and provenance pages for possible reference images.

Research should be targeted. It must not repeat facts already established by the input unless corroboration is useful.

## Google Places status

Google Places or another dedicated place API is not a required technical dependency. It may be considered only as an optional supporting provider when:

- OpenAI web search does not produce accurate enough nearby candidates;
- exact place IDs or distance-ordered candidates are required;
- the competition schedule has sufficient time.

The product requirement is to find plausible restaurants and let the user confirm one, not to mandate a specific places API.

## Public-source boundary

Foodseyo uses only publicly accessible evidence, including:

- official restaurant websites;
- official online menus;
- public review pages;
- public restaurant profiles or introductions;
- public articles;
- sources accessible through search results.

Foodseyo must not claim that it:

- analyzed every review on the internet;
- can access all restricted or login-gated reviews;
- knows which platform is inherently more trustworthy;
- determined whether an individual review is fake;
- produced a simple average of unrelated platform scores.

## Image source discovery

OpenAI web search may find official restaurant pages, official menus, official pages containing dish images, original image source pages, and provenance information for possible general references.

Search results identify candidates; they do not grant usage rights. Before Foodseyo uses an image, it must verify:

- the original source page;
- usage rights or license;
- attribution requirements;
- the image’s accurate connection to the dish;
- whether the image is restaurant-specific.

Do not use an unverified search-result image, a search thumbnail alone, an image with unclear copyright, another restaurant’s image presented as the current restaurant, or an image whose source cannot be traced. If no source-honest image is available, use an accessible placeholder. The MVP does not use AI-generated dish images.

## Restaurant identity research

Web research may use names, signs, logos, addresses, phone numbers, websites, links, currencies, menu composition, screens, location, and user input to find candidates.

Research results may establish `likely`, but the user should confirm an ambiguous candidate. Current location alone never establishes `confirmed`, and numeric match confidence is not shown.

## Review research

Review findings must be evidence-backed and summarize recurring opinions rather than fabricate a platform-neutral score.

Each review result should include:

- source group count;
- evidence count;
- freshness;
- repeated positives;
- repeated negatives;
- disagreements;
- limitations;
- sources.

Review consensus uses exactly:

- `strong`
- `moderate`
- `mixed`
- `insufficient`

When evidence is not adequate, show:

> Insufficient evidence

Do not generate unverified review content. Do not present general dish reputation as review evidence for a specific restaurant.

## Menu freshness

Foodseyo may compare an uploaded menu with:

- an official website menu;
- an official online ordering menu;
- a publicly accessible menu;
- recent public restaurant information.

Freshness status uses:

| Internal status | User-facing label |
| --- | --- |
| `verified_against_official_source` | Verified against an official source |
| `possible_differences` | Possible differences found |
| `could_not_verify` | Could not verify |

Foodseyo never guarantees that a menu is certainly current. Prohibited claims include:

- “This is definitely the latest menu.”
- “This menu is completely up to date.”

## Evidence provenance

Research results keep three separate properties defined in [product-rules.md](./product-rules.md):

- `EvidenceSourceType` records the actual source, such as `official_menu`, `official_website`, `official_social`, `public_web`, or `web_search_result`.
- `ClaimBasis` records how the claim was formed, such as `external_source` or `ai_inference`.
- `Availability` records whether the value is `available`, `unknown`, `unavailable`, or `insufficient`.

AI is not an evidence source. `ai_inference` may be the claim basis while the supporting public pages remain the evidence sources. `unavailable` is an availability state and must not be stored as provenance. Search output is not automatically a restaurant-specific fact; each important claim retains source IDs and an appropriate limitation.

## Missing-evidence rules

Without evidence, research must not generate:

- restaurant ingredients or cooking methods;
- signature-dish status;
- reviews or consensus;
- prices or options;
- menu-freshness guarantees;
- allergy safety or absence of cross-contact;
- dietary-safety guarantees.

Use explicit fallbacks: `null`, `unknown`, `insufficient`, `unconfirmed`, `could_not_verify`, or an `unavailable` availability state as applicable.

## Dietary and allergy safety

General recipes may inform general dish knowledge but cannot confirm restaurant preparation. Dietary results must distinguish `confirmed_present`, `likely_present`, `confirmed_absent`, `may_be_modifiable`, `unknown`, and `confirm_with_staff`.

Every allergy-sensitive result must preserve this warning:

> Recipes and preparation practices may change.<br>
> Foodseyo cannot guarantee allergy safety.<br>
> Confirm ingredients and cross-contact directly with restaurant staff.

## Failure and fallback

- Failed search does not invalidate evidence already extracted from the input.
- Failed matching returns `unconfirmed` and keeps general ordering support available.
- Missing review evidence returns `insufficient`.
- Missing freshness evidence returns `could_not_verify`.
- External-service failure preserves a clearly labeled demo path.
- The UI must state limitations instead of filling gaps with unsupported content.
