# Foodseyo Parallel Input Architecture

**Status:** Updated for T5 menu-image analysis

**Date:** 2026-07-15

Foodseyo supports six independent entry paths. They are parallel ways to provide restaurant information, not required stages in a single funnel. A user can start with whichever evidence is available.

```text
menu_images ───────────┐
restaurant_photo ──────┤
restaurant_screen ─────┤
restaurant_link ───────┼─→ shared analysis → ordering guidance
nearby_search ─────────┤
demo ──────────────────┘
```

Menu scanning is one input path. It is not Foodseyo’s required first step and is not the entire product flow.

## Input overview

| Input type | Primary purpose | Restaurant matching |
| --- | --- | --- |
| `menu_images` | Extract visible menu items, prices, descriptions, options, and categories. | Optional; attempt only when useful signals exist. |
| `restaurant_photo` | Extract sign, name, logo, address, and location clues to find candidates. | Usually required before restaurant-specific research, but general help may continue. |
| `restaurant_screen` | Extract visible restaurant identity, cuisine, price range, address, and on-screen facts. | Conditional; explicit screen evidence may already identify the restaurant. |
| `restaurant_link` | Identify the restaurant from a URL and research its public information. | Often already established or quickly resolvable. |
| `nearby_search` | Discover nearby candidates and let the user select one. | User selection establishes the restaurant; location alone does not. |
| `demo` | Demonstrate the complete experience without external services. | Uses a clearly labeled demo identity and demo evidence. |

## `menu_images`

Purpose:

- extract menu names, prices, descriptions, options, and categories;
- provide general explanations of the dishes;
- extract restaurant clues from the menu when available;
- attempt restaurant identification when useful;
- continue dish explanations and ordering support even if the restaurant is not identified.

Menu images may contain no usable restaurant identity. That is an accepted outcome, not an analysis failure. Restaurant-specific facts remain unavailable until supported by evidence.

T5 accepts 1-10 ordered JPEG, PNG, or WEBP images in one capture session. The browser uses count-adaptive resizing and compression toward 3,800,000 total bytes without going below the readability floor. The server independently enforces 4,000,000 bytes and submits all retained images in order through one Responses API request. Vercel Blob, permanent uploads, and multi-request batch merging are outside T5.

## `restaurant_photo`

Purpose:

- extract signs, business names, logos, addresses, and location clues;
- research plausible restaurant candidates;
- ask the user to confirm a likely candidate;
- research menus and public evidence for the confirmed restaurant;
- present ordering candidates.

Image recognition may narrow candidates but must not silently confirm a restaurant without adequate evidence or user confirmation.

## `restaurant_screen`

Purpose:

- extract the restaurant name, address, cuisine, price range, and other visible facts;
- preserve the distinction between information visible on the screen and facts found on the public web;
- identify or confirm the restaurant;
- research its menu and public review evidence;
- support an ordering decision.

The screen itself is `user_provided_screen` evidence. Extracted on-screen facts must retain that provenance.

## `restaurant_link`

Purpose:

- identify the restaurant from the supplied URL;
- research the official website, public menu, and review evidence;
- normalize menu information;
- recommend dishes and practical combinations.

The link may make restaurant matching unnecessary because identity can be known at the start. Research should focus on missing or useful details rather than repeating known facts.

## `nearby_search`

Purpose:

- use current location to discover nearby candidates;
- let the user choose a restaurant;
- research the selected restaurant’s menu and public evidence;
- support an ordering decision.

Location narrows candidates but does not confirm a restaurant. Foodseyo must not request location on Home without context. When matching is relevant, offer:

- **Use my location**
- **Enter restaurant name**
- **Continue without matching**

Location denial must preserve other input paths and core ordering support.

## `demo`

Purpose:

- show the complete product experience when APIs, image analysis, or external search are unavailable;
- keep development, judging, and QA flows deterministic;
- demonstrate Restaurant Overview, Dish Detail, evidence, meal planning, and Assistant behavior.

Demo data must always be visibly labeled as demo data. It must not be presented as live restaurant evidence.

## Shared convergence

Every path passes only the evidence it has into the shared process:

```text
Supported input
→ Extract available restaurant and menu evidence
→ Determine what is known and missing
→ Research missing or useful information
→ Resolve restaurant identity only when necessary
→ Normalize into a shared analysis
→ Apply user preferences and meal constraints
→ Present structured ordering guidance
```

No input path is required to visit every intermediate step. Examples:

- a restaurant link may begin with a known restaurant;
- nearby search may rely on explicit user selection;
- menu images may remain `unconfirmed` or `not_attempted`;
- a restaurant photo may require candidate research and confirmation;
- demo data may bypass external research entirely.

## Identity signals and confirmation

Matching may use restaurant name, sign, logo, address, phone number, website, currency, price, menu composition, link, screen, location, user-entered name, and user confirmation.

Signals create candidates; they do not all carry equal authority. Current location alone is never enough to set `confirmed`. A `likely` result must be shown to the user for confirmation, without a numeric confidence score.

## Failure and recovery

- Failed restaurant matching must not discard extracted menu information.
- Failed web research must fall back to available input evidence and general food knowledge.
- Denied location must return the user to manual or non-location paths.
- Unsupported or unreadable input must show a recoverable error and preserve already selected files when possible.
- Demo remains available as a clearly labeled fallback.
