"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { AnalysisRecoveryState } from "@/components/analysis/AnalysisRecoveryState";
import { useCurrentAnalysisSession } from "@/components/analysis/useCurrentAnalysisSession";
import { SecondaryButton } from "@/components/common/Controls";
import { PageHeader } from "@/components/common/PageHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import { FoodPassportSheet } from "@/components/passport/FoodPassportSheet";
import { useFoodPassport } from "@/components/passport/PassportProvider";
import {
  compareDishWithPassport,
  createLiveDishDetail,
} from "@/lib/live-analysis-results";

export function LiveDishDetailClient({ dishId }: { readonly dishId: string }) {
  const { state } = useCurrentAnalysisSession();
  const { passport, hydrated: passportHydrated } = useFoodPassport();
  const [passportOpen, setPassportOpen] = useState(false);
  const analysis = state.status === "success" ? state.analysis : null;
  const detail = useMemo(
    () => (analysis ? createLiveDishDetail(analysis, dishId) : null),
    [analysis, dishId],
  );
  const comparisons = useMemo(
    () => (detail && passportHydrated ? compareDishWithPassport(detail.canonicalDish, passport) : []),
    [detail, passport, passportHydrated],
  );

  if (state.status === "loading") return <AnalysisRecoveryState kind="loading" />;
  if (state.status !== "success") return <AnalysisRecoveryState kind="missing" />;
  if (!detail) return <AnalysisRecoveryState kind="dish" />;

  return (
    <MobileShell>
      <div className="min-h-dvh bg-[var(--surface)]">
        <PageHeader
          title={detail.name}
          description={detail.originalName ?? detail.categoryLabel ?? undefined}
          backHref="/analysis"
          backLabel="Back to menu results"
        />
        <main className="page-padding space-y-8 pb-10">
          {detail.pronunciation ? (
            <p className="text-sm text-[var(--text-secondary)]">Pronunciation: {detail.pronunciation}</p>
          ) : null}

          {detail.description ? (
            <section aria-labelledby="what-it-is-title">
              <h2 id="what-it-is-title" className="text-xl font-bold">What it is</h2>
              <p className="mt-3 text-[15px] leading-6 text-[var(--text-secondary)]">
                {detail.description}
              </p>
            </section>
          ) : null}

          {detail.expectations.length ? (
            <section aria-labelledby="expect-title">
              <h2 id="expect-title" className="text-xl font-bold">What to expect</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {detail.expectations.map((expectation) => (
                  <li key={expectation} className="rounded-full bg-[var(--soft-orange)] px-3 py-2 text-xs font-semibold text-[#70402d]">
                    {expectation}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {detail.ingredients.length ? (
            <section aria-labelledby="ingredients-title">
              <h2 id="ingredients-title" className="text-xl font-bold">{detail.ingredientsTitle}</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {detail.ingredients.map((ingredient) => (
                  <li key={ingredient} className="rounded-full bg-[var(--canvas)] px-3 py-2 text-xs font-semibold">
                    {ingredient}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {detail.dietaryNotes.length ? (
            <section aria-labelledby="dietary-title">
              <h2 id="dietary-title" className="text-xl font-bold">Dietary and allergy notes</h2>
              <div className="mt-3 divide-y divide-[var(--border)] border-y border-[var(--border)]">
                {detail.dietaryNotes.map((note) => (
                  <article key={`${note.label}-${note.status}`} className="py-4">
                    <h3 className="text-sm font-bold">{note.label}</h3>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">{note.status}</p>
                    {note.detail ? <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{note.detail}</p> : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section aria-labelledby="passport-compare-title" className="rounded-[22px] border border-[var(--border)] p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck aria-hidden="true" size={19} className="text-[var(--primary)]" />
              <h2 id="passport-compare-title" className="font-bold">Food Passport</h2>
            </div>
            {!passportHydrated || !passport.configured ? (
              <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">
                Food Passport is not set. Add preferences to compare this dish.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {comparisons.map((comparison, index) => (
                  <li key={`${comparison.label}-${index}`} className="flex gap-2 text-sm leading-5">
                    {comparison.kind === "match" ? (
                      <CheckCircle2 aria-hidden="true" size={17} className="mt-0.5 shrink-0 text-[var(--primary)]" />
                    ) : comparison.kind === "caution" ? (
                      <AlertTriangle aria-hidden="true" size={17} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                    ) : (
                      <CircleHelp aria-hidden="true" size={17} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
                    )}
                    <span><strong>{comparison.label}:</strong> {comparison.message}</span>
                  </li>
                ))}
              </ul>
            )}
            <SecondaryButton className="mt-4 w-full" onClick={() => setPassportOpen(true)}>
              {passportHydrated && passport.configured ? "Edit Food Passport" : "Set Food Passport"}
            </SecondaryButton>
          </section>

          {detail.orderingNotes.length ? (
            <section aria-labelledby="ordering-note-title">
              <h2 id="ordering-note-title" className="text-xl font-bold">Ordering note</h2>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
                {detail.orderingNotes.map((note) => <li key={note}>{note}</li>)}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="safety-title" className="rounded-[22px] border border-amber-200 bg-amber-50 p-4">
            <h2 id="safety-title" className="flex items-center gap-2 text-sm font-bold">
              <AlertTriangle aria-hidden="true" size={17} /> Confirm with the restaurant
            </h2>
            <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">
              {detail.allergySafetyNotice}
            </p>
          </section>

          {detail.uncertaintyNotes.length ? (
            <section aria-labelledby="uncertainty-title">
              <h2 id="uncertainty-title" className="text-xl font-bold">Uncertainty and evidence notes</h2>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
                {detail.uncertaintyNotes.map((note) => <li key={note}>{note}</li>)}
              </ul>
            </section>
          ) : null}
        </main>
      </div>
      <FoodPassportSheet open={passportOpen} onClose={() => setPassportOpen(false)} />
    </MobileShell>
  );
}
