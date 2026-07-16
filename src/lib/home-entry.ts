export const HOME_ENTRY_COPY = {
  brand: "FOODSEYO",
  brandDescription: "AI Food Copilot",
  heading: "Know what you’re ordering.",
  description:
    "See the taste, texture, ingredients, and details behind every dish.",
  linkPlaceholder: "Paste a restaurant or menu link",
  imageTitle: "Scan or upload a menu",
  imageDescription: "Take or choose menu photos.",
} as const;

export const INVALID_RESTAURANT_LINK_MESSAGE =
  "Enter a valid restaurant or menu link.";
export const RESTAURANT_LINK_UNAVAILABLE_MESSAGE =
  "Link analysis is coming soon. Scan or upload menu photos for now.";

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
