"use client";

import { Check, ReceiptText, Users } from "lucide-react";
import { useState } from "react";
import { BottomSheet } from "@/components/common/BottomSheet";
import { ChoiceChip, PrimaryButton } from "@/components/common/Controls";
import { demoRestaurant } from "@/data/demoRestaurant";
import { recommendOrder } from "@/lib/recommendation";
import type { MealPreferences, OrderRecommendation } from "@/types/domain";

const initialPreferences: MealPreferences = { partySize: "2", budgetLevel: "$$", goal: "Signature dishes", sharing: "Share dishes" };
const goalOptions = [
  { value: "Signature dishes", label: "Signature" },
  { value: "Local experience", label: "Local" },
  { value: "Best value", label: "Best value" },
  { value: "Try something new", label: "Adventurous" },
] as const;
const sharingOptions = [
  { value: "Share dishes", label: "Share" },
  { value: "Individual meals", label: "Individual" },
] as const;

export function MealPlannerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [preferences, setPreferences] = useState<MealPreferences>(initialPreferences);
  const [recommendation, setRecommendation] = useState<OrderRecommendation | null>(null);
  const update = <Key extends keyof MealPreferences>(key: Key, value: MealPreferences[Key]) => {
    setPreferences((current) => ({ ...current, [key]: value }));
    setRecommendation(null);
  };
  const label = (text: string, selected: boolean) => <>{selected ? <Check aria-hidden="true" className="mr-1 inline size-4" /> : null}{text}</>;

  return (
    <BottomSheet open={open} onClose={onClose} title="Plan this meal" description="Choose a few preferences for a practical demo order." panelClassName="h-[92dvh]">
      <div className="safe-bottom space-y-7 pt-5">
        <fieldset>
          <legend className="mb-3 flex items-center gap-2 text-sm font-bold"><Users aria-hidden="true" size={17} /> Party size</legend>
          <div className="grid grid-cols-4 gap-2">{(["1", "2", "3-4", "5+"] as const).map((value) => <ChoiceChip key={value} selected={preferences.partySize === value} onClick={() => update("partySize", value)}>{label(value === "3-4" ? "3–4" : value, preferences.partySize === value)}</ChoiceChip>)}</div>
        </fieldset>
        <fieldset>
          <legend className="mb-3 text-sm font-bold">Budget</legend>
          <div className="grid grid-cols-3 gap-2">{(["$", "$$", "$$$"] as const).map((value) => <ChoiceChip key={value} selected={preferences.budgetLevel === value} onClick={() => update("budgetLevel", value)}>{label(value, preferences.budgetLevel === value)}</ChoiceChip>)}</div>
        </fieldset>
        <fieldset>
          <legend className="mb-3 text-sm font-bold">Goal</legend>
          <div className="flex flex-wrap gap-2">{goalOptions.map((option) => <ChoiceChip key={option.value} selected={preferences.goal === option.value} onClick={() => update("goal", option.value)}>{label(option.label, preferences.goal === option.value)}</ChoiceChip>)}</div>
        </fieldset>
        <fieldset>
          <legend className="mb-3 text-sm font-bold">Serving style</legend>
          <div className="grid grid-cols-2 gap-2">{sharingOptions.map((option) => <ChoiceChip key={option.value} selected={preferences.sharing === option.value} onClick={() => update("sharing", option.value)}>{label(option.label, preferences.sharing === option.value)}</ChoiceChip>)}</div>
        </fieldset>
        <PrimaryButton className="min-h-12 w-full" onClick={() => setRecommendation(recommendOrder(demoRestaurant, preferences))}>Recommend an order</PrimaryButton>

        {recommendation ? (
          <section aria-live="polite" className="rounded-[22px] border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-[var(--soft-green)] text-[var(--primary)]"><ReceiptText aria-hidden="true" size={20} /></span>
              <div><p className="text-xs font-bold uppercase tracking-[0.13em] text-[var(--accent)]">Demo order</p><h3 className="mt-1 text-base font-bold">Recommended for {preferences.partySize === "3-4" ? "3–4" : preferences.partySize}</h3></div>
            </div>
            <ol className="mt-5 space-y-4">
              {recommendation.items.map((item, index) => {
                const dish = demoRestaurant.dishes.find((candidate) => candidate.id === item.dishId);
                if (!dish) return null;
                return <li key={item.dishId} className="flex gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--soft-orange)] text-xs font-bold text-[var(--accent)]">{index + 1}</span><div><p className="text-sm font-bold">{dish.name} × {item.quantity}</p><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{item.reason}</p></div></li>;
              })}
            </ol>
            <div className="mt-5 flex items-end justify-between border-t border-[var(--border)] pt-4"><span className="text-sm text-[var(--text-secondary)]">Estimated total</span><strong className="text-xl">{recommendation.currency} {recommendation.estimatedTotal}</strong></div>
            <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{recommendation.summary}</p>
          </section>
        ) : null}
      </div>
    </BottomSheet>
  );
}
