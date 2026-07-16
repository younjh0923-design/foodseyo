"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  MapPin,
  Phone,
  ScanLine,
  UtensilsCrossed,
} from "lucide-react";
import { useMemo } from "react";
import { AnalysisRecoveryState } from "@/components/analysis/AnalysisRecoveryState";
import { useCurrentAnalysisSession } from "@/components/analysis/useCurrentAnalysisSession";
import { PrimaryButton } from "@/components/common/Controls";
import { PageHeader } from "@/components/common/PageHeader";
import { useImageIntake } from "@/components/intake/ImageIntakeProvider";
import { MobileShell } from "@/components/layout/MobileShell";
import { createLiveAnalysisOverview } from "@/lib/live-analysis-results";

export function LiveAnalysisOverviewClient() {
  const router = useRouter();
  const { clearPendingFiles } = useImageIntake();
  const { state, clearCurrentAnalysis } = useCurrentAnalysisSession();
  const analysis = state.status === "success" ? state.analysis : null;
  const overview = useMemo(
    () => (analysis ? createLiveAnalysisOverview(analysis) : null),
    [analysis],
  );

  if (state.status === "loading") return <AnalysisRecoveryState kind="loading" />;
  if (!overview) return <AnalysisRecoveryState kind="missing" />;

  const scanAnotherMenu = () => {
    clearCurrentAnalysis();
    clearPendingFiles();
    router.push("/");
  };

  return (
    <MobileShell>
      <div className="min-h-dvh bg-[var(--surface)]">
        <PageHeader
          title={overview.restaurantName}
          description={overview.restaurantSummary ?? overview.restaurantMatchLabel}
          backHref="/"
          backLabel="Back home"
        />

        <main className="page-padding pb-10">
          <section aria-label="Analysis summary" className="rounded-[24px] border border-[var(--border)] bg-[var(--canvas)] p-4">
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full bg-[var(--soft-green)] px-3 py-2 text-[var(--primary)]">
                {overview.restaurantMatchLabel}
              </span>
              <span className="rounded-full bg-[var(--surface)] px-3 py-2">
                {overview.dishCountLabel}
              </span>
            </div>
            <p className="mt-3 flex items-center gap-2 text-sm font-bold">
              {overview.completenessLabel === "Menu details extracted" ? (
                <CheckCircle2 aria-hidden="true" size={17} className="text-[var(--primary)]" />
              ) : (
                <AlertTriangle aria-hidden="true" size={17} className="text-[var(--accent)]" />
              )}
              {overview.completenessLabel}
            </p>
            {overview.cuisineLabels.length ? (
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {overview.cuisineLabels.join(" · ")}
              </p>
            ) : null}
            {overview.address ? (
              <p className="mt-3 flex items-start gap-2 text-sm leading-5 text-[var(--text-secondary)]">
                <MapPin aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
                {overview.address}
              </p>
            ) : null}
            {overview.phone ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <Phone aria-hidden="true" size={16} /> {overview.phone}
              </p>
            ) : null}
            {overview.website ? (
              <a
                href={overview.website}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-[var(--primary)] underline underline-offset-4"
              >
                Restaurant website
              </a>
            ) : null}
          </section>

          {overview.limitations.length ? (
            <section aria-labelledby="limitations-title" className="mt-4 rounded-[22px] border border-amber-200 bg-amber-50 p-4">
              <h2 id="limitations-title" className="flex items-center gap-2 text-sm font-bold">
                <AlertTriangle aria-hidden="true" size={17} /> What to keep in mind
              </h2>
              <ul className="mt-2 space-y-2 text-sm leading-5 text-[var(--text-secondary)]">
                {overview.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {overview.orderingGuidance ? (
            <section aria-labelledby="ordering-title" className="mt-7">
              <h2 id="ordering-title" className="text-xl font-bold">Ordering guidance</h2>
              {overview.orderingGuidance.goal ? (
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  {overview.orderingGuidance.goal}
                </p>
              ) : null}
              <div className="mt-3 space-y-3">
                {overview.orderingGuidance.recommendations.map((recommendation) => (
                  <article key={recommendation.id} className="rounded-[20px] bg-[var(--canvas)] p-4">
                    <h3 className="font-bold">
                      {recommendation.quantity} × {recommendation.dishNames.join(", ")}
                    </h3>
                    <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">
                      {recommendation.reason}
                    </p>
                  </article>
                ))}
              </div>
              {overview.orderingGuidance.notes.length ? (
                <ul className="mt-3 space-y-2 text-sm leading-5 text-[var(--text-secondary)]">
                  {overview.orderingGuidance.notes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              ) : null}
            </section>
          ) : null}

          <div className="mt-8 space-y-8">
            {overview.categories.map((category, categoryIndex) => (
              <section key={category.id} aria-labelledby={`live-category-${categoryIndex}`}>
                <div className="flex items-center gap-2">
                  <UtensilsCrossed aria-hidden="true" size={18} className="text-[var(--accent)]" />
                  <h2 id={`live-category-${categoryIndex}`} className="text-xl font-bold">
                    {category.label}
                  </h2>
                </div>
                <div className="mt-3 space-y-3">
                  {category.dishes.map((dish) => (
                    <Link
                      key={dish.id}
                      href={dish.href}
                      aria-label={`View details for ${dish.name}`}
                      className="flex min-h-11 items-center gap-3 rounded-[22px] border border-[var(--border)] p-4 transition-colors hover:bg-[var(--canvas)]"
                    >
                      <span className="min-w-0 flex-1">
                        <h3 className="font-bold leading-5">{dish.name}</h3>
                        {dish.originalName ? (
                          <span className="mt-1 block text-xs text-[var(--text-muted)]">{dish.originalName}</span>
                        ) : null}
                        {dish.description ? (
                          <span className="mt-2 line-clamp-2 block text-sm leading-5 text-[var(--text-secondary)]">
                            {dish.description}
                          </span>
                        ) : null}
                        {dish.labels.length ? (
                          <span className="mt-2 flex flex-wrap gap-1.5">
                            {dish.labels.slice(0, 3).map((label) => (
                              <span key={label} className="rounded-full bg-[var(--soft-orange)] px-2.5 py-1 text-[11px] font-semibold text-[#70402d]">
                                {label}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                      <ChevronRight aria-hidden="true" className="shrink-0 text-[var(--text-muted)]" size={19} />
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <PrimaryButton className="mt-9 w-full" onClick={scanAnotherMenu}>
            <ScanLine aria-hidden="true" size={18} /> Scan another menu
          </PrimaryButton>
        </main>
      </div>
    </MobileShell>
  );
}
