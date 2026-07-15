import { z } from "zod";
import { DietaryKeySchema } from "../../domain/foodseyo-analysis.ts";
import { MAX_MENU_IMAGE_COUNT } from "./menu-image-limits.ts";

const NullableShortTextSchema = z.string().max(500).nullable();
const ShortTextArraySchema = z.array(z.string().min(1).max(200)).max(30);
const SourceImageIndexesSchema = z
  .array(z.number().int().nonnegative())
  .min(1)
  .max(MAX_MENU_IMAGE_COUNT);

export const MenuAnalysisQualitySchema = z.enum(["good", "partial", "unreadable"]);

export const MenuImageRestaurantSignalSchema = z.strictObject({
  kind: z.enum(["name", "logo_text", "address", "phone", "website"]),
  value: z.string().min(1).max(500),
  sourceImageIndex: z.number().int().nonnegative(),
});

export const MenuImageMoneySchema = z.strictObject({
  amount: z.number().finite().nonnegative(),
  currency: z.string().min(1).max(16).nullable(),
  displayText: z.string().min(1).max(100),
});

export const MenuImagePriceOptionSchema = z.strictObject({
  label: z.string().min(1).max(200),
  price: MenuImageMoneySchema.nullable(),
  sourceImageIndexes: SourceImageIndexesSchema,
});

export const MenuImageOptionSchema = z.strictObject({
  label: z.string().min(1).max(200),
  additionalPrice: MenuImageMoneySchema.nullable(),
  sourceImageIndexes: SourceImageIndexesSchema,
});

export const MenuImageDietaryClaimSchema = z.strictObject({
  key: DietaryKeySchema,
  claimType: z.enum(["contains", "label_present", "free_from"]),
  exactVisibleText: z.string().min(1).max(300),
  sourceImageIndexes: SourceImageIndexesSchema,
});

export const MenuImageGeneralKnowledgeSchema = z.strictObject({
  definition: NullableShortTextSchema,
  regionalBackground: NullableShortTextSchema,
  typicalTaste: ShortTextArraySchema,
  typicalTexture: ShortTextArraySchema,
  typicalSpice: z.string().max(100).nullable(),
  typicalPreparation: NullableShortTextSchema,
  commonIngredients: ShortTextArraySchema,
  similarDishes: ShortTextArraySchema,
  orderingConsiderations: ShortTextArraySchema,
});

export const MenuImageDishSchema = z.strictObject({
  name: z.string().min(1).max(300),
  originalName: z.string().max(300).nullable(),
  pronunciation: z.string().max(300).nullable(),
  menuDescription: z.string().max(1_500).nullable(),
  rawPriceText: z.string().max(300).nullable(),
  price: MenuImageMoneySchema.nullable(),
  priceOptions: z.array(MenuImagePriceOptionSchema).max(30),
  options: z.array(MenuImageOptionSchema).max(40),
  visibleSpiceLabel: z.string().max(100).nullable(),
  visibleDietaryLabels: ShortTextArraySchema,
  explicitDietaryClaims: z.array(MenuImageDietaryClaimSchema).max(30),
  generalKnowledge: MenuImageGeneralKnowledgeSchema,
  sourceImageIndexes: SourceImageIndexesSchema,
  uncertaintyNotes: ShortTextArraySchema,
});

export const MenuImageCategorySchema = z.strictObject({
  label: z.string().min(1).max(200),
  sourceImageIndexes: SourceImageIndexesSchema,
  dishes: z.array(MenuImageDishSchema).max(80),
});

export const MenuImageModelOutputSchema = z.strictObject({
  analysisQuality: MenuAnalysisQualitySchema,
  menuTitle: z.string().max(300).nullable(),
  currency: z.string().min(1).max(16).nullable(),
  restaurantSignals: z.array(MenuImageRestaurantSignalSchema).max(30),
  categories: z.array(MenuImageCategorySchema).max(50),
  warnings: z.array(z.string().min(1).max(500)).max(30),
});

export type MenuAnalysisQuality = z.infer<typeof MenuAnalysisQualitySchema>;
export type MenuImageModelOutput = z.infer<typeof MenuImageModelOutputSchema>;
export type MenuImageDish = z.infer<typeof MenuImageDishSchema>;
export type MenuImageMoney = z.infer<typeof MenuImageMoneySchema>;
