# Foodseyo Product Rules

**Status:** Frozen product rules with T5.4 canonical live-result clarification

**Date:** 2026-07-15

This document is the normative product definition for Foodseyo. It defines the product goal, information boundaries, safety rules, UX principles, and competition scope. Detailed input behavior is defined in [input-architecture.md](./input-architecture.md), the shared reasoning sequence in [analysis-flow.md](./analysis-flow.md), research behavior in [web-research-policy.md](./web-research-policy.md), and source-honest dish imagery in [image-policy.md](./image-policy.md).

## Official product definition

- **Product name:** Foodseyo
- **Category:** Your AI Travel Food Copilot
- **Core slogan:** Understand the menu. Order with confidence.
- **Final product goal:** Help a traveler decide what to order.

Foodseyo is not only a menu-scanning app. It accepts different kinds of restaurant information and turns available evidence into structured ordering guidance.

> Foodseyo accepts different kinds of restaurant information, including menu photos, restaurant images, screenshots, links, and location, and turns them into structured guidance for deciding what to order.

한국어 의미:

> Foodseyo는 메뉴 사진, 식당 사진, 캡처 화면, 식당 링크, 위치 정보 등 다양한 입력을 받아 사용자가 무엇을 주문할지 결정할 수 있도록 구조화된 정보를 제공한다.

## Product model

Users may begin through any one of six independent, parallel input paths:

- `menu_images`
- `restaurant_photo`
- `restaurant_screen`
- `restaurant_link`
- `nearby_search`
- `demo`

These are not mandatory steps in a vertical funnel. Menu scanning is one entry path, not the required first step. Every supported path converges on the same goal:

```text
Extract available evidence
→ Research missing information when useful
→ Normalize into a shared structured analysis
→ Help the user decide what to order
```

Restaurant identification is conditional. Foodseyo must continue to provide useful general dish explanations and ordering support when a restaurant cannot be confirmed.

## Restaurant identity states

Restaurant identity uses exactly four internal states:

| State | Meaning | Product behavior |
| --- | --- | --- |
| `confirmed` | The restaurant is established by input evidence or explicit user selection. | Restaurant-specific facts may be shown when supported by evidence. |
| `likely` | One candidate is plausible but not confirmed. | Show the candidate and ask the user to confirm; continue general dish guidance meanwhile. |
| `unconfirmed` | No restaurant could be confirmed. | Continue general dish and ordering guidance; label restaurant-specific information as unconfirmed. |
| `not_attempted` | Matching was not attempted or the user chose to continue without it. | Continue without blocking the analysis. |

Approved user-facing labels are:

- **Restaurant confirmed**
- **Likely match**
- **Restaurant not confirmed**

Foodseyo must not display numeric match probabilities such as “Restaurant match: 87%” or “93% confidence.”

## Restaurant identification rules

Possible identification signals include:

- restaurant name, sign, logo, address, or phone number;
- website, restaurant link, or user-provided restaurant name;
- price, currency, menu composition, or a restaurant screen;
- current location;
- explicit user selection or final confirmation.

Current location is a supporting signal, not sufficient proof by itself. Foodseyo must not request location permission automatically on Home. It should request location only after the user enters a location-relevant context and must offer:

- **Use my location**
- **Enter restaurant name**
- **Continue without matching**

Denying location permission must not block core ordering support.

## Information hierarchy

Every result must distinguish two information layers.

### General dish knowledge

- general definition and regional background;
- typical taste, texture, spice level, and common ingredients;
- similar dishes;
- general ordering considerations.

### At this restaurant

- descriptions visibly present in an uploaded menu or user-provided screen;
- confirmed prices and options;
- official menu information;
- confirmed restaurant-specific ingredients or preparation details;
- confirmed signature-dish status;
- review findings backed by accessible evidence;
- restaurant-specific facts verified through official or public sources.

General food knowledge must never be presented as a restaurant-specific fact.

