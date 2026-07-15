# Foodseyo Home Entry UI

**Status:** Implemented for T5.2

**Date:** 2026-07-15

## Frozen visible structure

Home shows, in order:

1. `FOODSEYO` and `AI Food Copilot`;
2. `What should I order?` and `Start with a restaurant link or image.`;
3. the restaurant/menu link bar;
4. equal **Food Passport** and **Scan or upload** cards.

Nearby, Recent, the fixed PAI demo card, and separate screenshot/menu cards are not shown. Their routes and analyzer architecture remain intact.

## Honest actions

The link field accepts only syntactically valid HTTP or HTTPS URLs. It makes no request and has no demo fallback while the live link analyzer is unavailable.

**Scan or upload** opens **Add an image** with **Take a photo** and **Choose from photos**. Home opens each picker from its button's click, validates the selection, and stages ordered Files only in React memory. Menu Scan consumes them once, clears the provider, and owns all preview object URLs. Refresh may discard pending Files by design.

The current live backend analyzes menu text only. Restaurant-photo and restaurant-screen classification or routing is deferred.

## Responsive manual QA

Verify at 320×568, 360×800, 375×812, 390×844, 430×932, and desktop 1280px with the centered MobileShell:

- natural heading and description wrapping;
- no horizontal scroll or link-button overlap;
- equal card heights, Food Passport on the left, Scan or upload on the right;
- untruncated card copy and contained Passport status;
- readable Bottom Sheet actions and safe-area spacing;
- no oversized empty region after removal of Recent.

## iPhone Safari checklist

These items require a physical-device run and are not claimed as passed by automated tests.

Home:

- verify card tap targets, link keyboard and Enter submission;
- open and close the Bottom Sheet, check focus return and body scroll;
- confirm Food Passport remains left and Scan or upload right.

Take a photo:

- rear camera opens and cancellation returns safely;
- one portrait and one landscape photo preserve orientation;
- one selected photo appears in Menu Scan.

Choose from photos:

- library opens for one, multiple, and ten images;
- eleven images and unsupported HEIC show a safe error without navigation;
- selection order matches Menu Scan previews;
- cancellation stays on Home.

Navigation:

- verify Back, discard, direct `/menu-scan`, refresh, and Home return;
- confirm consumed pending Files are not reused.
