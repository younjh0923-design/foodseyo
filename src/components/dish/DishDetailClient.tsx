"use client";

import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Heart,
  Landmark,
  MessageCircle,
  MinusCircle,
  Share2,
  ShieldAlert,
  Sparkles,
  ThumbsUp,
  UsersRound,
  UtensilsCrossed,
} from "lucide-react";
import { useState } from "react";
import { AssistantSheet } from "@/components/assistant/AssistantSheet";
import { BottomSheet } from "@/components/common/BottomSheet";
import { IconButton, PrimaryButton } from "@/components/common/Controls";
import { PageHeader } from "@/components/common/PageHeader";
import { SafeImage } from "@/components/common/SafeImage";
import { MobileShell } from "@/components/layout/MobileShell";
import type { Dish, EvidenceBadgeKind } from "@/types/domain";

type Tab = "overview" | "review" | "dietary";

const evidenceLabels: Record<EvidenceBadgeKind, string> = {
  official_menu: "Official menu",
  official_website: "Officially confirmed",
  official_social: "Official social source",
  uploaded_menu: "Uploaded menu",
  user_provided_screen: "User-provided evidence",
  public_web: "Public source",
  web_search_result: "Web search result",
  platform_api_sample: "Public source",
  staff_confirmation: "Confirm with staff",
  demo_data: "Demo data",
  general_food_knowledge: "General recipe",
  ai_inference: "AI inference",
  unavailable: "Information unavailable",
};

function SourceBadge({ source, label }: { source: EvidenceBadgeKind; label?: string }) {
  return <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[10px] font-bold text-[var(--text-secondary)]">{label ?? evidenceLabels[source]}</span>;
}

