"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Globe2, Images } from "lucide-react";
import { useImageIntake } from "@/components/intake/ImageIntakeProvider";
import { MobileShell } from "@/components/layout/MobileShell";
import {
  HOME_ENTRY_COPY,
  checkRestaurantLink,
  type RestaurantLinkCheckResult,
} from "@/lib/home-entry";
import {
  SAFE_IMAGE_SELECTION_ERROR_MESSAGE,
  prepareImageIntakeSelection,
} from "@/lib/image-intake";

const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp";

export function HomeClient() {
  const router = useRouter();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { stageFiles, clearPendingFiles } = useImageIntake();
  const [imageError, setImageError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [linkResult, setLinkResult] = useState<RestaurantLinkCheckResult>({
    kind: "empty",
    message: null,
  });

  const handleImageSelection = (input: HTMLInputElement) => {
    const result = prepareImageIntakeSelection(Array.from(input.files ?? []));
    input.value = "";

    if (result.kind === "cancelled") return;
    if (result.kind === "invalid") {
      clearPendingFiles();
      setImageError(result.message);
      return;
    }

    try {
      stageFiles(result.files);
      setImageError(null);
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
          ref={imageInputRef}
          id="menu-image-input"
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          multiple
          hidden
          onChange={(event) => handleImageSelection(event.currentTarget)}
        />

        <section aria-label="Menu image input" className="mt-5">
          <button
            type="button"
            aria-label="Scan or upload a menu"
            onClick={() => {
              setImageError(null);
              imageInputRef.current?.click();
            }}
            className="flex min-h-[88px] w-full items-center gap-4 rounded-[24px] border border-[var(--border-strong)] bg-[var(--surface)] p-4 text-left transition-colors hover:bg-[var(--canvas)] active:bg-[var(--border)]"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary)] text-white">
              <Images aria-hidden="true" size={22} />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-bold">
                {HOME_ENTRY_COPY.imageTitle}
              </span>
              <span className="mt-1 block text-sm leading-5 text-[var(--text-secondary)]">
                {HOME_ENTRY_COPY.imageDescription}
              </span>
            </span>
          </button>
          {imageError ? (
            <p
              role="alert"
              className="mt-3 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-[var(--destructive)]"
            >
              {imageError}
            </p>
          ) : null}
        </section>
      </div>
    </MobileShell>
  );
}
