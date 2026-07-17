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

## D-029 — Separate evidence provenance, claim basis, and availability

- **Decision:** Separate evidence provenance, claim basis, and availability in the shared analysis contract.
- **Reason:** An actual source, the method used to form a claim, and the absence of a value are different concepts and must not share one enum.
- **Impact:** `EvidenceSourceType` contains only real evidence locations, `ClaimBasis` contains reasoning methods, and `Availability` contains value states.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-030 — Unverified third-party screen images are not reusable

- **Decision:** Treat unverified third-party images inside uploaded screens as session-only or not reusable.
- **Reason:** A user-provided screen may support analysis without establishing the original image source or redistribution rights.
- **Impact:** Such images may inform the current session but are not extracted, permanently stored, or republished as public Dish Card images until rights are verified.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-031 — MVP analysis data remains session-scoped

- **Decision:** Keep MVP analysis inputs and results session-scoped without permanent user-image or precise-location storage.
- **Reason:** The competition MVP does not require accounts or a database, and retaining sensitive input data would add unnecessary privacy and security risk.
- **Impact:** The analysis contract excludes raw image data, secrets, and permanent exact user coordinates; login, databases, and permanent image storage remain post-submission work.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-032 — One shared analysis orchestrator

- **Decision:** Use one shared analysis orchestrator for all supported input types.
- **Reason:** Input-specific analyzers must produce consistent validated results without duplicating envelope, status, issue, and validation logic.
- **Impact:** All future analyzers connect through one dispatcher and return a shared draft that becomes `FoodseyoAnalysis`.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-033 — Separate structural and semantic validation

- **Decision:** Separate structural schema validation from business semantic validation.
- **Reason:** Zod validates shape, while cross-entity references and logical combinations require a separate validation layer that remains compatible with future Structured Output.
- **Impact:** Analyzer output must pass both structural and semantic validation before it is returned to the application.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-034 — Derive status from core input success

- **Decision:** Derive analysis status from core input success, not optional evidence completeness.
- **Reason:** Missing reviews, images, menu freshness, or restaurant confirmation does not always make a result unusable.
- **Impact:** Foodseyo may return complete or partial useful guidance with explicit limitations rather than treating every unknown value as failure.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-035 — Display only rights-cleared dish images in the current MVP UI

- **Decision:** Display only rights-cleared dish images in the current MVP UI.
- **Reason:** The current UI does not yet render required attribution, and images with unknown, session-only, or non-reusable rights must not be publicly reused.
- **Impact:** Only images with `rightsStatus=cleared` and a valid source path are passed to persistent Restaurant and Dish UI. Attribution-required images remain hidden until attribution UI exists.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-036 — Preserve the highest severity when deduplicating analysis issues

- **Decision:** Preserve the highest severity when deduplicating analysis issues.
- **Reason:** The same limitation may be detected by semantic validation and derived issue logic with different severity levels.
- **Impact:** Duplicate issues are merged by code and related entities while preserving the most severe warning and the strictest recoverability state.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-037 — Narrow GPT schema before canonical mapping

- **Decision:** Use a narrow GPT Structured Output schema before canonical Foodseyo mapping.
- **Reason:** The model should extract visible menu information and general food knowledge, while the application retains control over evidence IDs, restaurant resolution, image rights, status, issues, and safety policy.
- **Impact:** GPT output is validated as `MenuImageModelOutput` and converted deterministically into `FoodseyoAnalysisPayload` before entering the shared orchestrator.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-038 — Adaptive direct upload without persistent storage

- **Decision:** Preprocess menu images in the browser before direct Vercel Function upload.
- **Reason:** Phone images commonly exceed the deployment request payload limit, while the MVP intentionally avoids permanent image storage and Blob infrastructure.
- **Impact:** The client preserves menu readability while adaptively resizing and compressing up to ten ordered images under a 3,800,000-byte target. It stops with a readability error rather than crossing its 1400 px and 0.68 quality floors; the server independently enforces a 4,000,000-byte total limit.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-039 — GPT-5.6 image understanding without web tools

- **Decision:** Use GPT-5.6 through the OpenAI Responses API without web tools in T5.
- **Reason:** T5 is limited to understanding user-provided menu images. Restaurant web research, public reviews, and freshness verification are separate enrichment capabilities.
- **Impact:** The provider sends up to ten ordered text-and-image inputs in one request with Structured Outputs, `store=false`, and no tools. Review consensus and menu freshness remain explicitly unavailable.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-040 — Uploaded menu imagery is evidence, not reusable photography

