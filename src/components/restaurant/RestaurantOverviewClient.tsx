"use client";

import { Heart, MessageCircle, Search, Sparkles, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { AssistantSheet } from "@/components/assistant/AssistantSheet";
import { ChoiceChip, IconButton, PrimaryButton } from "@/components/common/Controls";
import { PageHeader } from "@/components/common/PageHeader";
import { SafeImage } from "@/components/common/SafeImage";
import { MobileShell } from "@/components/layout/MobileShell";
import { useFoodPassport } from "@/components/passport/PassportProvider";
import { MealPlannerSheet } from "@/components/recommendation/MealPlannerSheet";
import { DishCard } from "@/components/restaurant/DishCard";
import { demoRestaurant } from "@/data/demoRestaurant";

const categories = ["All", "Noodles", "Curry", "Rice", "Sides", "Dessert"] as const;

export function RestaurantOverviewClient() {
  const { passport, hydrated } = useFoodPassport();
  const [favorite, setFavorite] = useState(false);
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [search, setSearch] = useState("");
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  const representativeDishes = demoRestaurant.representativeDishIds
    .map((id) => demoRestaurant.dishes.find((dish) => dish.id === id))
    .filter((dish) => dish !== undefined);

  const filteredDishes = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return demoRestaurant.dishes.filter((dish) => {
      const matchesCategory = category === "All" || dish.category === category;
      const matchesSearch = !normalized || dish.name.toLowerCase().includes(normalized) || dish.shortDescription.toLowerCase().includes(normalized) || dish.tasteTags.some((tag) => tag.toLowerCase().includes(normalized));
      return matchesCategory && matchesSearch;
    });
  }, [category, search]);

  const forYou = useMemo(() => {
    const ids = passport.avoidedIngredients.includes("Coconut") ? ["pad-kra-pao", "sai-ua"] : ["khao-soi", "mango-sticky-rice"];
    return ids.map((id) => demoRestaurant.dishes.find((dish) => dish.id === id)).filter((dish) => dish !== undefined);
  }, [passport.avoidedIngredients]);

  return (
    <MobileShell>
      <article className="min-h-dvh pb-28">
        <PageHeader
          title="Restaurant"
          compact
          backHref="/"
          backLabel="Back to home"
          action={
            <IconButton label={favorite ? "Remove from favorites" : "Add to favorites"} aria-pressed={favorite} onClick={() => setFavorite((current) => !current)} className={favorite ? "border-[var(--accent)] bg-[var(--soft-orange)] text-[var(--accent)]" : undefined}>
              <Heart aria-hidden="true" fill={favorite ? "currentColor" : "none"} size={20} />
            </IconButton>
          }
        />

        <header>
          <div className="relative h-[218px] overflow-hidden bg-[var(--canvas)]">
            <SafeImage src={demoRestaurant.imageUrl} alt="Northern Thai dishes used as a demo reference" imagePosition="50% 46%" className="h-full w-full object-cover" />
            <span className="absolute bottom-3 left-4 rounded-full bg-[var(--surface)]/95 px-3 py-1.5 text-[10px] font-bold text-[var(--text-secondary)]">{demoRestaurant.imageSource}</span>
          </div>
          <div className="page-padding pt-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">Demo restaurant analysis</p>
            <h1 className="mt-2 text-[30px] font-bold leading-[1.08] tracking-[-0.04em]">{demoRestaurant.name}</h1>
            <p className="mt-3 text-sm font-semibold text-[var(--primary)]">{demoRestaurant.location} · {demoRestaurant.cuisine} · {demoRestaurant.priceLevel}</p>
            <p className="mt-3 text-[15px] leading-6 text-[var(--text-secondary)]">{demoRestaurant.shortSummary}</p>
          </div>
        </header>

        <section aria-labelledby="representative-title" className="mt-9">
          <div className="page-padding flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-[var(--accent)]">Start here</p>
              <h2 id="representative-title" className="mt-1 text-[23px] font-bold tracking-[-0.03em]">Representative dishes</h2>
            </div>
            <span className="text-xs text-[var(--text-muted)]">{representativeDishes.length} dishes</span>
          </div>
          <div className="scrollbar-none mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:px-6">
            {representativeDishes.map((dish) => <div key={dish.id} className="snap-start"><DishCard dish={dish} compact /></div>)}
          </div>
        </section>

        {hydrated && passport.configured ? (
          <section aria-labelledby="for-you-title" className="page-padding mt-9">
            <p className="text-xs font-bold text-[var(--accent)]">Based on your Food Passport</p>
            <h2 id="for-you-title" className="mt-1 text-[23px] font-bold tracking-[-0.03em]">For you</h2>
            <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">Cautious matches only—always confirm allergy details with staff.</p>
            <div className="mt-4 space-y-3">
              {forYou.map((dish) => (
                <DishCard key={dish.id} dish={dish} showReason={passport.avoidedIngredients.includes("Coconut") ? "Lower-coconut demo match; confirm ingredients." : `Matches your ${passport.spicePreference} spice preference.`} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="page-padding mt-9">
          <div className="rounded-[24px] border border-[var(--border)] bg-[var(--soft-green)] p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary)] text-white"><Users aria-hidden="true" size={21} /></span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.13em] text-[var(--primary)]">Plan this meal</p>
                <h2 className="mt-1 text-lg font-bold">Turn dishes into an order</h2>
                <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">Choose party size, budget and what matters today.</p>
              </div>
            </div>
            <PrimaryButton className="mt-4 w-full" onClick={() => setPlannerOpen(true)}>Plan this meal</PrimaryButton>
          </div>
        </section>

        <section aria-labelledby="all-menu-title" className="page-padding mt-10">
          <h2 id="all-menu-title" className="text-[23px] font-bold tracking-[-0.03em]">All menu</h2>
          <div className="mt-4 flex min-h-12 items-center gap-2 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-4">
            <Search aria-hidden="true" className="shrink-0 text-[var(--text-muted)]" size={18} />
            <label htmlFor="menu-search" className="sr-only">Search all menu items</label>
            <input id="menu-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search dishes or flavors" className="min-h-11 min-w-0 flex-1 bg-transparent outline-none" />
          </div>
          <div className="scrollbar-none -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
            {categories.map((item) => <ChoiceChip key={item} selected={category === item} onClick={() => setCategory(item)} className="shrink-0">{item}</ChoiceChip>)}
          </div>
          {filteredDishes.length ? (
            <div className="mt-4 space-y-3">{filteredDishes.map((dish) => <DishCard key={dish.id} dish={dish} />)}</div>
          ) : (
            <div className="mt-4 rounded-[20px] border border-dashed border-[var(--border-strong)] p-6 text-center"><p className="text-sm font-bold">No menu matches</p><p className="mt-1 text-sm text-[var(--text-secondary)]">Try another category or search term.</p></div>
          )}
        </section>
      </article>

      <button type="button" onClick={() => setAssistantOpen(true)} aria-label="Open AI Assistant" className="floating-action fixed z-30 flex size-14 items-center justify-center rounded-full border-4 border-[var(--surface)] bg-[var(--primary)] text-white shadow-[0_10px_24px_rgba(33,94,64,0.22)]">
        <MessageCircle aria-hidden="true" size={22} /><Sparkles aria-hidden="true" className="absolute right-2 top-2 text-[#f8d5bd]" size={9} />
      </button>
      <MealPlannerSheet open={plannerOpen} onClose={() => setPlannerOpen(false)} />
      <AssistantSheet open={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </MobileShell>
  );
}
