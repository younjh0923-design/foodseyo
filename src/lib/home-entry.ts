export const HOME_ENTRY_COPY = {
  brand: "FOODSEYO",
  brandDescription: "AI Food Copilot",
  heading: "What should I order?",
  description: "Start with a restaurant link or image.",
  linkPlaceholder: "Paste a restaurant or menu link",
  foodPassportTitle: "Food Passport",
  foodPassportDescription: "Allergies & preferences",
  imageTitle: "Scan or upload",
  imageDescription: "Menu, screenshot, or restaurant sign",
} as const;

export const INVALID_RESTAURANT_LINK_MESSAGE =
  "Enter a valid restaurant or menu link.";
export const RESTAURANT_LINK_UNAVAILABLE_MESSAGE =
  "Link analysis is coming soon. Scan or upload an image for now.";

export type RestaurantLinkCheckResult =
  | { readonly kind: "empty"; readonly message: null }
  | { readonly kind: "invalid"; readonly message: typeof INVALID_RESTAURANT_LINK_MESSAGE }
  | {
      readonly kind: "unavailable";
      readonly message: typeof RESTAURANT_LINK_UNAVAILABLE_MESSAGE;
    };

export function checkRestaurantLink(value: string): RestaurantLinkCheckResult {
  const trimmed = value.trim();
  if (!trimmed) return { kind: "empty", message: null };

  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname
    ) {
      return { kind: "invalid", message: INVALID_RESTAURANT_LINK_MESSAGE };
    }
  } catch {
    return { kind: "invalid", message: INVALID_RESTAURANT_LINK_MESSAGE };
  }

  return {
    kind: "unavailable",
    message: RESTAURANT_LINK_UNAVAILABLE_MESSAGE,
  };
}