- **Decision:** Do not reuse uploaded menu imagery as persistent dish photography.
- **Reason:** An uploaded menu may be analyzed as session evidence, but the right to extract and republish embedded dish images is not established.
- **Impact:** T5 dish images remain unavailable unless a separate rights-cleared source is introduced by a later feature.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-041 — Treat explicit restaurant input as user evidence without borrowing unmatched image provenance

- **Decision:** Treat explicit restaurant input as user evidence without borrowing unmatched image provenance.
- **Reason:** A user-entered restaurant name and restaurant identity signals extracted from an uploaded menu may refer to different businesses.
- **Impact:** Explicit input can confirm the entered name without evidence source IDs. Image-derived address, phone, website, and provenance are merged only when the visible restaurant name conservatively matches the user-entered name.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-042 — Revalidate menu image limits inside analyzer

- **Decision:** Revalidate menu image limits inside the analyzer.
- **Reason:** The HTTP route is one trust boundary, but analyzers may later be called by smoke scripts, internal services, or additional transports.
- **Impact:** The menu-image analyzer independently enforces image count, supported media types, non-empty bytes, and actual total-byte limits before invoking the provider.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-043 — Expose only validated user-facing menu-analysis errors

- **Decision:** Expose only validated user-facing menu-analysis errors.
- **Reason:** Network, storage, framework, and non-JSON failures may contain technical implementation details that are not useful or appropriate for users.
- **Impact:** The Menu Scan UI displays preprocessing messages and schema-validated API messages, while all unexpected errors use a fixed safe fallback.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-044 — Keep provider timeout below route execution limit

- **Decision:** Keep the provider timeout below the route execution limit.
- **Reason:** The application needs time to map provider timeouts into a stable JSON response before the hosting platform terminates the function.
- **Impact:** The OpenAI timeout remains below the 90-second Route maximum duration.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-045 — Simplify the MVP Home entry surface

- **Decision:** The MVP Home shows one restaurant/menu link field, Food Passport, and one unified image-input action. Nearby search, recent analysis, fixed demo cards, and separate camera/gallery/screenshot cards are not shown on Home.
- **Reason:** The first screen should minimize decision load and prioritize the two ways users already have restaurant context: a public link or an image. Food Passport remains visible as personalization rather than as an analysis input.
- **Impact:** The Home layout becomes brand, one question, one explanation, one link field, and two action cards. Nearby and history remain deferred without deleting their architecture.
- **Historical note:** The Food Passport and two-card details in this decision were superseded by D-059.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-046 — Unify camera and gallery selection before navigation

- **Decision:** The Scan or upload action opens one Bottom Sheet where the user chooses Take a photo or Choose from photos. The file picker opens directly from the Home user gesture, and selected Files are handed to Menu Scan through transient in-memory state.
- **Reason:** Mobile browsers may block a file picker that is automatically opened after Route navigation because the original user activation has been lost.
- **Impact:** Home owns the initial hidden file inputs. Menu Scan consumes staged files once, creates and cleans its own preview object URLs, and remains usable when opened directly.
- **Historical note:** The custom Bottom Sheet and split camera/gallery inputs were superseded by D-059's single native picker.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-047 — Do not fake live link analysis

- **Decision:** Until the restaurant-link analyzer exists, the Home link field performs local HTTP/HTTPS syntax validation and displays an honest availability message. It does not route to Demo or simulate analysis.
- **Reason:** A fixed demo redirect would misrepresent an unavailable live capability.
- **Impact:** Valid links receive a coming-soon message and no provider or network call. The field remains in the intended Home information architecture for later integration.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-048 — Keep Home image handoff transient

- **Decision:** Files selected from Home remain only in browser memory until Menu Scan consumes them. They are not serialized, persisted, placed in URLs, or added to the canonical analysis contract.
- **Reason:** The MVP has no account, database, or permanent upload requirement, and raw user images should not be retained unnecessarily.
- **Impact:** Browser refresh may clear staged files. This is accepted. Existing session-only analysis and privacy rules remain intact.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-049 — Represent menu analysis completion as an explicit UI phase

