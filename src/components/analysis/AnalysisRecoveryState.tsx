import Link from "next/link";
import { ArrowLeft, ScanLine } from "lucide-react";
import { MobileShell } from "@/components/layout/MobileShell";

interface AnalysisRecoveryStateProps {
  readonly kind: "loading" | "missing" | "dish";
}

const primaryLinkClass =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-4 text-sm font-bold text-white hover:bg-[var(--primary-pressed)]";
const secondaryLinkClass =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--text)] hover:bg-[var(--canvas)]";

export function AnalysisRecoveryState({ kind }: AnalysisRecoveryStateProps) {
  if (kind === "loading") {
    return (
      <MobileShell>
        <div className="page-padding flex min-h-dvh items-center justify-center bg-[var(--surface)]">
          <h1 role="status" aria-live="polite" className="text-lg font-bold">
            Loading menu results…
          </h1>
        </div>
      </MobileShell>
    );
  }

  const dishMissing = kind === "dish";
  return (
    <MobileShell>
      <div className="page-padding flex min-h-dvh items-center bg-[var(--surface)] py-10">
        <section className="w-full rounded-[28px] border border-[var(--border)] bg-[var(--canvas)] p-6 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-[20px] bg-[var(--soft-green)] text-[var(--primary)]">
            <ScanLine aria-hidden="true" size={25} />
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-[-0.03em]">
            {dishMissing ? "Dish not found" : "No menu results yet"}
          </h1>
          <p className="mx-auto mt-2 max-w-[30ch] text-sm leading-6 text-[var(--text-secondary)]">
            {dishMissing
              ? "This dish is not available in the current menu analysis."
              : "Scan or upload menu images to see what to order."}
          </p>
          {dishMissing ? (
            <Link href="/analysis" className={`${primaryLinkClass} mt-6`}>
              <ArrowLeft aria-hidden="true" size={17} /> Back to menu results
            </Link>
          ) : (
            <>
              <Link href="/" className={`${primaryLinkClass} mt-6`}>
                <ScanLine aria-hidden="true" size={17} /> Scan a menu
              </Link>
              <Link href="/" className={`${secondaryLinkClass} mt-2`}>
                <ArrowLeft aria-hidden="true" size={17} /> Back home
              </Link>
            </>
          )}
        </section>
      </div>
    </MobileShell>
  );
}
