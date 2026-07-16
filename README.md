# Foodseyo

Foodseyo is a mobile-first Next.js food copilot that starts from a restaurant/menu link or menu photos and presents structured guidance for deciding what to order.

## MVP routes

- `/` — link syntax validation and the native menu-photo picker entry
- `/menu-scan` — ordered review and analysis of up to ten menu photos
- `/analysis` — canonical live menu overview
- `/analysis/dishes/[dishId]` — canonical live dish detail
- `/nearby` and `/restaurant/pai-northern-thai-kitchen` — clearly labeled deterministic demo flows

The menu-image vertical slice uses the server-only OpenAI integration when explicitly triggered by a user. Automated validation and visual QA do not make paid analysis requests.

The Home link field currently validates HTTP/HTTPS syntax only. It does not fetch, analyze, navigate to a demo result, or claim completion. C1.2 connects the consistency contract to live menu-image results; link analysis remains deferred until after C2.

## Menu-photo behavior

- JPEG, PNG, and WEBP only
- one to ten files, preserving picker order
- native browser/operating-system picker with no `capture` hint
- memory-only handoff from Home to `/menu-scan`
- adaptive preprocessing with the existing readability floor and total-byte limits
- canonical result stored only in `sessionStorage` for the current tab

Menu-derived ingredient, dietary, uncertainty, and allergy-caution information remains visible. Foodseyo never guarantees allergy safety and directs users to confirm ingredients and cross-contact with restaurant staff.

## Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Development checks:

```bash
pnpm verify:quick    # lint, typecheck, and fast contract/scope regressions
pnpm verify:menu     # intake, preprocessing, API boundary, completion, storage
pnpm verify:results  # Overview, Dish Detail, session loading, result navigation
pnpm verify:consistency # C1 vocabulary, normalization, wording, fingerprints, validation
pnpm verify:full     # final lint, typecheck, all tests, build, and security checks
```

`pnpm test` remains the complete network-free regression suite for compatibility. It never runs the opt-in paid smoke command.

## MVP roadmap

- T5–T5.4.1 — menu-image vertical slice complete
- T5.5 — MVP scope alignment cleanup
- T6 — cancelled from the MVP
- R1 — non-functional codebase and development workflow optimization
- C1.1 / C1.1.1 — consistency and fingerprint foundations (completed)
- C1.2 — live menu-image consistency integration (completed)
- C1.2.1 — restaurant-resolution provenance correction (current)
- C2.1–C2.4 — relational model and cache-safety checkpoints (next)
- T7 — restaurant/menu link analysis after C2
- T8 — restaurant identification, to be reconsidered after T7
- Later — map-app share-to-Foodseyo integration

Map-app sharing is not currently implemented.