- **Decision:** Menu Scan uses mutually exclusive `idle`, `preparing`, `requesting`, `success`, and `error` phases. Request cleanup may release resources but must not reset a completed success or error state.
- **Reason:** A Production iPhone request returned HTTP 200 and ended loading without leaving visible success or error feedback.
- **Impact:** Success remains visible until the user starts another analysis or changes the selected images. Storage failure is represented as a warning inside the success state.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-050 — Add a client-side analysis watchdog

- **Decision:** Menu Scan aborts a request that remains unresolved beyond a 105-second client watchdog, which is longer than the provider and Route limits.
- **Reason:** Mobile network or platform failures can leave fetch pending even after server-side execution boundaries.
- **Impact:** Users receive a safe timeout message and can retry instead of remaining in indefinite loading.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-051 — Prevent concurrent menu-analysis submissions

- **Decision:** Menu Scan permits only one active analysis request, ignores duplicate submissions, and prevents stale responses from overwriting the latest attempt.
- **Reason:** Repeated taps during ambiguous loading can generate duplicate paid API calls and conflicting UI state.
- **Impact:** The button is disabled during active work, double taps produce one request, and retries become available only after completion.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-052 — Complete the menu-image vertical slice before adding new analyzers

- **Decision:** T5.4 completes menu-image analysis through automatic result navigation, Live Overview, and Live Dish Detail. T6, T7, and T8 retain their existing numbers and purposes.
- **Reason:** A live analyzer is not a complete user-facing capability until users can understand and navigate its canonical result.
- **Impact:** T5 gains a final sub-checkpoint without shifting restaurant-photo/screen analysis, link analysis, or restaurant identification/candidate confirmation.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-053 — Use one canonical result destination for every analyzer

- **Decision:** `/analysis` and `/analysis/dishes/[dishId]` render validated `FoodseyoAnalysis` independently of whether it was produced by menu images, restaurant photos, screens, links, or future inputs.
- **Reason:** Future analyzers should supply the same result experience rather than create input-specific result pages.
- **Impact:** T5.4 builds the common destination first; T6–T8 later connect new analyzers to the same canonical output.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-054 — Navigate automatically after successful analysis persistence

- **Decision:** After a valid menu analysis is written to and confirmed in session storage, Menu Scan enters `navigating` and replaces itself with `/analysis` without another user action.
- **Reason:** An intermediate completion card and extra click add friction after a paid, successful analysis.
- **Impact:** Completion UI remains only as a storage- or navigation-failure fallback.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-055 — Render live results without another model call

- **Decision:** Live Overview and Dish Detail use only the validated canonical analysis already stored for the current browser session.
- **Reason:** A second model call would add cost, latency, and inconsistent results.
- **Impact:** Result Routes perform no OpenAI, web, review, restaurant, or other network fetch.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-056 — Keep live results session-scoped for the MVP

- **Decision:** The current result remains in `sessionStorage` and supports refresh in the same tab. New-device access, permanent history, and shareable result links remain deferred.
- **Reason:** The MVP has no database, authentication, or permanent result-storage requirement.
- **Impact:** Missing or invalid session data shows a safe recovery state rather than Demo content.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-057 — Do not infer popularity, prices, or allergy safety

- **Decision:** Live result views display only source-grounded canonical menu information and conservative Food Passport comparisons.
- **Reason:** The current analysis does not contain verified sales, review, pricing, cross-contact, or restaurant-preparation data suitable for those claims.
- **Impact:** The Live UI does not claim best sellers, ratings, prices, popularity, or allergy safety.
- **Historical note:** The Food Passport comparison portion was removed by D-059; the evidence and safety constraints remain active.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-058 — Separate post-200 client failures with privacy-safe correlation

- **Decision:** Read menu-analysis response text once and distinguish body-read, JSON, API-schema, HTTP/body mismatch, failed-status, empty-menu, and semantic failures. Add a random response correlation header and server observation limited to status, duration, response bytes, stage, and validation counts.
- **Reason:** A Production iPhone received a generic connection message after Vercel recorded HTTP 200, while the previous client parser destroyed the specific failure stage.
- **Impact:** Only genuine fetch/network failures use connection guidance. Support can correlate a short UI reference with privacy-safe Vercel metrics without logging images, menu content, secrets, raw provider output, or canonical results.
- **Status:** Accepted
- **Date:** 2026-07-15

