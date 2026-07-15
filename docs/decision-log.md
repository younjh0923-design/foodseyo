# Foodseyo Decision Log

This log records accepted product and architecture decisions frozen in T2. Changes require an explicit later decision that supersedes the relevant entry.

## D-001 — Foodseyo brand

- **Decision:** The official product name is Foodseyo.
- **Reason:** One stable brand is required across the product, submission, repository, and demo.
- **Impact:** Product copy and submission materials use Foodseyo consistently.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-002 — Product category

- **Decision:** The official category description is “Your AI Travel Food Copilot.”
- **Reason:** The product supports a traveler through restaurant and ordering decisions rather than only translating menus.
- **Impact:** Positioning must describe a travel food copilot, not a scanner-only utility.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-003 — Final product goal

- **Decision:** Foodseyo’s final goal is to help the user decide what to order.
- **Reason:** Extraction, research, and explanation are intermediate capabilities rather than the final user outcome.
- **Impact:** Every primary flow must converge on structured ordering guidance.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-004 — Parallel input paths

- **Decision:** Menu images, restaurant photos, restaurant screens, restaurant links, nearby search, and demo are independent parallel entry paths.
- **Reason:** Travelers begin with different evidence depending on their context.
- **Impact:** No input is a mandatory prerequisite for another input.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-005 — Menu scan is one entry point

- **Decision:** Menu scanning is one entry path, not the entire product flow or a required first step.
- **Reason:** Foodseyo must also work from restaurant identity, links, screens, photos, and location.
- **Impact:** Product architecture and messaging must not impose a scan-first funnel.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-006 — Shared analysis normalization

- **Decision:** Every supported input normalizes into one shared structured analysis.
- **Reason:** Restaurant, dish, evidence, dietary, and ordering UI should behave consistently regardless of entry path.
- **Impact:** Input-specific extraction feeds a common result model rather than separate product silos.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-007 — Mobile-first Next.js

- **Decision:** Foodseyo is a mobile-first Next.js product.
- **Reason:** Travelers need an accessible web experience that works quickly on a phone without an app-store install.
- **Impact:** Architecture, routing, performance, accessibility, and QA prioritize mobile web.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-008 — UI-first development

- **Decision:** Development remains UI-first.
- **Reason:** The product must make the decision flow understandable before adding complex model and research integrations.
- **Impact:** Data and AI capabilities are connected to explicit user states and structured surfaces.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-009 — Structured UI before chatbot

- **Decision:** Structured UI is the primary experience; chatbot interaction is secondary.
- **Reason:** Most ordering tasks are faster and clearer through cards, sections, filters, and planners.
- **Impact:** The Assistant handles exceptional follow-up questions rather than replacing core navigation.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-010 — Useful fallback without restaurant confirmation

- **Decision:** Foodseyo provides general dish explanations and ordering help even when the restaurant is unconfirmed.
- **Reason:** A readable menu remains useful without successful restaurant matching.
- **Impact:** Matching failure does not block What it is, taste, texture, spice, ingredients, background, similar dishes, or general ordering considerations.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-011 — Location cannot auto-confirm a restaurant

- **Decision:** Current location alone must never automatically confirm a restaurant.
- **Reason:** Multiple restaurants can be near the same coordinates, and location may be imprecise.
- **Impact:** Location narrows candidates only and is requested in context, never automatically on Home.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-012 — Users confirm candidate restaurants

- **Decision:** A likely restaurant candidate is confirmed by the user before ambiguous restaurant-specific facts are treated as confirmed.
- **Reason:** User confirmation is safer and clearer than hidden confidence thresholds.
- **Impact:** The product shows a likely match without numeric probability and provides a confirmation action.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-013 — OpenAI web search is the default research provider

- **Decision:** OpenAI Responses API web search is Foodseyo’s default web research provider.
- **Reason:** It can support restaurant discovery, official site and menu lookup, public review research, and evidence enrichment in one research flow.
- **Impact:** Planned research orchestration uses OpenAI web search first and preserves source provenance.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-014 — Google Places is optional

- **Decision:** Google Places is an optional supporting provider, not a required dependency.
- **Reason:** The requirement is accurate candidate discovery and user confirmation, not a specific API.
- **Impact:** A places API is considered only if nearby accuracy, exact place IDs, or distance ordering require it and schedule permits.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-015 — Public menu and review research uses web search

