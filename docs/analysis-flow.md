# Foodseyo Shared Analysis Flow

**Status:** Updated for T5 menu-image analysis

**Date:** 2026-07-15

All supported inputs converge on one shared analysis process and one final objective: help the user decide what to order. The process is evidence-driven and may skip steps that are unnecessary for the current input.

## Common flow

```text
Supported input
→ Extract available restaurant and menu evidence
→ Determine what is already known
→ Research only missing or useful information
→ Resolve restaurant identity when necessary
→ Separate general knowledge from restaurant-specific facts
→ Normalize into one shared analysis structure
→ Apply user preferences and meal constraints
→ Present structured ordering guidance
→ Use AI Assistant only for exceptional questions
```

Restaurant matching is conditional, not a universal gate:

- a restaurant link may identify the restaurant at input time;
- nearby search allows the user to select the restaurant;
- menu images may not contain enough identity evidence;
- a restaurant photo may need candidate resolution first;
- the user may choose to continue without matching.

## Stage 1 — Extract available evidence

Extraction records what the input directly supports and retains provenance.

- Images may yield visible text, menu items, prices, options, signs, logos, or addresses.
- Screens may yield restaurant identity and user-visible platform information.
- Links may yield URL identity and public page content.
- Nearby search may yield location context and explicit user selection.
- Demo input yields clearly labeled `demo_data`.

Extraction does not turn a clue into a confirmed fact without supporting evidence.

## Stage 2 — Determine known and missing information

The analysis should identify:

- which restaurant and menu facts are directly known;
- whether restaurant identity is `confirmed`, `likely`, `unconfirmed`, or `not_attempted`;
- which dish details can be described through general food knowledge;
- which restaurant-specific details are missing;
- whether review or menu-freshness research would materially help the ordering decision.

Research is selective. Foodseyo should not search merely because search is available.

## Stage 3 — Resolve restaurant identity when necessary

Restaurant identity resolution uses available signals and follows the identity states in [product-rules.md](./product-rules.md).

- `confirmed`: show supported restaurant-specific information.
- `likely`: present the candidate and request user confirmation.
- `unconfirmed`: continue general dish and ordering support.
- `not_attempted`: continue when matching was unnecessary or skipped.

Never display numeric match probability. Location alone cannot produce `confirmed`.

## Stage 4 — Research missing or useful information

OpenAI Responses API web search is the default research provider. Research may add:

- official restaurant identity and website evidence;
- official or public menu evidence;
- publicly accessible review evidence;
- menu freshness comparisons;
- restaurant-specific ordering context.

Only public, accessible sources are used. Detailed rules are in [web-research-policy.md](./web-research-policy.md).

## Stage 5 — Separate information layers

Every factual statement belongs to one of two user-visible layers.

### General dish knowledge

General definition, regional background, typical taste, texture, spice, common ingredients, similar dishes, and general ordering considerations.

### At this restaurant

Facts directly visible in supplied evidence or confirmed by official/public restaurant sources, including verified prices, options, menu descriptions, restaurant-specific ingredients, and evidence-backed review findings.

General knowledge must not be phrased as though the restaurant confirmed it.

## Stage 6 — Normalize into the shared analysis

The shared analysis is implemented as the T3 `FoodseyoAnalysis` Zod contract and executed through the T4 shared orchestrator. Every input-specific analyzer populates a common draft; the orchestrator normalizes it, validates structure and business semantics, derives status and issues, and creates the final envelope. Runtime details are defined in [analysis-orchestration.md](./analysis-orchestration.md).

Every input should be able to populate the applicable parts of:

- input type and input provenance;
- restaurant identity state and candidate information;
- extracted menu items, visible prices, descriptions, categories, and options;
- general dish knowledge;
- restaurant-specific facts;
- review consensus, freshness, evidence, and limitations;
- menu freshness status;
- dietary status and staff-confirmation actions;
- Food Passport preferences and meal constraints;
- ordering guidance, combinations, and limitations;
- evidence sources and explicit unknown values.

Unknown information remains unknown: price is `null`, spice is `unknown`, review consensus is `insufficient`, identity is `unconfirmed`, and freshness is `could_not_verify` when those facts cannot be established.

## Menu-image-specific flow

```text
Menu images
→ Extract menu items and visible details
→ Generate general dish knowledge
→ Extract restaurant signals
→ Attempt restaurant identification when useful
→ Add restaurant-specific evidence when confirmed
→ Continue without restaurant confirmation when necessary
→ Support ordering decisions
```

**Restaurant matching is not required to explain the menu.**

T5 implements this path with 1-10 ordered JPEG, PNG, or WEBP inputs. The browser adaptively preprocesses the set to a 3,800,000-byte target while retaining a readability floor, then sends one multipart request to `/api/analyze/menu-images`. The server enforces a 4,000,000-byte total limit and sends the ordered set in one GPT-5.6 Responses API request with no web tools. The resulting narrow Structured Output is deterministically adapted and passed through the shared orchestrator. See [menu-image-analysis.md](./menu-image-analysis.md).

Web research, reviews, and official freshness comparison remain later enrichment capabilities and are not silently performed by the T5 menu-image analyzer.

Even without a confirmed restaurant, Foodseyo should provide:

- What it is
- Taste
- Texture
- Typical spice
- Common ingredients
- Regional background
- Similar dishes
- General ordering considerations

When restaurant-specific facts are unavailable, use:

> Restaurant-specific details were not confirmed.

## Preferences and ordering guidance

After normalization, Foodseyo applies Food Passport preferences and meal constraints such as party size, budget, ordering goal, and sharing style.

Calculable recommendation logic belongs in TypeScript so it is deterministic and testable. AI may explain or supplement a recommendation, but it must not replace straightforward calculation or hide missing evidence.

Structured ordering guidance may include:

- representative or signature candidates when supported;
- options suited to the user’s constraints;
- practical combinations and quantities;
- price estimates only when prices are known;
- dietary cautions and staff questions;
- evidence and limitations.

## Assistant boundary

The structured UI is the primary experience. The AI Assistant is used only for exceptional follow-up questions, comparisons, explanations, or staff-question drafting that ordinary UI does not already resolve.

Opening a card, moving between tabs, or reading an existing result must not trigger another AI call.

## Failure behavior

- Extraction failure: preserve the input session and offer retry or another input path.
- Matching failure: continue with general dish knowledge and `unconfirmed` status.
- Research failure: use available evidence, label limitations, and preserve demo fallback.
- Insufficient review evidence: show **Insufficient evidence**.
- Unverified freshness: show **Could not verify**.
- Unknown dietary safety: show `unknown` or `confirm_with_staff` and the required allergy warning.
