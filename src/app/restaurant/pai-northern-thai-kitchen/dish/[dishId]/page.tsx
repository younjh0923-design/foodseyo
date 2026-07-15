import { notFound } from "next/navigation";
import { DishDetailClient } from "@/components/dish/DishDetailClient";
import { demoRestaurant, getDish } from "@/data/demoRestaurant";

export function generateStaticParams() {
  return demoRestaurant.dishes.map((dish) => ({ dishId: dish.id }));
}

export default async function DishPage({ params }: { params: Promise<{ dishId: string }> }) {
  const { dishId } = await params;
  const dish = getDish(dishId);
  if (!dish) notFound();

  return <DishDetailClient dish={dish} />;
}
