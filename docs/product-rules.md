# Foodseyo Product Rules

**Status:** Normative MVP definition through local C2.2-C structured-menu decisions

**Date:** 2026-07-17

This document defines the active MVP scope, information boundaries, safety rules, and roadmap. Detailed mechanics live in [input-architecture.md](./input-architecture.md), [analysis-flow.md](./analysis-flow.md), [data-contract.md](./data-contract.md), and [image-policy.md](./image-policy.md). Historical decisions remain in [decision-log.md](./decision-log.md).

## Product definition

> Foodseyo turns unfamiliar menu photos into source-honest, structured guidance for deciding what to order. The restaurant/menu link remains a validated future entry point.

The active convergence is:

```text
menu_images ───────┐
                   ├─→ shared canonical analysis → ordering guidance
restaurant_link ───┘
```

`menu_images` is live. `restaurant_link` currently has UI and URL syntax validation only; live analysis is T7.

## Home and menu intake

Home shows the exact heading `Know what you’re ordering.` and description `See the taste, texture, ingredients, and details behind every dish.` The link field precedes one full-width `Scan or upload a menu` CTA with `Take or choose menu photos.`

The CTA directly activates one native multi-file picker:

- JPEG, PNG, and WEBP only;
- one to ten images;
- picker order preserved;
- no `capture` hint;
- cancellation leaves Home unchanged;
- Files move to `/menu-scan` through React memory only;
- no permanent upload, browser database, Base64, or URL transport.

Foodseyo does not recreate or label device-native picker choices. It officially supports menu photos and does not add a separate classifier to police the subject of every selected file.

## Link honesty

The Home link field:

- accepts HTTP and HTTPS syntax;
- rejects malformed and unsafe schemes;
- makes no analysis request at T5.5;
- stores no submitted URL;
- never redirects to Demo or fabricates a completed result.

## Results

Analysis Overview retains restaurant match status, dishes found, extraction state, limitations, category-ordered dishes, menu-derived tags, Dish Detail links, and **Scan another menu**.

Dish Detail retains source-grounded description, ingredients, dietary/allergy cautions, ordering considerations, uncertainty, and the required safety notice. The product does not compare those fields with a stored user allergy, diet, or spice profile.

## Evidence and claims

Foodseyo distinguishes:

- direct menu evidence;
- general food knowledge;
- restaurant-specific evidence;
- explicit uncertainty and unavailable values.

General knowledge must never be presented as restaurant-confirmed. Restaurant match signals create candidates, not automatic confirmation. A `likely` match is not a numeric confidence score and should be communicated as uncertain.

Any future culinary baseline remains variable by region and preparation, versioned, reviewed, and explicitly labeled. It may fill missing menu context but cannot override contradictory source evidence. Basic tastes, flavor notes, textures, heat, and richness remain separate; heat adjustability is not the same claim as observed or typical heat. Unknown culinary, dietary, or allergen information never becomes absence or safety.

A user-entered restaurant name is a declaration, not independent verification. Without compatible source-stated identity it remains `likely` at restaurant scope. Source-stated names may confirm restaurant-level identity; branch scope requires preserved branch-specific evidence. Conflicting user and source names remain unconfirmed and neither identity is silently selected or combined. Location alone never confirms a restaurant or branch.

Price, currency, ingredients, preparation, dietary status, review claims, popularity, and freshness must retain their actual evidence basis. Missing evidence stays missing.

The first structured-menu projection may retain only an eligible source-backed base price and eligible canonical price options. It does not retain option-group add-on deltas, ranges, market-price markers, inferred prices, or converted amounts. A missing price creates no row and never becomes zero.

## Allergy and dietary safety

Menu-derived ingredient and dietary clues are informational and conservative. Foodseyo must never claim that a dish is allergy-safe. Every canonical result retains the notice that recipes and preparation may change and that ingredients and cross-contact must be confirmed with restaurant staff.

Unknown information must not become a match. Explicit menu labels may be shown with their limitations, but they are not a substitute for staff confirmation.

