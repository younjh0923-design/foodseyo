export {
  ANALYSIS_CONSISTENCY_PROFILE,
  ANALYSIS_CONSISTENCY_PROFILE_VERSION,
  BASIC_TASTES,
  FLAVOR_NOTES,
  HEAT_LEVELS,
  INGREDIENT_EVIDENCE_BASES,
  RICHNESS_LEVELS,
  TEXTURES,
} from "./profile.ts";
export type {
  BasicTaste,
  BasicTasteIntensity,
  ConsistencyIssue,
  ConsistencyIssueCode,
  FlavorNote,
  HeatLevel,
  IngredientEvidenceBasis,
  RichnessLevel,
  Texture,
} from "./profile.ts";
export {
  normalizeComparisonText,
  normalizeDishConsistency,
  normalizeIngredientName,
} from "./normalize.ts";
export type {
  DishConsistencyInput,
  NormalizationResult,
  NormalizedDishConsistency,
  NormalizedIngredientEvidence,
} from "./normalize.ts";
export {
  createAnalysisConsistencyVersionMetadata,
} from "./metadata.ts";
export type {
  AnalysisConsistencyVersionInput,
  AnalysisConsistencyVersionMetadata,
} from "./metadata.ts";
export {
  ANALYSIS_FINGERPRINT_HASH_ALGORITHM,
  canonicalSerialize,
  createDishFingerprint,
  createSourceFingerprint,
} from "./fingerprint.ts";
export type {
  DishFingerprintInput,
  SourceFingerprintInput,
} from "./fingerprint.ts";
export { renderDishConsistencyWording } from "./wording.ts";
export type { DishConsistencyWording } from "./wording.ts";
export {
  isDishFingerprint,
  isSourceFingerprint,
  validateAnalysisConsistency,
  validateCanonicalSerialization,
  validateConsistencyVersionMetadata,
  validateDishFingerprintInput,
  validateSourceFingerprintInput,
} from "./validate.ts";
