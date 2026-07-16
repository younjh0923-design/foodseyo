import type {
  MealPreferences,
  OrderRecommendation,
  OrderRecommendationItem,
  Restaurant,
} from "@/types/domain";

const reasonByDish: Record<string, string> = {
  "khao-soi": "The restaurant’s signature noodle dish and the center of the meal.",
  "sai-ua": "A shareable savory side with a contrasting grilled texture.",
  "mango-sticky-rice": "A sweet finish that balances the richer dishes.",
  "pad-kra-pao": "A bold basil rice dish that adds a peppery contrast.",
  "green-curry": "A creamy herbal curry that works well for sharing.",
  "tom-yum-soup": "A bright, hot-and-sour option for a more adventurous table.",
};

export function recommendOrder(
  restaurant: Restaurant,
  preferences: MealPreferences,
): OrderRecommendation {
  let dishIds = ["khao-soi", "sai-ua", "mango-sticky-rice"];

  if (preferences.goal === "Best value") dishIds = ["pad-kra-pao", "sai-ua"];
  if (preferences.goal === "Try something new") dishIds = ["tom-yum-soup", "sai-ua", "mango-sticky-rice"];
  if (preferences.goal === "Local experience") dishIds = ["khao-soi", "sai-ua", "green-curry"];
  if (preferences.partySize === "1") dishIds = [preferences.goal === "Best value" ? "pad-kra-pao" : "khao-soi"];
  if (preferences.partySize === "3-4") dishIds = [...dishIds, "green-curry"];
  if (preferences.partySize === "5+") dishIds = [...dishIds, "green-curry", "pad-kra-pao"];

  const items: OrderRecommendationItem[] = dishIds.map((dishId) => ({
    dishId,
    quantity: preferences.partySize === "5+" && dishId === "khao-soi" ? 2 : 1,
    reason: reasonByDish[dishId],
  }));

  const estimatedTotal = items.reduce((total, item) => {
    const price = restaurant.dishes.find((dish) => dish.id === item.dishId)?.price ?? 0;
    return total + price * item.quantity;
  }, 0);

  return {
    items,
    estimatedTotal,
    currency: "CAD",
    summary: `A ${preferences.sharing === "Share dishes" ? "shareable" : "flexible"} mix built around ${preferences.goal.toLowerCase()}.`,
    warnings: [],
  };
}