- **Decision:** Official menus and publicly accessible review evidence are researched through OpenAI web search by default.
- **Reason:** One evidence-aware research path reduces unnecessary platform coupling.
- **Impact:** Research uses public sources and does not claim access to restricted or exhaustive review data.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-016 — No evidence, no generated fact

- **Decision:** Foodseyo must not generate or assert facts that lack supporting evidence.
- **Reason:** Unsupported restaurant facts can mislead ordering and safety decisions.
- **Impact:** Missing facts use explicit unknown, unavailable, insufficient, or unconfirmed states.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-017 — Multi-image input is not the differentiator

- **Decision:** Multiple-image input is a basic convenience, not Foodseyo’s differentiator or core marketing claim.
- **Reason:** The product value is structured ordering guidance across many input types.
- **Impact:** Multi-image capture remains useful but is not positioned as the central product concept.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-018 — Representative dish count remains data-driven

- **Decision:** The number of representative dishes is not fixed to exactly three.
- **Reason:** Available evidence and restaurant context determine how many representative dishes are justified.
- **Impact:** UI and data remain flexible instead of fabricating or hiding dishes to reach a fixed count.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-019 — Cards and tabs do not call AI again

- **Decision:** Opening menu cards or switching result tabs must not trigger additional AI calls.
- **Reason:** Existing normalized results should be instant, predictable, and economical to explore.
- **Impact:** AI work happens during explicit analysis or exceptional Assistant interactions, not ordinary navigation.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-020 — Prices and reviews require evidence

- **Decision:** Foodseyo does not invent prices, reviews, or review consensus.
- **Reason:** These are restaurant-specific claims that require direct or public evidence.
- **Impact:** Unknown prices are `null`, and insufficient review evidence is `insufficient`.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-021 — Allergy safety is never guaranteed

- **Decision:** Foodseyo must never guarantee allergy safety or absence of cross-contact.
- **Reason:** Recipes and kitchen practices can change and cannot be established from general knowledge alone.
- **Impact:** Allergy-sensitive results include the required safety notice and direct users to restaurant staff.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-022 — TypeScript owns calculable order recommendations

- **Decision:** Deterministic, calculable order recommendation logic is implemented in TypeScript.
- **Reason:** Quantities, budgets, and combinations should be testable and repeatable.
- **Impact:** AI may explain recommendations but does not replace straightforward calculation.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-023 — AI Assistant is supporting functionality

- **Decision:** The AI Assistant is a supporting feature for exceptional questions.
- **Reason:** Core understanding and ordering decisions should not require chat.
- **Impact:** The Assistant supplements structured screens with comparisons, explanations, and staff-question drafting.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-024 — Former P1 capabilities are P0

- **Decision:** There is no separate P1 list for the competition; the previously deferred core capabilities are part of P0.
- **Reason:** Parallel input, evidence enrichment, ordering support, QA, and submission readiness are all required for the intended competition product.
- **Impact:** Scope planning uses the complete P0 list in `product-rules.md`.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-025 — Deferred post-submission platform scope

- **Decision:** Login, database, server accounts, synchronized favorites, PWA, Capacitor, App Store distribution, payments, voice, reservations, directions, map-first UI, and background location tracking are post-submission work.
- **Reason:** These capabilities do not define the competition’s core ordering-decision experience.
- **Impact:** Competition development stays focused on the documented P0 product and does not begin deferred platform work.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-026 — No AI-generated dish images in the MVP

- **Decision:** Do not generate dish images with AI for the Foodseyo MVP.
- **Reason:** AI-generated images increase cost and latency and may not accurately represent the dish or the restaurant’s actual presentation.
- **Impact:** The MVP uses verified user-provided or official images, rights-cleared general reference images, or honest placeholders.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-027 — Source-honest general dish references

- **Decision:** Use source-honest general dish references when official images are unavailable.
- **Reason:** Some restaurants do not provide official dish photography, but users may still benefit from a clearly labeled visual reference.
- **Impact:** General reference images must have clear provenance and usage rights, must be labeled as references, and must never be presented as restaurant-specific dish images.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-028 — Community Dish Photos & Reviews after submission

- **Decision:** Add Community Dish Photos & Reviews after the initial submission.
- **Reason:** A growing user community can provide real dish photos and practical menu experiences when official restaurant images are unavailable.
- **Impact:** The future feature requires accounts, storage, consent, restaurant and dish association, upload dates, reporting, deletion, moderation, freshness indicators, and source labels.
- **Status:** Accepted
- **Date:** 2026-07-15