function OverviewTab({ dish }: { dish: Dish }) {
  const facts = [
    { title: "Regional background", text: dish.overview.regionalBackground, icon: Landmark },
    { title: "Cooking method", text: dish.overview.cookingMethod, icon: UtensilsCrossed },
    { title: "Texture & flavor", text: dish.overview.textureAndFlavor, icon: Sparkles },
    { title: "Similar to", text: dish.overview.similarTo, icon: CircleHelp },
    { title: "Portion guidance", text: dish.overview.portionGuidance, icon: UsersRound },
  ];
  return (
    <div id="overview-panel" role="tabpanel" aria-labelledby="overview-tab" className="space-y-8">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">What it is</h2><SourceBadge source="general_food_knowledge" label="General dish knowledge" /></div>
        <p className="mt-3 text-[15px] leading-6 text-[var(--text-secondary)]">{dish.overview.whatItIs}</p>
      </section>

      <section aria-label="Dish facts" className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
        {facts.map(({ title, text, icon: Icon }) => (
          <div key={title} className="py-5">
            <div className="flex items-center gap-2 text-[var(--primary)]"><Icon aria-hidden="true" size={18} /><h2 className="text-sm font-bold text-[var(--text)]">{title}</h2></div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{text}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="text-lg font-bold">Main ingredients</h2>
        <ul className="mt-3 flex flex-wrap gap-2">{dish.overview.mainIngredients.map((ingredient) => <li key={ingredient} className="rounded-full bg-[var(--canvas)] px-3 py-2 text-xs font-semibold">{ingredient}</li>)}</ul>
        <div className="mt-3"><SourceBadge source="official_menu" label="Menu + general recipe" /></div>
      </section>

      <section aria-label="Knowledge and restaurant evidence" className="space-y-3">
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--canvas)] p-5">
          <div className="flex items-center gap-2"><BookOpen aria-hidden="true" className="text-[var(--text-secondary)]" size={18} /><h2 className="text-sm font-bold">General dish knowledge</h2></div>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{dish.overview.generalKnowledge}</p>
          <div className="mt-3"><SourceBadge source="general_food_knowledge" /></div>
        </div>
        <div className="rounded-[22px] border border-[#cfe0d5] bg-[var(--soft-green)] p-5">
          <div className="flex items-center gap-2 text-[var(--primary)]"><CheckCircle2 aria-hidden="true" size={18} /><h2 className="text-sm font-bold">At this restaurant</h2></div>
          <p className="mt-3 text-sm leading-6 text-[#466353]">{dish.overview.atRestaurant ?? "Restaurant-specific preparation details are unavailable."}</p>
          <div className="mt-3 flex flex-wrap gap-2">{dish.overview.atRestaurant ? <><SourceBadge source="official_menu" /><SourceBadge source="demo_data" label="Demo public evidence" /></> : <SourceBadge source="unavailable" />}</div>
        </div>
      </section>
    </div>
  );
}

function ReviewTab({ dish }: { dish: Dish }) {
  const review = dish.reviewConsensus;
  const levelLabel = review.level[0].toUpperCase() + review.level.slice(1);
  return (
    <div id="review-panel" role="tabpanel" aria-labelledby="review-tab" className="space-y-5">
      <div className="rounded-2xl bg-[var(--soft-orange)] px-4 py-3 text-xs font-bold text-[#8c4323]">Demo review evidence · Illustrative, not a live review feed</div>
      {review.level === "insufficient" ? (
        <section className="rounded-[22px] border border-dashed border-[var(--border-strong)] p-6 text-center"><CircleHelp aria-hidden="true" className="mx-auto text-[var(--text-muted)]" size={24} /><h2 className="mt-3 text-sm font-bold">Review evidence is insufficient</h2><p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">No cross-source pattern is shown for this dish.</p></section>
      ) : (
        <>
          <section className="rounded-[22px] border border-[var(--border)] p-5">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-[var(--text-secondary)]">Opinion consistency</p><h2 className="mt-1 text-2xl font-bold text-[var(--primary)]">{levelLabel}</h2></div><span className="flex size-12 items-center justify-center rounded-full bg-[var(--soft-green)] text-[var(--primary)]"><UsersRound aria-hidden="true" size={22} /></span></div>
            <dl className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-[var(--canvas)] p-3"><dt className="text-[11px] text-[var(--text-secondary)]">Source groups</dt><dd className="mt-1 text-xl font-bold">{review.sourceGroupCount}</dd></div><div className="rounded-2xl bg-[var(--canvas)] p-3"><dt className="text-[11px] text-[var(--text-secondary)]">Evidence items</dt><dd className="mt-1 text-xl font-bold">{review.evidenceCount}</dd></div></dl>
            <p className="mt-3 flex items-center gap-2 text-xs text-[var(--text-secondary)]"><Clock3 aria-hidden="true" size={15} />Freshness: {review.freshness}</p>
          </section>
          <section className="border-b border-[var(--border)] pb-5"><div className="flex items-center gap-2 text-[var(--primary)]"><ThumbsUp aria-hidden="true" size={18} /><h2 className="text-base font-bold text-[var(--text)]">Repeated positives</h2></div><ul className="mt-4 space-y-3">{review.positiveThemes.map((theme) => <li key={theme} className="flex gap-2 text-sm leading-5"><CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--primary)]" size={16} />{theme}</li>)}</ul></section>
          <section className="border-b border-[var(--border)] pb-5"><div className="flex items-center gap-2 text-[#9a552f]"><MinusCircle aria-hidden="true" size={18} /><h2 className="text-base font-bold text-[var(--text)]">Repeated negatives</h2></div><ul className="mt-4 space-y-3">{review.negativeThemes.map((theme) => <li key={theme} className="flex gap-2 text-sm leading-5"><MinusCircle aria-hidden="true" className="mt-0.5 shrink-0 text-[#b36b44]" size={16} />{theme}</li>)}</ul></section>
          <section><h2 className="text-base font-bold">Differences across sources</h2><ul className="mt-4 space-y-3">{review.disagreements.map((difference) => <li key={difference} className="flex gap-2 text-sm leading-5 text-[var(--text-secondary)]"><CircleHelp aria-hidden="true" className="mt-0.5 shrink-0" size={16} />{difference}</li>)}</ul></section>
        </>
      )}
      <div className="flex flex-wrap gap-2"><SourceBadge source="official_menu" /><SourceBadge source="public_web" label="Public web source" /><SourceBadge source="demo_data" label="Demo review dataset" /></div>
      <p className="rounded-[20px] border border-[var(--border)] p-4 text-xs leading-5 text-[var(--text-secondary)]">{review.limitation}</p>
    </div>
  );
}

function DietaryTab({ dish, onCreateQuestion }: { dish: Dish; onCreateQuestion: () => void }) {
  return (
    <div id="dietary-panel" role="tabpanel" aria-labelledby="dietary-tab" className="space-y-5">
      {dish.dietary.length ? (
        <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {dish.dietary.map((fact) => (
            <section key={fact.label} className="py-5">
              <p className="text-sm font-bold">{fact.label}</p>
              <p className="mt-1.5 text-sm leading-5">{fact.status}</p>
              <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">Evidence: {fact.evidence}</p>
              <div className="mt-3 flex flex-wrap gap-2"><SourceBadge source={fact.badgeKind} />{fact.action ? <SourceBadge source="staff_confirmation" label={fact.action} /> : null}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-[22px] border border-dashed border-[var(--border-strong)] p-6 text-center"><CircleHelp aria-hidden="true" className="mx-auto text-[var(--text-muted)]" size={24} /><h2 className="mt-3 text-sm font-bold">Dietary information unavailable</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Confirm ingredients and preparation directly with staff.</p></div>
      )}
      <section className="rounded-[22px] bg-[var(--soft-orange)] p-5 text-[#6f3b27]"><div className="flex items-start gap-3"><ShieldAlert aria-hidden="true" className="mt-0.5 shrink-0" size={21} /><div><h2 className="text-sm font-bold">Allergy safety notice</h2><p className="mt-2 text-xs leading-5">Recipes and preparation practices may change. Foodseyo cannot guarantee allergy safety. Confirm ingredients and cross-contact directly with restaurant staff.</p></div></div></section>
      <PrimaryButton className="min-h-12 w-full" onClick={onCreateQuestion}>Create a question for staff</PrimaryButton>
    </div>
  );
}

export function DishDetailClient({ dish }: { dish: Dish }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [favorite, setFavorite] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const share = async () => {
    const shareData = { title: `${dish.name} · Foodseyo`, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(window.location.href);
        setNotice("Dish link copied to clipboard.");
      }
    } catch {
      setNotice("Sharing was canceled or unavailable.");
    }
  };

  const tabs: Array<{ id: Tab; label: string }> = [{ id: "overview", label: "Overview" }, { id: "review", label: "Reviews" }, { id: "dietary", label: "Dietary" }];

  return (
    <MobileShell>
      <article className="min-h-dvh pb-28">
        <PageHeader
          title="Dish"
          compact
          backHref="/restaurant/pai-northern-thai-kitchen"
          backLabel="Back to restaurant"
          action={<div className="flex gap-2"><IconButton label={favorite ? "Remove dish from favorites" : "Add dish to favorites"} aria-pressed={favorite} onClick={() => setFavorite((current) => !current)} className={favorite ? "border-[var(--accent)] bg-[var(--soft-orange)] text-[var(--accent)]" : undefined}><Heart aria-hidden="true" fill={favorite ? "currentColor" : "none"} size={20} /></IconButton><IconButton label="Share dish" onClick={share}><Share2 aria-hidden="true" size={19} /></IconButton></div>}
        />
        <header>
          <div className="relative h-[270px] overflow-hidden bg-[var(--canvas)]"><SafeImage src={dish.imageUrl} alt={`${dish.name} demo reference`} imagePosition={dish.imagePosition} className="h-full w-full object-cover" /><span className="absolute bottom-3 left-4 rounded-full bg-[var(--surface)]/95 px-3 py-1.5 text-[10px] font-bold text-[var(--text-secondary)]">{dish.imageSource}</span></div>
          <div className="page-padding pt-6">
            <div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">Dish detail</p><h1 className="mt-1 text-[32px] font-bold tracking-[-0.04em]">{dish.name}</h1>{dish.localName ? <p className="mt-1 text-sm text-[var(--text-secondary)]">{dish.localName}</p> : null}</div><p className="mt-6 shrink-0 text-lg font-bold">{dish.price === null ? "Price unavailable" : `${dish.currency} ${dish.price}`}</p></div>
            <p className="mt-4 text-[15px] leading-6 text-[var(--text-secondary)]">{dish.shortDescription}</p>
            <div className="mt-4 flex flex-wrap gap-2">{dish.tasteTags.slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-[var(--soft-orange)] px-3 py-1.5 text-xs font-semibold text-[#8c4323]">{tag}</span>)}</div>
          </div>
        </header>

        <div aria-live="polite">{notice ? <div role="status" className="page-padding mt-4"><p className="rounded-2xl bg-[var(--soft-green)] p-3 text-sm text-[var(--primary)]">{notice}</p></div> : null}</div>

        <div className="sticky top-0 z-20 mt-7 border-y border-[var(--border)] bg-[var(--surface)]/95 px-4 py-2 backdrop-blur-sm sm:px-6">
          <div role="tablist" aria-label="Dish information" className="grid grid-cols-3 gap-1 rounded-2xl bg-[var(--canvas)] p-1">
            {tabs.map((item) => (
              <button key={item.id} id={`${item.id}-tab`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`${item.id}-panel`} onClick={() => setTab(item.id)} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-xs ${tab === item.id ? "bg-[var(--surface)] font-extrabold shadow-sm" : "font-semibold text-[var(--text-secondary)]"}`}>{tab === item.id ? <CheckCircle2 aria-hidden="true" size={14} /> : null}{item.label}</button>
            ))}
          </div>
        </div>

        <div className="page-padding py-7">{tab === "overview" ? <OverviewTab dish={dish} /> : null}{tab === "review" ? <ReviewTab dish={dish} /> : null}{tab === "dietary" ? <DietaryTab dish={dish} onCreateQuestion={() => setStaffOpen(true)} /> : null}</div>
      </article>

      <button type="button" onClick={() => setAssistantOpen(true)} aria-label="Open AI Assistant" className="floating-action fixed z-30 flex size-14 items-center justify-center rounded-full border-4 border-[var(--surface)] bg-[var(--primary)] text-white shadow-[0_10px_24px_rgba(33,94,64,0.22)]"><MessageCircle aria-hidden="true" size={22} /><Sparkles aria-hidden="true" className="absolute right-2 top-2 text-[#fbd6b9]" size={9} /></button>

      <BottomSheet open={staffOpen} onClose={() => setStaffOpen(false)} title="Question for staff" description="Show or read this phrase to the restaurant team.">
        <div className="safe-bottom space-y-3 py-5">
          <div className="rounded-[22px] border border-[var(--border)] p-5"><p className="text-xs font-bold uppercase tracking-[0.13em] text-[var(--accent)]">Full question</p><p className="mt-3 text-[15px] leading-6">I have a peanut allergy. Could you confirm whether this dish contains peanuts or may have cross-contact with peanuts?</p></div>
          <div className="rounded-[20px] bg-[var(--canvas)] p-4"><p className="text-xs font-bold text-[var(--text-secondary)]">Short version</p><p className="mt-2 text-sm font-semibold">Peanut allergy — does this contain peanuts or have cross-contact?</p></div>
          <div className="rounded-[20px] bg-[var(--soft-green)] p-4"><p className="text-xs font-bold text-[var(--primary)]">Korean translation</p><p className="mt-2 text-sm leading-6">저는 땅콩 알레르기가 있습니다. 이 음식에 땅콩이 들어가거나 땅콩과 교차 접촉할 가능성이 있는지 확인해 주실 수 있나요?</p></div>
          <div className="flex gap-2 rounded-2xl bg-[var(--soft-orange)] p-4 text-xs leading-5 text-[#70402d]"><AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={16} />This phrase helps you ask. It does not verify ingredients or kitchen practices.</div>
        </div>
      </BottomSheet>
      <AssistantSheet open={assistantOpen} onClose={() => setAssistantOpen(false)} context="dish" />
    </MobileShell>
  );
}
