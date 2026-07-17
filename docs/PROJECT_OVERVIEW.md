# Foodseyo Project Overview

**Purpose:** Stable product and competition context
**Updated:** 2026-07-17

## Product definition

> Foodseyo is a source-honest, mobile-first food copilot that turns unfamiliar menu photos into structured food guidance so people can decide what to order, not merely translate what the menu says.

Foodseyo sits between unfamiliar menu words and an actual eating decision. A translation may reveal a dish name while leaving the diner unsure about taste, texture, heat, richness, ingredients, dietary implications, or which details are uncertain. Foodseyo converts supported evidence into one canonical explanation designed for ordering.

## Audience and problem

The primary audience is travelers and other diners who are unfamiliar with a menu's language or food culture. Secondary audiences include immigrants, international students, cautious explorers, and people who need conservative dietary or allergy-related context.

The product problem is not simply language conversion. A diner needs to understand:

- what a dish is likely to taste and feel like;
- how spicy, rich, or unfamiliar it may be;
- which ingredients the menu states and which are only typical or uncertain;
- what ordering considerations or limitations matter;
- what must still be confirmed with restaurant staff.

Foodseyo provides decision support, not medical advice. It never guarantees allergy safety.

## Product principles

1. **Decision support over translation.** Explain the food experience and the evidence behind it.
2. **Structure over open-ended chat.** Produce a reusable, validated analysis rather than an unconstrained answer.
3. **Source honesty.** Keep direct menu evidence, general food knowledge, restaurant evidence, and uncertainty distinct.
4. **Deterministic application ownership.** Application code owns canonical validation, IDs, evidence links, wording rules, safety notices, and storage.
5. **Consistency with explicit identity.** Controlled vocabularies, semantic validation, version metadata, and fingerprints reduce drift and define safe exact reuse.
6. **Conservative safety.** Missing evidence remains missing, uncertain claims remain uncertain, and restaurant confirmation remains necessary.
7. **Data minimization.** Raw images stay transient; secrets and sensitive analysis content stay out of logs.

## Active competition MVP

The active live input is `menu_images`:

```text
one to ten ordered menu photos
→ browser validation and adaptive preprocessing
→ one explicitly triggered GPT-5.6 Responses API request
→ deterministic adaptation and canonical validation
→ current-tab session storage
→ Analysis Overview and Dish Detail
```

The Home restaurant/menu link field performs local HTTP/HTTPS syntax validation only. It does not fetch, analyze, redirect to a demo result, or claim completion.

The current result experience may include:

- restaurant-resolution status and limitations;
- menu categories and dishes;
- taste, texture, heat, and richness;
- ingredients labeled as stated, typical, or uncertain;
- dietary and allergy cautions;
- ordering considerations;
- explicit evidence references and uncertainty;
- a route back to scan another menu.

## Competition positioning

Foodseyo targets the OpenAI Build Week **Apps for Your Life** track. The core demonstration is:

```text
unfamiliar menu
→ source-honest GPT-5.6 interpretation
→ coherent mobile result
→ better-informed ordering decision
```

GPT-5.6 supplies structured menu interpretation. Codex has accelerated the product-scope cleanup, canonical contracts, provider hardening, consistency system, network-free regression coverage, database design audit, infrastructure verification, and staged exact-cache implementation.

The database/cache work is an enabling trust layer, not the primary product pitch. It should make repeated analysis consistent, efficient, and safe without obscuring the user outcome.

## Current technical shape

- Next.js, React, and TypeScript mobile-first web application
- server-only OpenAI Responses API integration using GPT-5.6
- strict Zod canonical and provider-output validation
- deterministic normalization, wording, and semantic validation
- source, dish, analysis-result, and snapshot fingerprints
- current-tab `sessionStorage` result handoff
- Vercel application infrastructure
- isolated Neon Development, Preview, and Production branches
- Drizzle and PostgreSQL four-table exact-cache schema on Development only
- network-free automated validation and production build checks

Runtime database repositories and cache lookup are not live yet. Preview and Production have not received the application schema.

## Explicit non-goals for the active MVP

- restaurant link fetching or analysis before T7;
- restaurant-photo, sign, map, or screenshot analysis;
- automatic restaurant or branch identification before post-T7 reevaluation;
- stored profiles, personalization, or recommendation scoring;
- Food Passport, community, reviews, reservations, payments, or accounts;
- permanent raw-image storage or permanent user analysis history;
- map-app sharing or native-app distribution;
- unsupported capabilities simulated with demo data.

The repository may retain compatibility types or clearly labeled deterministic demo routes. Their presence does not make those inputs or features live.

## Roadmap

### Context maintenance

- keep this stable overview separate from the volatile handoff;
- keep README, product rules, roadmap, and handoff state aligned with completed checkpoints;
- preserve the existing live analysis behavior and Production baseline unless a reviewed checkpoint explicitly changes them.

### C2.1 exact-cache runtime

1. **C2.1-C:** pooled runtime database client, repositories, validated reads/writes, and atomic ready-snapshot persistence.
2. **C2.1-D:** exact snapshot lookup, cache hit/miss behavior, and corrupt-snapshot quarantine.
3. **C2.1-E:** lease ownership, duplicate-request control, bounded polling, and failure recovery.
4. **C2.1-F:** real Development database integrity and concurrency tests.
5. **C2.1-G:** explicitly reviewed Preview and Production rollout with recovery checks.

C2.1-D may implement and validate cache integration, but it must not be rolled out or deployed before C2.1-E is complete and the required C2.1-F validation passes.

### After the exact-cache rollout

- audit C2.2–C2.4 before broader relational modeling or dish-level reuse;
- implement T7 restaurant/menu link acquisition with URL normalization, SSRF defense, source classification, evidence extraction, and identity rules;
- reconsider T8 restaurant and branch identification only after T7 evidence is available;
- evaluate personalization, Food Passport, nearby discovery, community, multilingual expansion, PWA/native distribution, and map sharing after the competition MVP.

## Submission critical path

The working product is more important than the number of planned features. Before submission:

1. keep the live menu-photo flow green;
2. complete only database/cache stages that pass their full validation gates;
3. freeze features before final QA;
4. verify the mobile Production experience and safe failure paths;
5. prepare a public repository and setup-ready README;
6. record a public demo video under three minutes;
7. explain where GPT-5.6 provides product value and where Codex accelerated implementation;
8. include the required core Codex session identifier and complete the Devpost submission.

If unfinished cache work threatens the stable menu-photo flow, preserve the working uncached product and defer rollout rather than shipping a partially verified Production dependency.
