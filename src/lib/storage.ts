import type { FoodPassport } from "@/types/domain";

export const PASSPORT_STORAGE_KEY = "foodseyo:food-passport";

export const emptyPassport: FoodPassport = {
  allergies: [],
  diets: [],
  avoidedIngredients: [],
  spicePreference: "mild",
  preferredLanguage: "English",
  configured: false,
};

export function readPassport(): FoodPassport {
  if (typeof window === "undefined") return emptyPassport;

  try {
    const stored = window.localStorage.getItem(PASSPORT_STORAGE_KEY);
    return stored ? ({ ...emptyPassport, ...JSON.parse(stored) } as FoodPassport) : emptyPassport;
  } catch {
    return emptyPassport;
  }
}

export function writePassport(passport: FoodPassport): void {
  window.localStorage.setItem(PASSPORT_STORAGE_KEY, JSON.stringify(passport));
}

export function removePassport(): void {
  window.localStorage.removeItem(PASSPORT_STORAGE_KEY);
}
