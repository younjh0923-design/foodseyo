import {
  FoodseyoAnalysisSchema,
  type FoodseyoAnalysis,
} from "../domain/foodseyo-analysis.ts";
import type { FoodPassport } from "../types/domain.ts";

export const PASSPORT_STORAGE_KEY = "foodseyo:food-passport";
export const CURRENT_ANALYSIS_STORAGE_KEY = "foodseyo.currentAnalysis";

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

export function serializeCurrentAnalysis(analysis: FoodseyoAnalysis): string {
  return JSON.stringify(FoodseyoAnalysisSchema.parse(analysis));
}

export function parseStoredCurrentAnalysis(value: string | null): FoodseyoAnalysis | null {
  if (value === null) return null;
  try {
    const result = FoodseyoAnalysisSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function readCurrentAnalysis(): FoodseyoAnalysis | null {
  if (typeof window === "undefined") return null;
  return parseStoredCurrentAnalysis(window.sessionStorage.getItem(CURRENT_ANALYSIS_STORAGE_KEY));
}

export function writeCurrentAnalysis(analysis: FoodseyoAnalysis): void {
  window.sessionStorage.setItem(CURRENT_ANALYSIS_STORAGE_KEY, serializeCurrentAnalysis(analysis));
}

export interface CurrentAnalysisStorageWriter {
  setItem(key: string, value: string): void;
}

export function tryWriteCurrentAnalysis(
  analysis: FoodseyoAnalysis,
  storage?: CurrentAnalysisStorageWriter,
): boolean {
  try {
    const target =
      storage ?? (typeof window !== "undefined" ? window.sessionStorage : null);
    if (!target) return false;
    target.setItem(CURRENT_ANALYSIS_STORAGE_KEY, serializeCurrentAnalysis(analysis));
    return true;
  } catch {
    return false;
  }
}

export function removeCurrentAnalysis(): void {
  window.sessionStorage.removeItem(CURRENT_ANALYSIS_STORAGE_KEY);
}