## D-059 — Align the MVP around menu photos and links

- **Decision:** The active MVP entry surfaces are `menu_images` and the `restaurant_link` field. Menu photos use one native multi-file picker with no `capture` hint. The former Food Passport UI, provider, storage, and comparison logic are removed. T6 is cancelled; T7 link analysis is next; T8 identification is reconsidered after T7; map-app share-to-Foodseyo remains Later.
- **Reason:** The team narrowed the MVP to the evidence flows needed for the competition experience and removed profile setup and unsupported image-intake promises that increased decision load without strengthening the live menu vertical slice.
- **Impact:** Home has one full-width menu-photo CTA below the link field. Live results retain menu-derived ingredients and cautious allergy/dietary information but perform no stored-user comparison. Schema-v1 `restaurant_photo`, `restaurant_screen`, and `user_provided_screen` values remain parseable only for backward compatibility; they have no active UI, route, provider override, or successful live analyzer.
- **Status:** Accepted
- **Date:** 2026-07-16

## D-060 — Optimize the workflow without changing product behavior

- **Decision:** R1 introduces repository-level agent guidance, targeted and full verification commands, small shared validation helpers, one repository security check, and privacy-safe latency timing at existing analysis boundaries. The T5.5 user experience, analysis behavior, API contract, canonical schema, model, provider, prompt, and image policy remain unchanged.
- **Reason:** Repeated development work needs a faster feedback loop and a single durable rule source without weakening the complete network-free regression suite or exposing sensitive menu data.
- **Impact:** `verify:quick`, `verify:menu`, and `verify:results` support focused iteration; `verify:full` remains the pre-commit authority. Schema-v1 legacy input values remain deprecated compatibility types and inaccessible from active product flows. T7 remains the next product feature and is not implemented by R1.
- **Status:** Accepted
- **Date:** 2026-07-16

## D-061 — Establish the analysis consistency contract before T7

- **Decision:** C1 is a checkpoint before T7. C1.1 adds the independent `foodseyo-consistency-v1` profile, conservative normalization, deterministic English wording helpers, version metadata, semantic validation, and source/dish fingerprint contracts. C1.2 will separately decide how to connect this foundation to live menu-image analysis.
- **Reason:** Repeated analysis needs stable semantic axes without prematurely breaking the live provider response, canonical schema, or result UI. Basic tastes, flavor notes, heat, richness, textures, and ingredient evidence therefore require separate bounded contracts and repeatable synthetic evaluation first.
- **Impact:** Basic tastes are limited to sweet, salty, sour, bitter, and savory; textures and other axes have fixed vocabularies and tag limits; ingredient names remain free-form with `stated`, `typical`, or `uncertain` evidence. Fingerprints include source identity, restaurant/branch context, dish evidence, price, normalized consistency, and model/prompt/schema/profile versions, so a dish name alone can never authorize reuse. Fingerprints are not logged and do not activate a cache, database, persistent registry, or provider bypass. The live OpenAI model, prompt, structured output, canonical `FoodseyoAnalysis`, storage, and result UI remain unchanged in C1.1.
- **Historical note:** The fingerprint-layer details in this impact statement were corrected by D-062 after the C1.1 follow-up audit.
- **Status:** Accepted
- **Date:** 2026-07-16

## D-062 — Separate pre-provider identity from analysis-result identity

- **Decision:** Source and dish fingerprints are calculated only from pre-provider, source-stated evidence. Uploaded menu sources use image count and ordered SHA-256 content hashes. Dish identity accepts the source fingerprint, source dish identifier, source-stated name/description/category, and source-stated price fields only. Normalized consistency, deterministic wording, inferred ingredients, tastes, textures, and five-part analysis version metadata belong to a separate analysis-result fingerprint.
- **Reason:** A dish identity that includes OpenAI output cannot be calculated before the provider call and can make result variation look like source variation. A generic menu source identifier also fails to prove that image content, count, and selection order are part of identity.
- **Impact:** Raw image bytes are transiently hashed and are never accepted by the fingerprint identity object, persisted, Base64-encoded, or logged. Version metadata now distinguishes model, prompt, provider schema, canonical schema, and consistency profile. Image-only inputs may have only a source fingerprint before analysis when no independent source-stated dish evidence exists; they must not derive a supposedly pre-call dish fingerprint from later model output. Live provider, prompt, schemas, canonical analysis, storage, and UI remain unchanged.
- **Status:** Accepted
- **Date:** 2026-07-16