## Evidence and data rules

Foodseyo separates where information came from, how a claim was produced, and whether a value was obtained. These are independent fields in the shared data contract.

`EvidenceSourceType` records an actual source or user-provided evidence location:

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

`ClaimBasis` records how a claim was established:

- `direct_observation`
- `external_source`
- `general_food_knowledge`
- `ai_inference`
- `user_confirmation`
- `deterministic_calculation`

`Availability` records whether the value was obtained:

- `available`
- `unknown`
- `unavailable`
- `insufficient`

AI inference is not an evidence source. General food knowledge is a claim basis, not restaurant evidence. `unavailable` describes value availability, not provenance.

When evidence is absent, Foodseyo must not invent or assert:

- actual restaurant ingredients or cooking methods;
- signature-dish status;
- unverified reviews or review consensus;
- missing prices or options;
- menu freshness guarantees;
- allergy safety, absence of cross-contact, or dietary safety.

Unknown data uses explicit fallback values:

- unknown price → `null`
- unknown spice → `unknown`
- insufficient review evidence → `insufficient`
- unidentified restaurant → `unconfirmed`
- unverified freshness → `could_not_verify`

## MVP data handling

- `FoodseyoAnalysis` stores input context and normalized results, not original image bytes, `File` objects, `Blob` objects, or base64 image data.
- API keys and authentication tokens are never stored in analysis results.
- Exact user-location coordinates are not permanently copied into analysis results. The contract may record that location was used; a restaurant's public location is a separate field.
- MVP analysis inputs and results are session-only by default.
- Login, database storage, permanent image storage, and server-side user accounts remain post-submission scope.
- Server logging should not record original images, API keys, authentication tokens, or exact user location.

## Dish image policy

Foodseyo MVP does not generate dish images with AI. GPT-5.6 analysis of user-provided menu, restaurant, and screen images remains P0; generating replacement food photography is a separate capability and is not part of the MVP.

Dish imagery follows this order:

1. an image in a user-uploaded menu or restaurant screen;
2. an image clearly connected to the dish on an official menu;
3. an image clearly connected to the dish on an official website;
4. an image clearly connected to the dish on a confirmed official social account;
5. a rights-cleared, source-traceable general dish reference;
6. an accessible placeholder.

General references must be labeled as references with **Actual presentation may differ.** They must never be presented as restaurant-specific images. Missing imagery does not block dish explanation or ordering support. Source categories, labels, rights checks, future metadata requirements, and missing-image behavior are defined in [image-policy.md](./image-policy.md).

## Dietary safety

Dietary status uses:

- `confirmed_present`
- `likely_present`
- `confirmed_absent`
- `may_be_modifiable`
- `unknown`
- `confirm_with_staff`

General recipes must not be used to declare restaurant-specific allergy safety. The required safety notice is:

> Recipes and preparation practices may change.<br>
> Foodseyo cannot guarantee allergy safety.<br>
> Confirm ingredients and cross-contact directly with restaurant staff.

## UX and design rules

- Use ergonomic, minimal, mobile-first interaction inspired by Apple’s clarity principles.
- Minimize the number of user actions and give every screen one clear purpose.
- Support one-handed use with touch targets of at least 44 px.
- Provide clear progress, success, failure, and recovery states.
- Ask for sensitive permissions only in context.
- Prefer structured UI over chat when ordinary UI can resolve the task.
- Do not trigger a new AI call when a user opens a menu card or switches a tab.
- Treat multi-image input as a basic convenience, not a differentiator or core marketing claim.
- Do not force the number of representative dishes to exactly three.
- Keep deterministic, calculable order recommendations in TypeScript; use the Assistant only as support.

### T5.2 Home entry surface

The persistent Home surface contains only the brand, one ordering question and explanation, one restaurant/menu link field, and two equal action cards in this order:

