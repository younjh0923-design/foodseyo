# Foodseyo repository guide

Foodseyo is a source-honest, mobile-first food copilot that turns unfamiliar menu photos into structured guidance for deciding what to order, not merely a translation. The active MVP supports live `menu_images` analysis and a restaurant/menu link field with local URL validation only.

## Context and sources of truth

- Read [docs/PROJECT_OVERVIEW.md](./docs/PROJECT_OVERVIEW.md) for the stable product definition, audience, differentiators, MVP boundary, and long-term direction.
- Read [docs/CODEX_HANDOFF.md](./docs/CODEX_HANDOFF.md) for the current branch, completed checkpoints, next checkpoint, and operational stop conditions.
- [docs/product-rules.md](./docs/product-rules.md) is normative for active product scope and safety.
- [docs/database-cache-contract.md](./docs/database-cache-contract.md) is normative for C2.1 exact-cache behavior; the executable Drizzle schema and reviewed migrations govern the physical database shape.
- [docs/database-logical-model-v3.md](./docs/database-logical-model-v3.md) owns the future relational scope, entity responsibilities, deferrals, and unresolved product decisions. It is not a physical schema or migration source.
- [docs/database-physical-integrity-contract.md](./docs/database-physical-integrity-contract.md) owns the non-executable C2.2-B PostgreSQL contract for the existing compatibility boundary and four structured-menu candidates.
- [docs/decision-log.md](./docs/decision-log.md) preserves accepted and superseded decisions. Do not rewrite history to describe a newer state.
- The supplied DOCX and SQL database files are untracked reference artifacts, not executable sources of truth. Never execute the supplied SQL.

## Scope and behavior

- Preserve user-visible behavior, copy, API contracts, canonical schemas, image limits, preprocessing, storage, and navigation unless the requested checkpoint explicitly changes them.
- Food Passport, restaurant-photo/sign/screenshot analysis, personalization, and community features are outside the active MVP. T7 link analysis and map-app sharing have not started; T8 restaurant identification also remains inactive until post-T7 reevaluation.
- Do not add a new product capability before its requested checkpoint or simulate an unavailable capability with demo data.
- The current live flow is menu photos to one provider-backed canonical analysis, then `sessionStorage` to Overview and Dish Detail.
- Never run a real OpenAI request or paid menu analysis unless the user explicitly requests that exact action. Network-free synthetic tests are the default.

## Database boundary

- Vercel application runtime may use only the environment-scoped pooled `DATABASE_URL`.
- Migration credentials stay outside the live Vercel application and are supplied only to a dedicated operator or CI migration environment.
- Runtime code must never create or alter schema objects, access the migration ledger, or obtain migrator credentials.
- Raw images, Base64, filenames, per-image hashes, menu text, and canonical analysis payloads must not be logged.
- Preview and Production migrations require their own approved rollout checkpoint; Development completion never authorizes them implicitly.

## Security and observability

- Never commit `.env.local`, `.env`, credentials, API keys, tokens, raw images, Base64 payloads, or other secrets.
- Never log image or file contents, filenames, menu text, dish or restaurant names, raw provider responses, full canonical analyses, API keys, database URLs, or environment values.
- Observability may contain only safe correlation IDs, numeric durations and byte counts, HTTP status, safe stage codes, cache state, provider call count, and structural or semantic issue counts.

## Operational autonomy

- Perform routine in-scope repository, CLI, API, platform configuration, cleanup, and verification work autonomously.
- Ask the user to intervene only for login or re-authentication, MFA or CAPTCHA, account registration, legal terms acceptance, billing or paid-plan approval, or an irreversible Production action that has not already been approved.
- If a browser integration fails, make one reasonable recovery attempt and then use an official CLI or API fallback when available.
- Autonomy does not broaden the requested checkpoint, authorize a paid service change, or bypass an explicit Production rollout gate.

## Checkpoint workflow

- Confirm the branch required by the requested checkpoint, the local HEAD, tracked/staged cleanliness, and local/origin divergence before work. Do not switch to `main` when an approved feature branch is the intended checkpoint branch.
- Preserve the two supplied untracked database reference artifacts and keep them unstaged.
- During implementation, prefer the smallest relevant command: `pnpm verify:quick`, `pnpm verify:menu`, `pnpm verify:results`, `pnpm verify:consistency`, or the checkpoint-specific verifier.
- Before a final commit, run `pnpm verify:full` once. It owns lint, typecheck, all network-free tests, production build, secret-pattern checks, and `.env.local` exclusion.
- Keep `pnpm test` compatible as the complete network-free regression suite.
- Update current-scope docs for behavior changes, the roadmap for checkpoint state, the decision log for changed decisions, technical docs for contract changes, and `docs/CODEX_HANDOFF.md` for the next handoff.
- Do not push or deploy unless the user explicitly authorizes that action.
- Browser visual QA may be skipped when no UI or user-visible copy changed; state that in the final report.
