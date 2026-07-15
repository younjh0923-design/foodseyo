"use client";

import { Camera, Images, LoaderCircle, ScanLine, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BottomSheet } from "@/components/common/BottomSheet";
import { ConfirmationDialog } from "@/components/common/ConfirmationDialog";
import { PrimaryButton, SecondaryButton } from "@/components/common/Controls";
import { PageHeader } from "@/components/common/PageHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import {
  MenuImagePreprocessingError,
  preprocessMenuImages,
  validateMenuImageSelection,
} from "@/lib/menu-image-preprocessing";
import { writeCurrentAnalysis } from "@/lib/storage";
import { MenuAnalysisApiResponseSchema } from "@/services/menu-analysis/menu-analysis-api";
import { MAX_MENU_IMAGE_COUNT } from "@/services/menu-analysis/menu-upload-validation";

interface MenuPage {
  id: string;
  file: File;
  url: string;
}

interface AnalysisSummary {
  status: "complete" | "partial" | "failed";
  restaurantName: string | null;
  dishCount: number;
}

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function MenuScanClient() {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const pagesRef = useRef<MenuPage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const [pages, setPages] = useState<MenuPage[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisSummary, setAnalysisSummary] = useState<AnalysisSummary | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      pagesRef.current.forEach((page) => URL.revokeObjectURL(page.url));
    },
    [],
  );

  const appendFiles = (files: FileList | null) => {
    if (!files?.length || analyzing) return;
    const selected = Array.from(files);
    try {
      validateMenuImageSelection([...pagesRef.current.map((page) => page.file), ...selected]);
    } catch (error) {
      setAnalysisError(
        error instanceof MenuImagePreprocessingError
          ? error.message
          : "The selected menu images could not be added.",
      );
      return;
    }

    const added = selected.map((file) => ({
      id: makeId(),
      file,
      url: URL.createObjectURL(file),
    }));
    setPages((current) => {
      const next = [...current, ...added];
      pagesRef.current = next;
      return next;
    });
    setAnalysisError(null);
    setAnalysisSummary(null);
  };

  const removePage = (id: string) => {
    if (analyzing) return;
    setPages((current) => {
      const removed = current.find((page) => page.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      const next = current.filter((page) => page.id !== id);
      pagesRef.current = next;
      return next;
    });
    setAnalysisError(null);
    setAnalysisSummary(null);
    if (previewId === id) setPreviewId(null);
  };

  const handleBack = () => {
    if (!pages.length) {
      router.push("/");
      return;
    }
    setDiscardOpen(true);
  };

  const discardAndLeave = () => {
    abortRef.current?.abort();
    pagesRef.current.forEach((page) => URL.revokeObjectURL(page.url));
    pagesRef.current = [];
    setPages([]);
    setDiscardOpen(false);
    router.push("/");
  };

  const analyze = async () => {
    if (!pages.length || analyzing) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setAnalyzing(true);
    setAnalysisError(null);
    setAnalysisSummary(null);

    try {
      const preparedImages = await preprocessMenuImages(pages.map((page) => page.file));
      if (controller.signal.aborted) return;

      const formData = new FormData();
      preparedImages.forEach((file) => formData.append("images", file));
      const response = await fetch("/api/analyze/menu-images", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const parsedResponse = MenuAnalysisApiResponseSchema.safeParse(await response.json());
      if (!parsedResponse.success) {
        throw new Error("Menu analysis returned an invalid response.");
      }
      if (!parsedResponse.data.ok) {
        throw new Error(parsedResponse.data.error.message);
      }

      writeCurrentAnalysis(parsedResponse.data.analysis);
      setAnalysisSummary({
        status: parsedResponse.data.analysis.status,
        restaurantName: parsedResponse.data.analysis.payload.restaurant?.name ?? null,
        dishCount: parsedResponse.data.analysis.payload.menu?.dishes.length ?? 0,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      setAnalysisError(
        error instanceof Error
          ? error.message
          : "Something went wrong while analyzing the menu.",
      );
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setAnalyzing(false);
      }
    }
  };

  const preview = pages.find((page) => page.id === previewId) ?? null;
  const previewNumber = preview
    ? pages.findIndex((page) => page.id === preview.id) + 1
    : 0;
  const pageStatus = pages.length === 1 ? "1 page ready" : `${pages.length} pages ready`;

  return (
    <MobileShell>
      <div className="flex min-h-dvh flex-col bg-[var(--surface)]">
        <PageHeader
          title="Scan menu"
          description={`Capture up to ${MAX_MENU_IMAGE_COUNT} pages for one analysis.`}
          onBack={handleBack}
          backLabel="Back to home"
        />

        <main className="page-padding flex-1 pb-8">
          <input
            ref={cameraRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            aria-label="Scan a menu page with the camera"
            className="sr-only"
            onChange={(event) => {
              appendFiles(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            aria-label="Choose menu pages from photos"
            className="sr-only"
            onChange={(event) => {
              appendFiles(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />

          <div aria-live="polite" className="sr-only">
            {pages.length ? pageStatus : "No menu pages yet."}
          </div>

          {!pages.length ? (
            <section className="mt-3 rounded-[28px] border border-dashed border-[var(--border-strong)] bg-[var(--canvas)] px-5 py-10 text-center">
              <span className="mx-auto flex size-16 items-center justify-center rounded-[22px] bg-[var(--soft-green)] text-[var(--primary)]">
                <ScanLine aria-hidden="true" size={29} />
              </span>
              <h2 className="mt-5 text-xl font-bold tracking-[-0.025em]">
                No menu pages yet.
              </h2>
              <p className="mx-auto mt-2 max-w-[28ch] text-sm leading-5 text-[var(--text-secondary)]">
                Start with the first page. You can add more before analyzing.
              </p>
              <PrimaryButton
                className="mt-6 w-full"
                onClick={() => cameraRef.current?.click()}
              >
                <Camera aria-hidden="true" size={18} /> Scan first page
              </PrimaryButton>
              <SecondaryButton
                className="mt-2 w-full"
                onClick={() => galleryRef.current?.click()}
              >
                <Images aria-hidden="true" size={18} /> Choose from photos
              </SecondaryButton>
            </section>
          ) : (
            <section aria-labelledby="ready-pages-title" className="mt-2">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--primary)]">
                    Capture session
                  </p>
                  <h2 id="ready-pages-title" className="mt-1 text-xl font-bold">
                    {pageStatus}
                  </h2>
                </div>
                <p className="text-xs text-[var(--text-muted)]">Tap to preview</p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {pages.map((page, index) => (
                  <article
                    key={page.id}
                    className="relative overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--canvas)]"
                  >
                    <button
                      type="button"
                      aria-label={`Preview menu page ${index + 1}`}
                      onClick={() => setPreviewId(page.id)}
                      className="block w-full text-left"
                    >
                      {/* Browser object URLs require a native image element. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={page.url}
                        alt={`Menu page ${index + 1}`}
                        className="aspect-[4/5] w-full object-cover"
                      />
                      <span className="block px-3 py-3 text-sm font-bold">
                        Page {index + 1}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove menu page ${index + 1}`}
                      disabled={analyzing}
                      onClick={() => removePage(page.id)}
                      className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-full border border-white/60 bg-[var(--surface)]/95 text-[var(--destructive)] shadow-sm disabled:opacity-50"
                    >
                      <Trash2 aria-hidden="true" size={18} />
                    </button>
                  </article>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <SecondaryButton
                  disabled={analyzing || pages.length >= MAX_MENU_IMAGE_COUNT}
                  onClick={() => cameraRef.current?.click()}
                >
                  <Camera aria-hidden="true" size={17} /> Scan another page
                </SecondaryButton>
                <SecondaryButton
                  disabled={analyzing || pages.length >= MAX_MENU_IMAGE_COUNT}
                  onClick={() => galleryRef.current?.click()}
                >
                  <Images aria-hidden="true" size={17} /> Choose from photos
                </SecondaryButton>
              </div>
            </section>
          )}

          {analysisError ? (
            <p
              role="alert"
              className="mt-4 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-[var(--destructive)]"
            >
              {analysisError}
            </p>
          ) : null}

          {analysisSummary ? (
            <section
              aria-live="polite"
              className="mt-4 rounded-[20px] border border-[var(--border)] bg-[var(--soft-green)] px-4 py-4"
            >
              <h2 className="font-bold">Menu analysis complete</h2>
              <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">
                {analysisSummary.restaurantName ?? "Restaurant not confirmed"} ·{" "}
                {analysisSummary.dishCount} dishes · {analysisSummary.status}
              </p>
            </section>
          ) : null}
        </main>

        <footer className="sticky-safe-bottom sticky bottom-0 z-20 border-t border-[var(--border)] bg-[var(--surface)] px-4 pt-3 sm:px-6">
          <PrimaryButton
            className="min-h-12 w-full"
            disabled={!pages.length || analyzing}
            onClick={analyze}
          >
            {analyzing ? (
              <LoaderCircle aria-hidden="true" className="soft-spin size-5" />
            ) : null}
            {analyzing
              ? "Uploading and analyzing your menu…"
              : `Analyze ${pages.length} ${pages.length === 1 ? "page" : "pages"}`}
          </PrimaryButton>
          <p className="mt-2 text-center text-[11px] leading-4 text-[var(--text-muted)]">
            Images are used for this analysis only and are not stored permanently.
          </p>
        </footer>
      </div>

      <BottomSheet
        open={Boolean(preview)}
        onClose={() => setPreviewId(null)}
        title={`Menu page ${previewNumber}`}
        description="Preview only. Your capture session stays unchanged."
      >
        {preview ? (
          <div className="safe-bottom py-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.url}
              alt={`Full preview of menu page ${previewNumber}`}
              className="max-h-[65dvh] w-full rounded-[20px] object-contain"
            />
          </div>
        ) : null}
      </BottomSheet>

      <ConfirmationDialog
        open={discardOpen}
        title="Discard scanned pages?"
        description={`You have ${pages.length} menu ${pages.length === 1 ? "page" : "pages"} ready.`}
        cancelLabel="Keep scanning"
        confirmLabel="Discard"
        destructive
        onCancel={() => setDiscardOpen(false)}
        onConfirm={discardAndLeave}
      />
    </MobileShell>
  );
}
