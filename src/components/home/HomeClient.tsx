"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Camera,
  ChevronRight,
  Globe2,
  Link2,
  LoaderCircle,
  MapPin,
  Search,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { ActionCard } from "@/components/common/Controls";
import { UploadRestaurantAction } from "@/components/home/UploadRestaurantAction";
import { MobileShell } from "@/components/layout/MobileShell";
import { FoodPassportSheet } from "@/components/passport/FoodPassportSheet";
import { useFoodPassport } from "@/components/passport/PassportProvider";

type AnalyzeState = "idle" | "analyzing" | "error";
const demoPath = "/restaurant/pai-northern-thai-kitchen";

export function HomeClient() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { passport, hydrated } = useFoodPassport();
  const [passportOpen, setPassportOpen] = useState(false);
  const [link, setLink] = useState("");
  const [status, setStatus] = useState<AnalyzeState>("idle");

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const analyzeLink = () => {
    if (!link.trim()) return;
    setStatus("analyzing");
    timerRef.current = setTimeout(() => {
      if (link.toLowerCase().includes("fail")) {
        setStatus("error");
        return;
      }
      router.push(demoPath);
    }, 850);
  };

  const passportSummary = (() => {
    if (!hydrated || !passport.configured) return "Not set";
    const primary = passport.allergies[0]
      ? `${passport.allergies[0]} allergy`
      : passport.diets[0] ?? passport.avoidedIngredients[0];
    const secondary = `${passport.spicePreference[0].toUpperCase()}${passport.spicePreference.slice(1)} spice`;
    return primary ? `${primary} · ${secondary}` : secondary;
  })();

  return (
    <MobileShell>
      <div className="safe-top min-h-dvh px-4 pb-12 sm:px-6">
        <header className="pt-2">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-[var(--primary)] text-white">
              <Globe2 aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[var(--accent)]">Foodseyo</p>
              <p className="mt-0.5 text-xs font-semibold text-[var(--text-secondary)]">Your AI Travel Food Copilot</p>
            </div>
          </div>
          <h1 className="mt-8 text-[36px] font-bold leading-[1.03] tracking-[-0.05em]">
            Understand the menu.
            <br />
            Order with confidence.
          </h1>
          <p className="mt-4 max-w-[34ch] text-[15px] leading-6 text-[var(--text-secondary)]">
            Analyze once. Explore everything instantly.
          </p>
        </header>

        <section aria-labelledby="restaurant-link-title" className="mt-9">
          <h2 id="restaurant-link-title" className="text-base font-bold">Start with a restaurant</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Paste one public restaurant or menu link.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              analyzeLink();
            }}
            className="mt-3 rounded-[22px] border border-[var(--border-strong)] bg-[var(--surface)] p-2"
          >
            <div className="flex items-center gap-2">
              <Link2 aria-hidden="true" className="ml-2 shrink-0 text-[var(--text-muted)]" size={19} />
              <label htmlFor="restaurant-link" className="sr-only">Restaurant link</label>
              <input
                id="restaurant-link"
                type="url"
                inputMode="url"
                value={link}
                onChange={(event) => {
                  setLink(event.target.value);
                  setStatus("idle");
                }}
                placeholder="Paste restaurant link"
                className="min-h-12 min-w-0 flex-1 bg-transparent px-1 outline-none placeholder:text-[var(--text-muted)]"
              />
              <button
                type="submit"
                disabled={!link.trim() || status === "analyzing"}
                aria-label="Analyze restaurant link"
                className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary)] text-white transition-colors hover:bg-[var(--primary-pressed)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]"
              >
                {status === "analyzing" ? (
                  <LoaderCircle className="soft-spin" aria-label="Analyzing" size={20} />
                ) : (
                  <ArrowRight aria-hidden="true" size={20} />
                )}
              </button>
            </div>
          </form>
          <div aria-live="polite">
            {status === "error" ? (
              <div role="alert" className="mt-3 rounded-2xl border border-[#ecc8ba] bg-[var(--soft-orange)] p-4 text-sm">
                <p className="font-bold text-[#963f20]">We couldn’t analyze that link.</p>
                <p className="mt-1 leading-5 text-[var(--text-secondary)]">Check the URL or open the demo restaurant below.</p>
              </div>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="actions-title" className="mt-8">
          <h2 id="actions-title" className="text-base font-bold">Other ways to start</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <UploadRestaurantAction />
            <ActionCard
              href="/menu-scan"
              icon={<Camera aria-hidden="true" size={21} />}
              title="Scan menu"
              description="Capture one or more menu pages"
            />
            <ActionCard
              href="/nearby"
              icon={<MapPin aria-hidden="true" size={21} />}
              title="Nearby restaurants"
              description="Use your location or demo results"
            />
            <ActionCard
              onClick={() => setPassportOpen(true)}
              icon={<ShieldCheck aria-hidden="true" size={21} />}
              title="Food Passport"
              description="Allergies, diet and preferences"
              status={passportSummary}
            />
          </div>
        </section>

        <section aria-labelledby="recent-title" className="mt-9">
          <div className="flex items-center justify-between gap-3">
            <h2 id="recent-title" className="text-base font-bold">Recent</h2>
            <span className="text-xs font-semibold text-[var(--text-muted)]">Demo</span>
          </div>
          <Link
            href={demoPath}
            className="mt-3 flex min-h-[92px] items-center gap-3 rounded-[22px] border border-[var(--border)] bg-[var(--surface)] p-3 transition-colors hover:bg-[var(--canvas)]"
          >
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--soft-orange)] text-[var(--accent)]">
              <Search aria-hidden="true" size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold">PAI Northern Thai Kitchen</span>
              <span className="mt-1 block text-xs text-[var(--text-secondary)]">Toronto · Demo analysis</span>
              <span className="mt-2 block text-xs font-bold text-[var(--primary)]">Open restaurant</span>
            </span>
            <ChevronRight aria-hidden="true" className="shrink-0 text-[var(--text-muted)]" size={19} />
          </Link>
        </section>
      </div>

      <FoodPassportSheet open={passportOpen} onClose={() => setPassportOpen(false)} />
    </MobileShell>
  );
}