1. **Food Passport** — personalization settings, not an analysis input;
2. **Scan or upload** — a Bottom Sheet with **Take a photo** and **Choose from photos**.

Nearby search, recent analysis, fixed demo cards, and separate screenshot/menu cards are hidden from Home without deleting their routes or analyzer architecture. Home action count does not need to equal the six canonical input types. At T5.2, selected images prepare the existing Menu Scan session; only `menu_images` has a live provider. Restaurant photo, restaurant screen, restaurant link, and nearby live analysis remain deferred.

The visible link field performs local HTTP/HTTPS syntax validation only. A valid link receives an honest coming-soon message; it is not fetched, persisted, sent to a provider, or redirected to Demo.

## Competition P0 scope

There is no separate P1 list for the competition. All of the following are P0 before submission.

### P0 — Parallel Inputs

- menu images;
- restaurant photos;
- restaurant screens;
- restaurant links;
- nearby restaurants based on current location;
- a clearly labeled demo restaurant.

### P0 — Core Understanding

- GPT-5.6 structured analysis;
- GPT-5.6 analysis of uploaded menu, restaurant, and screen images, without generating dish images;
- menu and restaurant-signal extraction;
- general dish explanations;
- taste, texture, spice, and common ingredients;
- separation of general knowledge and restaurant-specific facts;
- fallback when a restaurant is not confirmed;
- one shared structured analysis result.

### P0 — Restaurant and Evidence Enrichment

- restaurant identity state;
- location-based candidate discovery;
- explicit user confirmation;
- OpenAI web search research;
- official site and menu research;
- public review research;
- review consensus and limitations;
- menu freshness state;
- search-failure fallback.

### P0 — Ordering Decision Support

- Restaurant Overview and Dish Detail;
- Reviews and Dietary views;
- Food Passport;
- TypeScript order recommendations using party size, budget, goal, and sharing preference;
- GPT-5.6 supporting Assistant;
- staff-question generation;
- demo fallback.

### P0 — Submission

- public GitHub repository;
- Vercel production deployment;
- README;
- Codex `/feedback`;
- public YouTube demo video;
- Devpost submission;
- mobile QA, error handling, accessibility, and API-key security.

The internal implementation order is:

1. Freeze product documentation.
2. Define the shared data contract.
3. Build the shared analysis orchestrator.
4. Implement menu-photo analysis.
5. Implement restaurant-photo and screen analysis.
6. Implement link analysis.
7. Implement restaurant identification and user confirmation.
8. Add web research and evidence enrichment.
9. Connect the shared result UI.
10. Complete order recommendations.
11. Add the GPT-5.6 Assistant.
12. Prepare demo assets.
13. Complete QA.
14. Prepare submission materials.

### Current checkpoint roadmap

- **T5.4 — Canonical Live Results and Automatic Navigation:** complete the live `menu_images` vertical slice through `/analysis` and `/analysis/dishes/[dishId]` without another model call.
- **T6 — Restaurant photo and restaurant-screen analysis:** unchanged and not started by T5.4.
- **T7 — Restaurant/menu link analysis:** unchanged and not started by T5.4.
- **T8 — Restaurant identification and candidate confirmation:** unchanged and not started by T5.4.
- **Later:** Nearby discovery, database/account/history, and shareable result links.

Every future analyzer converges on the same validated canonical result destination. The result Routes do not fetch, enrich, infer popularity, or call AI again. They display only the current canonical result plus conservative, deterministic Food Passport comparisons.

## Post-submission scope

The following are explicitly outside the competition submission scope:

- login, database, and server-side user accounts;
- Community Dish Photos & Reviews, including user photo uploads, public review creation, image storage, reporting, deletion, and moderation;
- synchronized favorites;
- PWA, Capacitor, App Store distribution, and payments;
- voice input;
- reservations, directions, and map-first UI;
- background location tracking;
- fully automatic matching for every restaurant worldwide;
- collection of every review on the internet.
