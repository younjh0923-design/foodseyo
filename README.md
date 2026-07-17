# Foodseyo

Foodseyo is a source-honest, mobile-first food copilot that turns unfamiliar menu photos into structured food guidance so people can decide what to order, not merely translate what the menu says.

Foodseyo is being built for the OpenAI Build Week **Apps for Your Life** track with Codex and GPT-5.6.

## The problem

A translated dish name often does not explain what the food will taste or feel like, how spicy or rich it may be, which ingredients are stated or only typical, or what a diner should confirm before ordering. Foodseyo converts visible menu evidence and carefully labeled food knowledge into one canonical analysis that keeps evidence, inference, and uncertainty separate.

## What works today

1. Select one to ten ordered JPEG, PNG, or WEBP menu photos.
2. Review and preprocess the images in the browser without permanently uploading them.
3. Explicitly start one server-side GPT-5.6 Responses API analysis.
4. Validate and normalize the structured result into the versioned `FoodseyoAnalysis` contract.
5. Read a menu overview and source-grounded Dish Detail pages.

Results include taste, texture, heat, richness, ingredients with evidence basis, dietary clues, ordering considerations, limitations, and the required allergy-safety notice. Foodseyo never guarantees allergy safety and directs users to confirm ingredients and cross-contact with restaurant staff.

The Home link field validates HTTP/HTTPS syntax only. It does not fetch or analyze the URL, navigate to a fabricated result, or claim that link analysis is complete. Restaurant/menu link analysis remains T7 work after the database/cache checkpoints.

## MVP routes

- `/` — link syntax validation and the native menu-photo picker entry
- `/menu-scan` — ordered review and analysis of up to ten menu photos
- `/analysis` — canonical live menu overview
- `/analysis/dishes/[dishId]` — canonical live dish detail
- `/nearby` and `/restaurant/pai-northern-thai-kitchen` — clearly labeled deterministic demo flows

## Trust, privacy, and consistency

- raw files move from Home to Menu Scan through React memory only;
- the current canonical result is stored only in `sessionStorage` for the current tab;
- raw images, Base64, filenames, menu content, provider output, and canonical payloads are excluded from logs;
- source evidence, general food knowledge, restaurant evidence, and uncertainty remain distinct;
- controlled vocabularies, deterministic wording, semantic validation, and versioned fingerprints reduce avoidable drift;
- automated validation is network-free and never makes a paid OpenAI request.

Neon/Vercel Development, Preview, and Production database environments are isolated. The four-table exact-cache schema exists only in Development today. Local C2.1-E adds pre-provider lease ownership, duplicate coordination, bounded polling, expired-lease recovery, strict owner-only persistence, and the frozen 409/503 policy above the C2.1-D exact lookup and quarantine path. C2.1-F independently passed deterministic and adversarial real-PostgreSQL validation on disposable Development child branches, including repeated concurrency, rollback, ambiguous outcomes, and corrupt-snapshot quarantine failures. Every child branch was deleted and permanent Development remained empty. Preview/Production migrations and application deployment of database behavior have not started; C2.1-G remains the required reviewed rollout boundary.

## Run locally

Requirements:

- Node.js and pnpm
- an OpenAI API key only when intentionally testing the live menu-photo analysis

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). For an intentional live analysis, create an untracked `.env.local` and set the server-only `OPENAI_API_KEY`. `OPENAI_MODEL` is optional and defaults to `gpt-5.6`. Never commit either value.

## Verification

```bash
pnpm verify:quick       # lint, typecheck, and fast contract/scope regressions
pnpm verify:menu        # intake, preprocessing, API boundary, completion, storage
pnpm verify:results     # Overview, Dish Detail, session loading, result navigation
pnpm verify:consistency # C1 vocabulary, normalization, wording, fingerprints
pnpm verify:full        # lint, typecheck, all network-free tests, build, security
```

`pnpm test` remains the complete network-free regression suite. It never runs the opt-in paid smoke command.

The C2.1-F real-PostgreSQL gate is an explicit authenticated Development-only operation, separate from the network-free suite:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-c2-1-f-development-validation.ps1
```

The guarded runner checks permanent Development read-only, validates on two one-hour child branches, deletes each exact branch, and verifies that no temporary branch remains. It never calls OpenAI.

## Codex and GPT-5.6

GPT-5.6 performs the explicitly triggered menu-image interpretation behind a strict structured-output boundary. Application code, not the model, owns IDs, evidence links, canonical validation, deterministic wording, safety rules, and result storage.

Codex has supported the repository-wide implementation workflow: product-scope cleanup, canonical contracts, provider and response hardening, consistency and fingerprint design, network-free regression suites, database contract audits, least-privilege infrastructure verification, and the reviewed Development schema migration. The decision log records the significant implementation and scope decisions.

## MVP roadmap

- T1 — working mobile UI baseline (completed)
- T2 — product, research, and evidence architecture (completed)
- T3 — unified Foodseyo analysis contract (completed)
- T4 — shared analysis orchestration and safeguards (completed)
- T5–T5.4.1 — menu-image vertical slice (completed)
- T5.5 — MVP scope alignment cleanup (completed)
- T6 — cancelled from the MVP
- R1 — codebase and development workflow optimization (completed)
- C1.1–C1.2.1 — consistency, fingerprints, and live provenance integration (completed)
- C2.1-0 / C2.1-0.1 — database audit and exact-cache contracts (completed)
- C2.1-A / C2.1-A.1 — isolated managed infrastructure and credential correction (completed)
- C2.1-B — four-table schema and Development migration (completed)
- C2.1-C — pooled runtime database client and repositories (completed)
- C2.1-D — exact snapshot cache integration (completed locally; not deployed)
- C2.1-E — lease, concurrency, polling, and failure policy (completed locally; not deployed)
- C2.1-F — real Development database integrity and concurrency validation (completed locally; not deployed)
- C2.1-G — reviewed Preview and Production rollout
- C2.2–C2.4 — post-C2.1 planning audit before broader relational expansion
- T7 — restaurant/menu link analysis after C2
- T8 — restaurant identification, to be reconsidered after T7
- Later — personalization, Food Passport, community, and map-app sharing

Stable product context is in [`docs/PROJECT_OVERVIEW.md`](./docs/PROJECT_OVERVIEW.md). The current implementation handoff is in [`docs/CODEX_HANDOFF.md`](./docs/CODEX_HANDOFF.md).
