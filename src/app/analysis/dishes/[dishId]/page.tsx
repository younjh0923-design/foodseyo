import { LiveDishDetailClient } from "@/components/analysis/LiveDishDetailClient";

export default async function LiveDishPage({
  params,
}: {
  readonly params: Promise<{ readonly dishId: string }>;
}) {
  const { dishId } = await params;
  return <LiveDishDetailClient dishId={dishId} />;
}