## Dish imagery

Dish imagery must have source and reuse-rights metadata. Unverified or unclear-rights assets remain hidden. AI-generated food imagery is not part of the MVP. Demo food assets remain clearly labeled and are not treated as live evidence.

## Storage and privacy

- Raw menu Files remain transient and are not permanently stored.
- `foodseyo.currentAnalysis` in `sessionStorage` is the only active Foodseyo storage key.
- Current results may survive refresh in the same tab but not browser restarts or other devices.
- Logs must not contain images, Base64, filenames, restaurant/menu content, provider raw output, API keys, or full canonical analysis.

## Canonical compatibility

The canonical reader supports legacy `FoodseyoAnalysis` `1.0.0`, C1.2 `1.1.0`, and current `1.1.1`. Missing provenance in the two older versions receives only the conservative reader fallback `basis: none` and `scope: unknown`. Legacy `restaurant_photo` and `restaurant_screen` enum branches and `user_provided_screen` evidence remain parseable only to avoid an unrelated migration. No Home control, public API route, provider override, or successful live analyzer exposes them; the default registry returns a typed capability-unavailable error.

## Out of MVP

- stored allergy, diet, avoided-ingredient, language, or spice profiles;
- user-profile comparison and personalized match/conflict calculations;
- T6, which is cancelled from the MVP;
- live link analysis before T7;
- restaurant identification before post-T7 reevaluation;
- map-app share-to-Foodseyo integration;
- authentication, permanent user history, or shareable result links;
- deployed application cache behavior without a Preview-proven release and explicit Production go/no-go approval;
- Preview or Production database mutation without a separately authorized rollout step.

## Roadmap

- **T5–T5.4.1:** menu-image vertical slice complete.
- **T5.5:** MVP Scope Alignment Cleanup.
- **T6:** cancelled from the MVP.
- **R1:** internal codebase and development workflow optimization; no product behavior change.
- **C1.1 / C1.1.1:** consistency and fingerprint foundations completed.
- **C1.2:** live menu-image consistency integration completed.
- **C1.2.1:** restaurant-resolution provenance correction completed.
- **C2.1-0.1:** exact-cache contracts and pre-provider preparation boundary completed.
- **C2.1-A:** managed database and environment setup completed.
- **C2.1-B:** four-table physical exact-cache schema and first Development migration completed.
- **C2.1-C:** pooled runtime database client, validated repositories, atomic ready-snapshot persistence, and rollback-only Development verification completed; no live cache behavior added.
- **C2.1-D:** exact snapshot cache lookup, hit/miss, quarantine, and best-effort post-provider persistence completed locally; no rollout or deployment.
- **C2.1-E:** pre-provider lease ownership, concurrency, polling, and failure policy completed locally; not deployed.
- **C2.1-F:** real Development database integrity and concurrency validation completed locally; not deployed.
- **C2.1-G:** rollout-readiness review completed locally; staged plan documented and Production rollout deferred.
- **C2.2-A:** scoped logical ERD v3 and future-domain audit completed locally; no schema or migration.
- **C2.2-A1:** C1 culinary and sensory contract preservation audit completed locally; no schema or migration.
- **C2.2-B:** physical integrity contract completed locally for the existing C2.1 boundary and minimal structured-menu candidate; no schema or migration.
- **C2.2-C:** scoped projection retention, invalidation, and price decisions completed locally; no schema, migration, or database access.
- **C2.2-D:** next unexecuted Drizzle/SQL draft; no migration or database execution.
- **C2.3 candidate:** Development-only structured menu projection after the C2.2 gates.
- **T7.1–T7.4:** restaurant/menu link analysis after C2.
- **T8:** restaurant identification, reconsider after T7.
- **Later:** culinary knowledge, personalization, personal food history, and community after their own gates.
- **Later:** map-app share-to-Foodseyo integration.

The Later item is documentation only. No share extension or inbound map-app share flow exists today.
