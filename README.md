# Foodseyo

**Understand the menu. Order with confidence.**

A mobile-first Next.js demo that turns one restaurant analysis into an immediately explorable product experience. Restaurant context, representative dishes, review themes, dietary evidence, and order planning are shown as structured UI instead of a chat-first flow.

## Implemented routes

- `/` — link/image input, Food Passport, recent demo restaurant
- `/nearby` — location-permission states and demo restaurant list
- `/restaurant/pai-northern-thai-kitchen` — restaurant overview, representative dishes, personalization, menu filters, and meal planning
- `/restaurant/pai-northern-thai-kitchen/dish/khao-soi` — instant dish detail with Overview, Review, and Dietary tabs

## Demo interactions

- Restaurant link analysis and image selection states
- Food Passport saved to `localStorage`
- Conditional “For you” section after Passport setup
- Data-driven representative and all-menu lists
- Working category and text filters
- TypeScript order recommendation and price calculation
- Review consistency themes with evidence-source labels
- Cautious dietary statuses and a staff-question phrase card
- Supporting AI Assistant bottom sheet with quick questions and mock responses
- Browser geolocation request with denied/unavailable fallbacks

All restaurant, dish, review, dietary, and recommendation content is demo data. Food images are labeled as demo reference images and must not be treated as verified restaurant photography.

## Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Quality checks:

```bash
pnpm lint
pnpm build
```

## Project structure

- `src/types/domain.ts` — application domain types
- `src/data/` — typed demo restaurant and nearby data
- `src/lib/` — local storage and recommendation logic
- `src/components/` — reusable mobile UI, sheets, cards, and screen clients
- `src/app/` — App Router pages and global design tokens
- `public/images/` — local demo reference imagery

## Current limitations

- No live OpenAI, restaurant, map, review, or translation API is connected.
- Restaurant analysis, nearby listings, assistant responses, and evidence are deterministic demo flows.
- Food Passport is stored only in the current browser.
- Allergy and cross-contact safety is never guaranteed; users are directed to restaurant staff.
