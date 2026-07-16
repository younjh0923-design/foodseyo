# Foodseyo MVP Input Architecture

**Status:** C1.1 consistency foundation; active input scope unchanged

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

C1 is a separate checkpoint before T7. C1.1 adds a versioned, network-free consistency profile, normalization, wording, validation, and fingerprint foundation without connecting it to the live menu-image provider, prompt, response schema, canonical `FoodseyoAnalysis`, or result UI. C1.2 is the next checkpoint and will evaluate that integration explicitly.

Source and dish fingerprints are identity contracts only. C1.1 does not add a cache, database, shared registry, persistent history, or automatic provider bypass.

## Result and storage boundary

Validated analysis is stored under `foodseyo.currentAnalysis` in `sessionStorage` and rendered at `/analysis` and `/analysis/dishes/[dishId]`. Raw Files remain in memory only until Menu Scan consumes them. There is no user-profile storage in the active MVP.

## Roadmap

- T5–T5.4.1 — menu-image vertical slice complete
- T5.5 — MVP scope alignment cleanup
- T6 — cancelled from the MVP
- R1 — internal codebase and development workflow optimization
- C1.1 — analysis consistency contract foundation (current)
- C1.2 — live menu-image consistency integration (next)
- T7 — restaurant/menu link analysis after C1
- T8 — restaurant identification, reconsider after T7
- Later — map-app share-to-Foodseyo integration

Map-app sharing is a roadmap item only; no share extension or inbound share flow exists today.
