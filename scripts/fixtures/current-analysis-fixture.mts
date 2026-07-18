import {
  ConsistentFoodseyoAnalysisSchema,
  FOODSEYO_ANALYSIS_SCHEMA_VERSION,
  type AnalysisConsistencyVersionMetadata,
  type ConsistentFoodseyoAnalysis,
} from "../../src/domain/foodseyo-analysis.ts";
import { demoFoodseyoAnalysis } from "../../src/data/demoFoodseyoAnalysis.ts";
import {
  createAnalysisResultFingerprint,
  createDishFingerprint,
  normalizeDishConsistency,
  renderDishConsistencyWording,
} from "../../src/lib/analysis-consistency/index.ts";
import { validateAnalysisSemantics } from "../../src/services/analysis/validate-analysis-semantics.ts";

export async function createCurrentAnalysisFixture(input: {
  readonly sourceFingerprint: string;
  readonly versions: AnalysisConsistencyVersionMetadata;
}): Promise<ConsistentFoodseyoAnalysis> {
  if (
    input.versions.canonicalSchemaVersion !==
    FOODSEYO_ANALYSIS_SCHEMA_VERSION
  ) {
    throw new TypeError("Current fixture requires the current canonical schema.");
  }

  const legacy = structuredClone(demoFoodseyoAnalysis);
  const menu = legacy.payload.menu;
  if (!menu) throw new TypeError("Current fixture requires a menu.");

  const consistency = normalizeDishConsistency({}).value;
  const consistencyWording = renderDishConsistencyWording(consistency);
  const dishes = await Promise.all(
    menu.dishes.map(async (dish) => {
      const dishFingerprint = await createDishFingerprint({
        sourceFingerprint: input.sourceFingerprint,
        sourceDishIdentifier: dish.id,
        sourceStatedName: dish.name,
        sourceStatedDescription: dish.menuDescription,
        sourceStatedCategoryLabel:
          menu.categories.find((category) => category.id === dish.categoryId)
            ?.label ?? null,
        sourceStatedPrice: {
          amount: dish.price?.amount ?? null,
          currency: dish.price?.currency ?? null,
          displayText: dish.price?.displayText ?? null,
        },
      });
      return {
        ...dish,
        consistency,
        consistencyWording,
        analysisIdentity: {
          dishFingerprint,
          resultFingerprint: await createAnalysisResultFingerprint({
            dishFingerprint,
            consistency,
            versions: input.versions,
          }),
        },
      };
    }),
  );

  const parsed = ConsistentFoodseyoAnalysisSchema.parse({
    ...legacy,
    schemaVersion: FOODSEYO_ANALYSIS_SCHEMA_VERSION,
    analysisId: "synthetic-current-analysis-cache-fixture",
    inputContext: {
      type: "menu_images",
      imageCount: 1,
      userEnteredRestaurantName: null,
      locationUsed: false,
      storageScope: "session_only",
    },
    payload: {
      ...legacy.payload,
      restaurantResolution: {
        ...legacy.payload.restaurantResolution,
        basis: "source_stated",
        scope: "restaurant",
      },
      menu: {
        ...menu,
        dishes,
      },
    },
    analysisMetadata: {
      sourceFingerprint: input.sourceFingerprint,
      versions: input.versions,
    },
  });
  if (validateAnalysisSemantics(parsed.payload).errors.length > 0) {
    throw new TypeError("Current fixture failed semantic validation.");
  }
  return parsed;
}
