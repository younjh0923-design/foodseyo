import {
  ConsistentFoodseyoAnalysisSchema,
  type ClaimEvidence,
  type ConsistentFoodseyoAnalysis,
  type Money,
} from "../../domain/foodseyo-analysis.ts";
import {
  ProjectorVersionSchema,
  StructuredMenuProjectionDtoSchema,
  StructuredMenuProjectionError,
  parseStructuredMenuValue,
  type StructuredMenuProjectionDto,
  type StructuredMenuProjectionPrice,
} from "../../lib/database/structured-menu/contracts.ts";
import { validateAnalysisSemantics } from "../analysis/validate-analysis-semantics.ts";

const normalizeOptionalText = (value: string | null): string | null => {
  return value === null || value.trim().length === 0 ? null : value;
};

const toPlainNumericText = (value: number): string => {
  const source = String(value);
  if (!/[eE]/u.test(source)) return source;

  const [coefficient = "", exponentText = "0"] = source
    .toLowerCase()
    .split("e");
  const exponent = Number(exponentText);
  const negative = coefficient.startsWith("-");
  const unsigned = negative ? coefficient.slice(1) : coefficient;
  const [integerPart = "0", fractionalPart = ""] = unsigned.split(".");
  const digits = `${integerPart}${fractionalPart}`;
  const decimalIndex = integerPart.length + exponent;
  const plain =
    decimalIndex <= 0
      ? `0.${"0".repeat(-decimalIndex)}${digits}`
      : decimalIndex >= digits.length
        ? `${digits}${"0".repeat(decimalIndex - digits.length)}`
        : `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
  return negative ? `-${plain}` : plain;
};

const hasEligiblePriceEvidence = (evidence: ClaimEvidence): boolean => {
  return (
    evidence.availability === "available" &&
    (evidence.basis === "direct_observation" ||
      evidence.basis === "external_source") &&
    evidence.sourceIds.length > 0
  );
};

const buildPrice = (
  money: Money | null,
  evidence: ClaimEvidence,
  identity:
    | { readonly priceKind: "base" }
    | {
        readonly priceKind: "option";
        readonly analysisPriceId: string;
        readonly contextLabel: string;
      },
  position: number,
): StructuredMenuProjectionPrice | null => {
  if (
    money === null ||
    !hasEligiblePriceEvidence(evidence) ||
    !Number.isFinite(money.amount) ||
    money.amount < 0 ||
    money.displayText.trim().length === 0
  ) {
    return null;
  }

  return {
    analysisPriceId:
      identity.priceKind === "option" ? identity.analysisPriceId : null,
    position,
    priceKind: identity.priceKind,
    contextLabel:
      identity.priceKind === "option" ? identity.contextLabel : null,
    amount: toPlainNumericText(money.amount),
    currency: normalizeOptionalText(money.currency),
    displayText: money.displayText,
  };
};

const parseCanonicalSource = (
  candidate: unknown,
): ConsistentFoodseyoAnalysis => {
  const parsed = ConsistentFoodseyoAnalysisSchema.safeParse(candidate);
  if (
    !parsed.success ||
    validateAnalysisSemantics(parsed.data.payload).errors.length > 0
  ) {
    throw new StructuredMenuProjectionError(
      "SOURCE_SNAPSHOT_INELIGIBLE",
    );
  }
  return parsed.data;
};

export function buildStructuredMenuProjection(input: {
  readonly analysisSnapshotId: string;
  readonly projectorVersion: string;
  readonly canonicalResult: unknown;
}): StructuredMenuProjectionDto {
  const projectorVersion = parseStructuredMenuValue(
    ProjectorVersionSchema,
    input.projectorVersion,
    "INVALID_PROJECTION_INPUT",
  );
  const analysis = parseCanonicalSource(input.canonicalResult);
  const menu = analysis.payload.menu;
  if (
    analysis.status === "failed" ||
    menu === null ||
    menu.dishes.length === 0
  ) {
    throw new StructuredMenuProjectionError(
      "SOURCE_SNAPSHOT_INELIGIBLE",
    );
  }

  const sections = menu.categories.map((category, position) => ({
    analysisCategoryId: category.id,
    position,
    label: category.label,
  }));
  const categoryIds = new Set(
    sections.map((section) => section.analysisCategoryId),
  );
  if (
    categoryIds.size !== sections.length ||
    menu.dishes.some(
      (dish) =>
        dish.categoryId !== null && !categoryIds.has(dish.categoryId),
    )
  ) {
    throw new StructuredMenuProjectionError(
      "SOURCE_SNAPSHOT_INELIGIBLE",
    );
  }

  const dishIds = new Set<string>();
  const items = menu.dishes.map((dish, position) => {
    if (dishIds.has(dish.id)) {
      throw new StructuredMenuProjectionError(
        "SOURCE_SNAPSHOT_INELIGIBLE",
      );
    }
    dishIds.add(dish.id);

    const prices: StructuredMenuProjectionPrice[] = [];
    const basePrice = buildPrice(
      dish.price,
      dish.priceEvidence,
      { priceKind: "base" },
      prices.length,
    );
    if (basePrice) prices.push(basePrice);

    for (const option of dish.priceOptions) {
      const optionPrice = buildPrice(
        option.price,
        option.priceEvidence,
        {
          priceKind: "option",
          analysisPriceId: option.id,
          contextLabel: option.label,
        },
        prices.length,
      );
      if (optionPrice) prices.push(optionPrice);
    }

    return {
      analysisDishId: dish.id,
      sectionAnalysisCategoryId: dish.categoryId,
      position,
      displayName: dish.name,
      originalName: normalizeOptionalText(dish.originalName),
      menuDescription: normalizeOptionalText(dish.menuDescription),
      prices,
    };
  });

  return parseStructuredMenuValue(
    StructuredMenuProjectionDtoSchema,
    {
      analysisSnapshotId: input.analysisSnapshotId,
      projectorVersion,
      title: normalizeOptionalText(menu.title),
      currency: normalizeOptionalText(menu.currency),
      sections,
      items,
    },
    "INVALID_PROJECTION_INPUT",
  );
}
