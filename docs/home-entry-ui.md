# Foodseyo Home Entry UI

**Status:** C1.1 copy alignment; T5.5 interaction unchanged

**Date:** 2026-07-16

## Visible structure

Home shows, in order:

1. `FOODSEYO` and `AI Food Copilot`;
2. `Know what you’re ordering.`;
3. `See the taste, texture, ingredients, and details behind every dish.`;
4. the `Paste a restaurant or menu link` field;
5. one full-width `Scan or upload a menu` action with `Take or choose menu photos.`

The link field accepts syntactically valid HTTP/HTTPS URLs. Link analysis is not implemented yet: the field makes no request, shows an honest availability message, and never redirects to a fake or demo result.

## Native menu-photo picker

The full CTA is a keyboard-operable button whose accessible name is exactly `Scan or upload a menu`. It directly activates one hidden `type="file"` input with:

- `multiple` enabled;
- `accept="image/jpeg,image/png,image/webp"`;
- no `capture` attribute.

Foodseyo does not recreate the device picker choices. On iPhone, Safari may offer Photo Library, Take Photo, or Choose Files as native options.

Cancellation leaves the user on Home. A valid selection of up to ten ordered Files is validated, staged only in React memory, and handed once to `/menu-scan`. Menu Scan owns and revokes preview object URLs. No raw File is placed in local storage, session storage, IndexedDB, Base64, a URL, or permanent storage.

## Responsive and accessibility QA

Check mobile at approximately 390 px and a desktop viewport:

- natural heading and description wrapping;
- no horizontal overflow or link-button collision;
- one full-width image CTA below the link field;
- CTA touch area larger than 44 px;
- exact accessible name and keyboard activation;
- no duplicate accessible file-input control;
- picker cancellation leaves Home unchanged;
- valid selection reaches `/menu-scan` with order preserved.

A physical iPhone Safari run remains the authority for the exact native picker wording and device-specific presentation.
