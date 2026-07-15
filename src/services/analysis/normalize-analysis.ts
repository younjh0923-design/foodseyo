const DEDUPLICATED_STRING_ARRAY_FIELDS = new Set([
  "sourceIds",
  "evidenceIds",
  "limitations",
  "comparedFields",
  "differences",
  "cuisineLabels",
  "matchReasons",
  "visibleDietaryLabels",
  "typicalTaste",
  "typicalTexture",
  "commonIngredients",
  "similarDishes",
  "orderingConsiderations",
  "values",
  "repeatedPositives",
  "repeatedNegatives",
  "disagreements",
  "assumptions",
  "warnings",
  "dietaryWarnings",
  "evidenceLimitations",
  "dishIds",
  "relatedEntityIds",
]);

const isUnknownArray = (value: unknown): value is unknown[] => Array.isArray(value);

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const uniqueStrings = (values: readonly string[]): string[] => [...new Set(values)];

function normalizeValue(value: unknown, fieldName: string | null): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (isUnknownArray(value)) {
    const normalized = value.map((item) => normalizeValue(item, null));
    if (
      fieldName !== null &&
      DEDUPLICATED_STRING_ARRAY_FIELDS.has(fieldName) &&
      normalized.every((item): item is string => typeof item === "string")
    ) {
      return uniqueStrings(normalized);
    }

    return normalized;
  }

  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeValue(item, key)]),
    );
  }

  return value;
}

export function normalizeAnalysisPayloadCandidate(payloadCandidate: unknown): unknown {
  return normalizeValue(payloadCandidate, null);
}
