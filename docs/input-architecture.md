# Foodseyo MVP Input Architecture

**Status:** C1.2.1 provenance correction; active input scope unchanged

**Date:** 2026-07-16

The MVP has two product entry surfaces and one shared canonical destination:

```text
menu_images ───────┐
                   ├─→ shared canonical analysis → ordering guidance
restaurant_link ───┘
```

`menu_images` is live. `restaurant_link` currently provides UI and HTTP/HTTPS syntax validation only; its analyzer is T7 and must not be simulated with demo data.

## Menu images

The officially supported image input is menu photos. Home uses one native browser/operating-system picker. The picker accepts one to ten ordered JPEG, PNG, or WEBP Files, has no `capture` hint, and passes Files through an in-memory React provider to `/menu-scan`.

The browser applies the existing 25,000,000-byte per-file and 100,000,000-byte source-set guards, then adaptively preprocesses toward 3,800,000 total bytes without crossing the readability floor. The server independently enforces 4,000,000 processed bytes. All retained images remain ordered in one Responses API request. Permanent upload storage and multi-request merge remain out of scope.

The product does not attempt a new client-side classifier to judge the subject of a selected file. It communicates that menu photos are supported and relies on the existing menu analyzer's safe validation behavior.

## Restaurant or menu link

Home retains `Paste a restaurant or menu link`. At T5.5 it:

- accepts HTTP and HTTPS syntax;
- rejects unsafe or malformed schemes;
- makes no fetch or provider call;
- stores no submitted URL;
- never navigates to a fake result.

T7 will define live restaurant/menu link analysis separately.

## Canonical compatibility

Schema version `1.0.0` still parses the legacy `restaurant_photo` and `restaurant_screen` enum branches and `user_provided_screen` evidence so existing serialized fixtures and exhaustive orchestration types are not broken by an unrelated migration. These are compatibility-only values: there is no Home control, public API route, provider override, or successful live analyzer for them. The default registry returns `AnalysisCapabilityUnavailableError`.

`restaurant_link` also remains capability-unavailable until T7. Only the menu-image API route injects a live analyzer.

## C1 consistency foundation

C1 is a separate checkpoint before C2 and T7. C1.1 added the versioned, network-free profile, normalization, wording, validation, and fingerprint foundation. C1.2 connects it only to the existing live `menu_images` path; C1.2.1 corrects restaurant provenance at the same adapter boundary. Input scope, Home link-only validation, and the one-request image intake remain unchanged.

Source, dish, and result fingerprints remain identity metadata only. C1.2 does not add a cache, database, shared registry, persistent history, or automatic provider bypass.

## Result and storage boundary

Validated analysis is stored under `foodseyo.currentAnalysis` in `sessionStorage` and rendered at `/analysis` and `/analysis/dishes/[dishId]`. Raw Files remain in memory only until Menu Scan consumes them. There is no user-profile storage in the active MVP.

## Roadmap

- T5–T5.4.1 — menu-image vertical slice complete
- T5.5 — MVP scope alignment cleanup
- T6 — cancelled from the MVP
- R1 — internal codebase and development workflow optimization
- C1.1 / C1.1.1 — consistency foundations (completed)
- C1.2 — live menu-image consistency integration (completed)
- C1.2.1 — restaurant-resolution provenance correction (completed)
- C2.1-A/B — isolated database infrastructure and Development schema (completed)
- C2.1-C — runtime repositories (completed)
- C2.1-D — exact cache integration (completed locally; not deployed)
- C2.1-E — ownership and failure policy (completed locally; not deployed)
- C2.1-F — required Development integrity/concurrency validation (completed locally)
- C2.1-G — rollout-readiness review completed; Production rollout deferred
- C2.1-H — exact feature-branch preservation completed; automatic Preview is build provenance only
- C2.2-A — scoped logical ERD v3 audit complete; no physical schema
- C2.2-B–D — bounded physical integrity contract, scoped decisions, and unexecuted schema draft
- C2.3 candidate — Development-only structured menu projection after the C2.2 gates
- T7.1–T7.4 — restaurant/menu link analysis after C2
- T8 — restaurant identification, reconsider after T7
- Later — map-app share-to-Foodseyo integration

Map-app sharing is a roadmap item only; no share extension or inbound share flow exists today.
