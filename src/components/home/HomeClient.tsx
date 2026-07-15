"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Camera, Globe2, Images, ShieldCheck } from "lucide-react";
import { BottomSheet } from "@/components/common/BottomSheet";
import { ActionCard } from "@/components/common/Controls";
import { useImageIntake } from "@/components/intake/ImageIntakeProvider";
import { MobileShell } from "@/components/layout/MobileShell";
import { FoodPassportSheet } from "@/components/passport/FoodPassportSheet";
import { useFoodPassport } from "@/components/passport/PassportProvider";
import {
  HOME_ENTRY_COPY,
  checkRestaurantLink,
  type RestaurantLinkCheckResult,
} from "@/lib/home-entry";
import {
  SAFE_IMAGE_SELECTION_ERROR_MESSAGE,
  prepareImageIntakeSelection,
  type ImageIntakeSource,
} from "@/lib/image-intake";

const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp";

export function HomeClient() {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const { stageFiles, clearPendingFiles } = useImageIntake();
  const { passport, hydrated } = useFoodPassport();
  const [passportOpen, setPassportOpen] = useState(false);
  const [imageSheetOpen, setImageSheetOpen] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [linkResult, setLinkResult] = useState<RestaurantLinkCheckResult>({
    kind: "empty",
    message: null,
  });

  const passportSummary = (() => {
    if (!hydrated || !passport.configured) return "Not set";
    const primary = passport.allergies[0]
      ? `${passport.allergies[0]} allergy`
      : passport.diets[0] ?? passport.avoidedIngredients[0];
    const secondary = `${passport.spicePreference[0].toUpperCase()}${passport.spicePreference.slice(1)} spice`;
    return primary ? `${primary} · ${secondary}` : secondary;
  })();

  const handleImageSelection = (
    input: HTMLInputElement,
    source: ImageIntakeSource,
  ) => {
    const result = prepareImageIntakeSelection(Array.from(input.files ?? []), source);
    input.value = "";

    if (result.kind === "cancelled") return;
    if (result.kind === "invalid") {
      clearPendingFiles();
      setImageError(result.message);
      return;
    }

    try {
      stageFiles(result.files, result.source);
      setImageError(null);
      setImageSheetOpen(false);
      router.push("/menu-scan");
    } catch {
      clearPendingFiles();
      setImageError(SAFE_IMAGE_SELECTION_ERROR_MESSAGE);
    }
  };

  return (
    <MobileShell>
      <div className="safe-top min-h-dvh px-4 pb-12 sm:px-6">
        <header className="pt-2">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary)] text-white">
              <Globe2 aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[var(--accent)]">
                {HOME_ENTRY_COPY.brand}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-[var(--text-secondary)]">
                {HOME_ENTRY_COPY.brandDescription}
              </p>
            </div>
          </div>

          <h1 className="mt-10 text-[clamp(2.2rem,11vw,3.1rem)] font-bold leading-[1.02] tracking-[-0.055em]">
            {HOME_ENTRY_COPY.heading}
          </h1>
          <p className="mt-4 text-[15px] leading-6 text-[var(--text-secondary)]">
            {HOME_ENTRY_COPY.description}
          </p>
        </header>

        <section aria-label="Restaurant or menu link" className="mt-8">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setLinkResult(checkRestaurantLink(link));
            }}
            className="rounded-[22px] border border-[var(--border-strong)] bg-[var(--surface)] p-2"
          >
            <div className="flex items-center gap-2">
              <label htmlFor="restaurant-link" className="sr-only">
                Restaurant or menu link
              </label>
              <input
                id="restaurant-link"
                type="text"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={link}
                aria-describedby={linkResult.message ? "restaurant-link-message" : undefined}
                onChange={(event) => {
                  setLink(event.target.value);
                  setLinkResult({ kind: "empty", message: null });
                }}
                placeholder={HOME_ENTRY_COPY.linkPlaceholder}
                className="min-h-12 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-[var(--text-muted)]"
              />
              <button
                type="submit"
                disabled={!link.trim()}
                aria-label="Check restaurant link"
                className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary)] text-white transition-colors hover:bg-[var(--primary-pressed)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]"
              >
                <ArrowRight aria-hidden="true" size={20} />
              </button>
            </div>
          </form>

          {linkResult.message ? (
            <p
              id="restaurant-link-message"
              role={linkResult.kind === "invalid" ? "alert" : "status"}
              className={`mt-3 rounded-[18px] border px-4 py-3 text-sm leading-5 ${
                linkResult.kind === "invalid"
                  ? "border-red-200 bg-red-50 text-[var(--destructive)]"
                  : "border-[var(--border)] bg-[var(--soft-green)] text-[var(--text-secondary)]"
              }`}
            >
              {linkResult.message}
            </p>
          ) : null}
        </section>

        <input
          ref={cameraRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          capture="environment"
          aria-label="Take a restaurant or menu photo"
          className="sr-only"
          onChange={(event) => handleImageSelection(event.currentTarget, "camera")}
        />
        <input
          ref={galleryRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          multiple
          aria-label="Choose restaurant or menu images from photos"
          className="sr-only"
          onChange={(event) => handleImageSelection(event.currentTarget, "gallery")}
        />

        <section aria-label="Foodseyo actions" className="mt-5 grid grid-cols-2 items-stretch gap-3">
          <ActionCard
            onClick={() => setPassportOpen(true)}
            icon={<ShieldCheck aria-hidden="true" size={21} />}
            title={HOME_ENTRY_COPY.foodPassportTitle}
            description={HOME_ENTRY_COPY.foodPassportDescription}
            status={passportSummary}
          />
          <ActionCard
            onClick={() => {
              setImageError(null);
              setImageSheetOpen(true);
            }}
            icon={<Images aria-hidden="true" size={21} />}
            title={HOME_ENTRY_COPY.imageTitle}
            description={HOME_ENTRY_COPY.imageDescription}
          />
        </section>
      </div>

      <BottomSheet
        open={imageSheetOpen}
        onClose={() => {
          setImageSheetOpen(false);
          setImageError(null);
        }}
        title="Add an image"
        description="Choose how to add restaurant images."
      >
        <div className="safe-bottom space-y-3 py-5">
          <button
            type="button"
            onClick={() => {
              setImageError(null);
              cameraRef.current?.click();
            }}
            className="flex min-h-16 w-full items-center gap-3 rounded-[20px] border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-left font-bold transition-colors hover:bg-[var(--canvas)] active:bg-[var(--border)]"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--soft-green)] text-[var(--primary)]">
              <Camera aria-hidden="true" size={20} />
            </span>
            Take a photo
          </button>
          <button
            type="button"
            onClick={() => {
              setImageError(null);
              galleryRef.current?.click();
            }}
            className="flex min-h-16 w-full items-center gap-3 rounded-[20px] border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-left font-bold transition-colors hover:bg-[var(--canvas)] active:bg-[var(--border)]"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--soft-green)] text-[var(--primary)]">
              <Images aria-hidden="true" size={20} />
            </span>
            Choose from photos
          </button>
          {imageError ? (
            <p
              role="alert"
              className="rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-[var(--destructive)]"
            >
              {imageError}
            </p>
          ) : null}
        </div>
      </BottomSheet>

      <FoodPassportSheet open={passportOpen} onClose={() => setPassportOpen(false)} />
    </MobileShell>
  );
}
