import Link from "next/link";
import { ChevronRight, CircleCheck } from "lucide-react";
import { SafeImage } from "@/components/common/SafeImage";
import type { Dish } from "@/types/domain";

interface DishCardProps {
  dish: Dish;
  compact?: boolean;
  showReason?: string;
}

export function DishCard({ dish, compact = false, showReason }: DishCardProps) {
  const href = `/restaurant/pai-northern-thai-kitchen/dish/${dish.id}`;

  if (compact) {
    return (
      <Link
        href={href}
        className="block w-[264px] shrink-0 overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--surface)] transition-colors hover:bg-[var(--canvas)]"
      >
        <div className="relative h-32 overflow-hidden bg-[var(--canvas)]">
          <SafeImage
            src={dish.imageUrl}
            alt={`${dish.name} demo reference`}
            imagePosition={dish.imagePosition}
            className="h-full w-full object-cover"
          />
          <span className="absolute bottom-2 left-2 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold text-[var(--muted)]">
            {dish.imageSource}
          </span>
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-[16px] font-bold">{dish.name}</h3>
              <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">{dish.shortDescription}</p>
            </div>
            <span className="shrink-0 text-sm font-bold">
              {dish.price === null ? "Price unavailable" : `${dish.currency} ${dish.price}`}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {dish.tasteTags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-full bg-[var(--orange-soft)] px-2.5 py-1 text-[11px] font-semibold text-[#8C4323]">
                {tag}
              </span>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3 text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-[var(--primary)]">
              <CircleCheck aria-hidden="true" size={15} />
              {dish.reviewBadge}
            </span>
            <ChevronRight aria-hidden="true" size={17} />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="flex min-h-[116px] gap-3 rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-3 transition-colors hover:bg-[var(--canvas)]"
    >
      <SafeImage
        src={dish.imageUrl}
        alt={`${dish.name} demo reference`}
        imagePosition={dish.imagePosition}
        className="h-[92px] w-[92px] shrink-0 rounded-2xl object-cover"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="block truncate text-sm font-bold">{dish.name}</span>
          <span className="shrink-0 text-xs font-bold">
            {dish.price === null ? "—" : `${dish.currency} ${dish.price}`}
          </span>
        </span>
        <span className="mt-1 line-clamp-2 block text-xs leading-4 text-[var(--text-secondary)]">{dish.shortDescription}</span>
        {showReason ? (
          <span className="mt-2 block text-xs font-semibold leading-4 text-[var(--green)]">{showReason}</span>
        ) : (
          <span className="mt-2 flex flex-wrap gap-1">
            {dish.tasteTags.slice(0, 2).map((tag) => (
              <span key={tag} className="rounded-full bg-[#F4F1EB] px-2 py-1 text-[10px] font-semibold">
                {tag}
              </span>
            ))}
          </span>
        )}
      </span>
      <ChevronRight aria-hidden="true" className="mt-9 shrink-0 text-[var(--muted)]" size={18} />
    </Link>
  );
}
