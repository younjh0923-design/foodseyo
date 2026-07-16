# Foodseyo repository guide

Foodseyo is a mobile-first food copilot that turns user-provided menu photos into a source-honest canonical analysis that helps someone understand dishes before ordering. The active MVP supports live `menu_images` analysis and a restaurant/menu link field with local URL validation only.

## Scope and behavior

- Preserve user-visible behavior, copy, API contracts, canonical schemas, image limits, preprocessing, storage, and navigation unless the requested checkpoint explicitly changes them.
- Food Passport, restaurant-photo/sign/screenshot analysis, and the custom image-choice Bottom Sheet are outside the active MVP. T7 link analysis and map-app sharing have not started.
- Do not add a new product capability before its requested checkpoint or simulate an unavailable capability with demo data.
- Never run a real OpenAI request or paid menu analysis unless the user explicitly requests that exact action. Network-free synthetic tests are the default.

## Security and observability

- Never commit `.env.local`, `.env`, credentials, API keys, tokens, raw images, Base64 payloads, or other secrets.
- Never log image or file contents, filenames, menu text, dish or restaurant names, raw provider responses, full canonical analyses, API keys, or environment values.
- Observability may contain only safe correlation IDs, numeric durations and byte counts, HTTP status, safe stage codes, and structural or semantic issue counts.

## Verification and delivery

- Confirm `main`, a clean working tree, and local/origin synchronization before checkpoint work.
- During implementation, prefer the smallest relevant command: `pnpm verify:quick`, `pnpm verify:menu`, or `pnpm verify:results`.
- Before a final commit, run `pnpm verify:full` once. It owns lint, typecheck, all network-free tests, production build, secret-pattern checks, and `.env.local` exclusion.
- Keep `pnpm test` compatible as the complete network-free regression suite.
- Update current-scope docs for behavior changes, the roadmap for checkpoint state, the decision log for changed decisions, and technical docs for contract changes. Preserve historical decisions and label superseded behavior.
- Browser visual QA may be skipped when no UI or user-visible copy changed; state that in the final report.
