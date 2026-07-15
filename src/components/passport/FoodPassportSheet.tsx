"use client";

import { Check, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { BottomSheet } from "@/components/common/BottomSheet";
import { ChoiceChip, PrimaryButton, SecondaryButton } from "@/components/common/Controls";
import { useFoodPassport } from "@/components/passport/PassportProvider";
import type { FoodPassport, PreferredLanguage, SpicePreference } from "@/types/domain";

const allergies = ["Peanuts", "Tree nuts", "Shellfish", "Dairy", "Eggs", "Gluten"];
const diets = ["Vegetarian", "Vegan", "Halal preference", "Gluten avoidance"];
const avoidedIngredients = ["Cilantro", "Coconut", "Pork", "Seafood"];
const spiceLevels: SpicePreference[] = ["mild", "medium", "hot"];
const languages: PreferredLanguage[] = ["English", "Korean"];

interface FoodPassportSheetProps {
  open: boolean;
  onClose: () => void;
}

function toggleItem(list: string[], item: string) {
  return list.includes(item) ? list.filter((value) => value !== item) : [...list, item];
}

export function FoodPassportSheet({ open, onClose }: FoodPassportSheetProps) {
  if (!open) return null;
  return <FoodPassportEditor onClose={onClose} />;
}

function FoodPassportEditor({ onClose }: { onClose: () => void }) {
  const { passport, savePassport, clearPassport } = useFoodPassport();
  const [draft, setDraft] = useState<FoodPassport>(passport);

  const chipContent = (label: string, selected: boolean) => (
    <>{selected ? <Check className="mr-1.5 inline size-4" aria-hidden="true" /> : null}{label}</>
  );

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Food Passport"
      description="Set cautious personalization for restaurant recommendations."
      panelClassName="h-[92dvh]"
    >
      <div className="pt-5">
        <div className="flex items-start gap-3 rounded-2xl bg-[var(--soft-green)] p-4 text-sm text-[var(--primary)]">
          <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0" size={19} />
          <p className="leading-5">Saved only on this device. Always confirm allergies with restaurant staff.</p>
        </div>

        <div className="mt-7 space-y-7 pb-4">
          <fieldset>
            <legend className="mb-3 text-sm font-bold">Allergies</legend>
            <div className="flex flex-wrap gap-2">
              {allergies.map((item) => {
                const selected = draft.allergies.includes(item);
                return <ChoiceChip key={item} selected={selected} onClick={() => setDraft({ ...draft, allergies: toggleItem(draft.allergies, item) })}>{chipContent(item, selected)}</ChoiceChip>;
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-3 text-sm font-bold">Diet</legend>
            <div className="flex flex-wrap gap-2">
              {diets.map((item) => {
                const selected = draft.diets.includes(item);
                return <ChoiceChip key={item} selected={selected} onClick={() => setDraft({ ...draft, diets: toggleItem(draft.diets, item) })}>{chipContent(item, selected)}</ChoiceChip>;
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-3 text-sm font-bold">Avoided ingredients</legend>
            <div className="flex flex-wrap gap-2">
              {avoidedIngredients.map((item) => {
                const selected = draft.avoidedIngredients.includes(item);
                return <ChoiceChip key={item} selected={selected} onClick={() => setDraft({ ...draft, avoidedIngredients: toggleItem(draft.avoidedIngredients, item) })}>{chipContent(item, selected)}</ChoiceChip>;
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-3 text-sm font-bold">Default spice preference</legend>
            <div className="grid grid-cols-3 gap-2">
              {spiceLevels.map((item) => {
                const selected = draft.spicePreference === item;
                const label = item[0].toUpperCase() + item.slice(1);
                return <ChoiceChip key={item} selected={selected} onClick={() => setDraft({ ...draft, spicePreference: item })}>{chipContent(label, selected)}</ChoiceChip>;
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-3 text-sm font-bold">Preferred language</legend>
            <div className="grid grid-cols-2 gap-2">
              {languages.map((item) => {
                const selected = draft.preferredLanguage === item;
                return <ChoiceChip key={item} selected={selected} onClick={() => setDraft({ ...draft, preferredLanguage: item })}>{chipContent(item, selected)}</ChoiceChip>;
              })}
            </div>
          </fieldset>
        </div>
      </div>

      <div className="sticky-safe-bottom sticky bottom-0 -mx-5 mt-4 border-t border-[var(--border)] bg-[var(--surface)] px-5 pt-3">
        <PrimaryButton
          className="min-h-12 w-full"
          onClick={() => {
            savePassport({ ...draft, configured: true });
            onClose();
          }}
        >
          Save passport
        </PrimaryButton>
        <SecondaryButton
          className="mt-2 w-full"
          onClick={() => {
            clearPassport();
            onClose();
          }}
        >
          Clear passport
        </SecondaryButton>
      </div>
    </BottomSheet>
  );
}