## D-063 — Integrate consistency through a backward-compatible canonical vNext

- **Decision:** New live `menu_images` analysis emits canonical `1.1.0`. The existing one-call Responses API provider returns a structured C1 consistency object; Foodseyo then reuses the C1 normalizer and validator, generates deterministic wording, and stores source, dish, result, and five-part version metadata. The session reader and result views continue to accept legacy `1.0.0` without inferring new consistency fields from old free text.
- **Reason:** Stable live taste, texture, heat, richness, and ingredient semantics require a structured result boundary, while existing session fixtures must not be silently reinterpreted or broken.
- **Impact:** Ordered image content is hashed and reduced to one source fingerprint before provider execution. Dish identity is created only after source-stated dish extraction, and result identity is separate. New Overview and Dish Detail views use deterministic wording and distinguish stated from typical ingredients; uncertain ingredients are summarized. The provider model, Responses API settings, one-request policy, image handling, safety notice, routes, storage key, observability fields, and safe error boundaries remain intact. No cache, database, provider bypass, T7 link analysis, or additional OpenAI call is added.
- **Status:** Accepted
- **Date:** 2026-07-16

## D-064 — Separate restaurant declarations from verified identity scope

- **Decision:** Canonical `1.1.1` adds restaurant-resolution `basis`, `scope`, optional safe `displayName`, and the explicit `restaurant_name_mismatch` conflict code. A user-entered name without compatible source evidence is `likely/user_declared/restaurant`; a source-stated name is `confirmed/source_stated/restaurant`; compatible user and source names are `confirmed/source_and_user`; conflicting names remain `unconfirmed/source_and_user/unknown` with neither candidate selected. Branch scope requires preserved branch-specific evidence and location alone never confirms identity.
- **Reason:** A declaration of a restaurant name does not prove that the uploaded menu belongs to that restaurant or a particular branch. Keeping declaration, source evidence, conflict, and branch scope separate prevents future relational storage from turning an ambiguous hint into a confirmed entity relationship.
- **Impact:** The live adapter now emits canonical `1.1.1`; model, prompt, provider schema, consistency profile, source fingerprint, and dish fingerprint inputs are unchanged. Result fingerprints change through the canonical version metadata. Strict `1.0.0` and `1.1.0` results remain readable with an internal conservative `none/unknown` fallback and are not rewritten. C2 must evaluate `status`, `basis`, and `scope` together: `likely/user_declared/restaurant` is candidate evidence only, `confirmed/source_stated/restaurant` does not establish a branch, and a `restaurant_location` link requires confirmed branch scope with branch-specific evidence preserved. No database, cache, provider bypass, or T7 link analysis is introduced.
- **Status:** Accepted
- **Date:** 2026-07-16

## D-065 — Freeze the C2.1 exact-cache boundary before database implementation

- **Decision:** C2.1 uses exact evidence identity `(source fingerprint, foodseyo-source-fingerprint-v1)` plus the immutable five-value analysis contract. A whole canonical snapshot receives a non-unique `foodseyo-snapshot-result-v1:<sha256>` identity. Provider construction follows pure input/model/contract preparation. Future ownership uses 120-second append-only attempts, a 2-second bounded busy wait, application-generated run UUID recovery, and short acquisition/persistence transactions. Active snapshots use partial uniqueness and guarded invalidation with a safe code.
- **Reason:** Cache lookup must be possible without provider credentials, duplicate provider calls require explicit ownership recovery, and corrupt or expired snapshots must be replaceable without deleting audit history or returning invalid canonical data.
- **Impact:** `menu_images` maps to database `uploaded_menu_images`; raw images and per-image hashes remain transient. Before ownership, cache/database failures may fall back to uncached analysis. After ownership, provider execution is forbidden unless ownership is proven. Snapshot insert and run-ready transition are atomic. The live API, provider request count, model/prompt/provider schema defaults, canonical `1.1.1`, source/dish fingerprint outputs, session key, UI, and storage behavior do not change. Drizzle, PostgreSQL packages, executable schema, migrations, connections, and cache lookup remain deferred to C2.1-B after manual C2.1-A infrastructure work.
- **Status:** Accepted
- **Date:** 2026-07-16
