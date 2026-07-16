"use client";

import { Camera, Images, LoaderCircle, ScanLine, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { BottomSheet } from "@/components/common/BottomSheet";
import { ConfirmationDialog } from "@/components/common/ConfirmationDialog";
import { PrimaryButton, SecondaryButton } from "@/components/common/Controls";
import { useImageIntake } from "@/components/intake/ImageIntakeProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import {
  getSafeMenuAnalysisFailure,
  parseMenuAnalysisResponse,
} from "@/lib/menu-analysis-client";
import { preprocessMenuImages } from "@/lib/menu-image-preprocessing";
import { prepareMenuScanAppend } from "@/lib/image-intake";
import {
  INITIAL_MENU_ANALYSIS_UI_STATE,
  MENU_ANALYSIS_LOADING_HELPER,
  MENU_ANALYSIS_LOADING_LABEL,
  MENU_ANALYSIS_NAVIGATION_FALLBACK_MS,
  MENU_ANALYSIS_RESULTS_PATH,
  MENU_ANALYSIS_TIMEOUT_MESSAGE,
  createMenuAnalysisAttemptGate,
  createMenuAnalysisSuccessSummary,
  isMenuAnalysisActive,
  menuAnalysisUiReducer,
  startMenuAnalysisWatchdog,
} from "@/lib/menu-analysis-ui-state";
import {
  readCurrentAnalysisResult,
  tryWriteCurrentAnalysis,
} from "@/lib/storage";
import { MAX_MENU_IMAGE_COUNT } from "@/services/menu-analysis/menu-upload-validation";

interface MenuPage {
  id: string;
  file: File;
  url: string;
}

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function MenuScanClient() {
  const router = useRouter();
  const { consumePendingFiles } = useImageIntake();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const pagesRef = useRef<MenuPage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const watchdogCancelRef = useRef<(() => void) | null>(null);
  const navigationFallbackRef = useRef<number | null>(null);
  const feedbackRef = useRef<HTMLElement>(null);
  const attemptGateRef = useRef(createMenuAnalysisAttemptGate());
  const [pages, setPages] = useState<MenuPage[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [analysisUi, dispatchAnalysisUi] = useReducer(
    menuAnalysisUiReducer,
    INITIAL_MENU_ANALYSIS_UI_STATE,
  );
  const analyzing = isMenuAnalysisActive(analysisUi);

  useEffect(
    () => () => {
      watchdogCancelRef.current?.();
      watchdogCancelRef.current = null;
      if (navigationFallbackRef.current !== null) {
        window.clearTimeout(navigationFallbackRef.current);
        navigationFallbackRef.current = null;
      }
      abortRef.current?.abort();
      const activeAttemptId = attemptGateRef.current.current();
      if (activeAttemptId !== null) {
        attemptGateRef.current.release(activeAttemptId);
      }
      pagesRef.current.forEach((page) => URL.revokeObjectURL(page.url));
    },
    [],
  );

  const appendFiles = useCallback((files: readonly File[]) => {
    if (!files.length || attemptGateRef.current.current() !== null) return;
    const result = prepareMenuScanAppend(
      pagesRef.current.map((page) => page.file),
      files,
    );
    if (result.kind === "cancelled") return;
    if (result.kind === "invalid") {
      dispatchAnalysisUi({ type: "INPUT_REJECTED", message: result.message });
      return;
    }

    const added = result.files.map((file) => ({
      id: makeId(),
      file,
      url: URL.createObjectURL(file),
    }));
    setPages((current) => {
      const next = [...current, ...added];
      pagesRef.current = next;
      return next;
    });
    dispatchAnalysisUi({ type: "IMAGES_CHANGED" });
  }, []);

  useEffect(() => {
    const handoffTimer = window.setTimeout(() => {
      const pending = consumePendingFiles();
      if (pending) appendFiles(pending.files);
    }, 0);
    return () => window.clearTimeout(handoffTimer);
  }, [appendFiles, consumePendingFiles]);

  const removePage = (id: string) => {
    if (attemptGateRef.current.current() !== null) return;
    setPages((current) => {
      const removed = current.find((page) => page.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      const next = current.filter((page) => page.id !== id);
      pagesRef.current = next;
      return next;
    });
    dispatchAnalysisUi({ type: "IMAGES_CHANGED" });
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
    const activeAttemptId = attemptGateRef.current.current();
    if (activeAttemptId !== null) {
      attemptGateRef.current.release(activeAttemptId);
    }
    pagesRef.current.forEach((page) => URL.revokeObjectURL(page.url));
    pagesRef.current = [];
    setPages([]);
    setDiscardOpen(false);
    router.push("/");
  };

  const analyze = async () => {
    if (!pagesRef.current.length) return;
    const attemptId = attemptGateRef.current.begin();
    if (attemptId === null) return;

    const selectedFiles = pagesRef.current.map((page) => page.file);
    const controller = new AbortController();
    abortRef.current = controller;
    dispatchAnalysisUi({ type: "ATTEMPT_STARTED", attemptId });
    let timedOut = false;
    let navigationStarted = false;
    let cancelWatchdog = () => {};

    try {
      const preparedImages = await preprocessMenuImages(selectedFiles);
      if (controller.signal.aborted) {
        if (attemptGateRef.current.isCurrent(attemptId)) {
          dispatchAnalysisUi({ type: "ABORTED", attemptId });
        }
        return;
      }

      const formData = new FormData();
      preparedImages.forEach((file) => formData.append("images", file));
      dispatchAnalysisUi({
        type: "REQUEST_STARTED",
        attemptId,
        startedAt: Date.now(),
      });
      cancelWatchdog = startMenuAnalysisWatchdog(() => {
        if (!attemptGateRef.current.isCurrent(attemptId)) return;
        timedOut = true;
        watchdogCancelRef.current = null;
        controller.abort();
        attemptGateRef.current.release(attemptId);
        if (abortRef.current === controller) abortRef.current = null;
        dispatchAnalysisUi({
          type: "FAILED",
          attemptId,
          message: MENU_ANALYSIS_TIMEOUT_MESSAGE,
          errorKind: "timeout",
        });
      });
      watchdogCancelRef.current = cancelWatchdog;
      const response = await fetch("/api/analyze/menu-images", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const analysis = await parseMenuAnalysisResponse(response);
      if (!attemptGateRef.current.isCurrent(attemptId)) return;

      const summary = createMenuAnalysisSuccessSummary(analysis);
      const storedForNextScreen = tryWriteCurrentAnalysis(analysis);
      if (!storedForNextScreen) {
        dispatchAnalysisUi({
          type: "STORAGE_FAILED",
          attemptId,
          summary,
        });
        return;
      }

      dispatchAnalysisUi({ type: "PERSISTED", attemptId, summary });
      navigationStarted = true;
      let hardNavigationAttempted = false;
      const showNavigationFallback = () => {
        if (!attemptGateRef.current.isCurrent(attemptId)) return;
        attemptGateRef.current.release(attemptId);
        dispatchAnalysisUi({ type: "NAVIGATION_FAILED", attemptId });
      };
      const tryHardNavigationOnce = () => {
        if (hardNavigationAttempted) return;
        hardNavigationAttempted = true;
        if (readCurrentAnalysisResult().status !== "success") {
          showNavigationFallback();
          return;
        }
        try {
          window.location.replace(MENU_ANALYSIS_RESULTS_PATH);
        } catch {
          showNavigationFallback();
        }
      };

      try {
        router.replace(MENU_ANALYSIS_RESULTS_PATH);
        navigationFallbackRef.current = window.setTimeout(() => {
          navigationFallbackRef.current = null;
          if (!attemptGateRef.current.isCurrent(attemptId)) return;
          if (window.location.pathname !== "/menu-scan") return;
          tryHardNavigationOnce();
        }, MENU_ANALYSIS_NAVIGATION_FALLBACK_MS);
      } catch {
        tryHardNavigationOnce();
      }
    } catch (error) {
      if (!attemptGateRef.current.isCurrent(attemptId)) return;
      const failure = getSafeMenuAnalysisFailure(error, {
        signalAborted: controller.signal.aborted,
        timedOut,
      });
      if (failure) {
        dispatchAnalysisUi({ type: "FAILED", attemptId, ...failure });
      } else {
        dispatchAnalysisUi({ type: "ABORTED", attemptId });
      }
    } finally {
      cancelWatchdog();
      if (watchdogCancelRef.current === cancelWatchdog) {
        watchdogCancelRef.current = null;
      }
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      if (!navigationStarted) {
        attemptGateRef.current.release(attemptId);
      }
      dispatchAnalysisUi({ type: "FINALIZED", attemptId });
    }
  };

  const feedbackKey =
    analysisUi.phase === "success" || analysisUi.phase === "error"
      ? `${analysisUi.phase}:${analysisUi.attemptId ?? "input"}`
      : null;

  useEffect(() => {
    if (!feedbackKey) return;
    const frame = window.requestAnimationFrame(() => {
      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      feedbackRef.current?.scrollIntoView({
        block: "nearest",
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [feedbackKey]);

  const preview = pages.find((page) => page.id === previewId) ?? null;
  const previewNumber = preview
    ? pages.findIndex((page) => page.id === preview.id) + 1
    : 0;
  const pageStatus = pages.length === 1 ? "1 image ready" : `${pages.length} images ready`;
  const openStoredResults = () => {
    if (readCurrentAnalysisResult().status !== "success") return;
    router.replace(MENU_ANALYSIS_RESULTS_PATH);
  };

  return (
    <MobileShell>
      <div className="flex min-h-dvh flex-col bg-[var(--surface)]">
        <PageHeader
          title="Review images"
          description={`Add up to ${MAX_MENU_IMAGE_COUNT} images. Menu text is required for the current analysis.`}
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
              appendFiles(Array.from(event.currentTarget.files ?? []));
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
              appendFiles(Array.from(event.currentTarget.files ?? []));
              event.currentTarget.value = "";
            }}
          />

          <div aria-live="polite" className="sr-only">
            {pages.length ? pageStatus : "No images yet."}
          </div>
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {analyzing ? MENU_ANALYSIS_LOADING_LABEL : ""}
          </div>

          {!pages.length ? (
            <section className="mt-3 rounded-[28px] border border-dashed border-[var(--border-strong)] bg-[var(--canvas)] px-5 py-10 text-center">
              <span className="mx-auto flex size-16 items-center justify-center rounded-[22px] bg-[var(--soft-green)] text-[var(--primary)]">
                <ScanLine aria-hidden="true" size={29} />
              </span>
              <h2 className="mt-5 text-xl font-bold tracking-[-0.025em]">
                No images yet.
              </h2>
              <p className="mx-auto mt-2 max-w-[28ch] text-sm leading-5 text-[var(--text-secondary)]">
                Take a photo or choose images to begin.
              </p>
              <PrimaryButton
                className="mt-6 w-full"
                onClick={() => cameraRef.current?.click()}
              >
                <Camera aria-hidden="true" size={18} /> Take a photo
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
                    Images ready
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
                      aria-label={`Preview image ${index + 1}`}
                      onClick={() => setPreviewId(page.id)}
                      className="block w-full text-left"
                    >
                      {/* Browser object URLs require a native image element. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={page.url}
                        alt={`Selected image ${index + 1}`}
                        className="aspect-[4/5] w-full object-cover"
                      />
                      <span className="block px-3 py-3 text-sm font-bold">
                        Image {index + 1}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove image ${index + 1}`}
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
                  <Camera aria-hidden="true" size={17} /> Take another photo
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

          {analysisUi.phase === "error" ? (
            <p
              ref={(node) => {
                feedbackRef.current = node;
              }}
              role="alert"
              className="mt-4 scroll-mb-32 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-[var(--destructive)]"
            >
              {analysisUi.message}
            </p>
          ) : null}

          {analysisUi.phase === "success" ? (
            <section
              ref={(node) => {
                feedbackRef.current = node;
              }}
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="mt-4 scroll-mb-32 rounded-[20px] border border-[var(--border)] bg-[var(--soft-green)] px-4 py-4"
            >
              <h2 className="font-bold">Menu analysis complete</h2>
              <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">
                {analysisUi.message}
              </p>
              {analysisUi.fallback === "navigation" ? (
                <PrimaryButton
                  className="mt-4 w-full"
                  onClick={openStoredResults}
                >
                  Open menu results
                </PrimaryButton>
              ) : null}
            </section>
          ) : null}
        </main>

        {analysisUi.phase === "success" &&
        analysisUi.fallback === "navigation" ? null : (
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
                ? MENU_ANALYSIS_LOADING_LABEL
                : analysisUi.phase === "success"
                  ? "Analyze again"
                  : "Analyze menu"}
            </PrimaryButton>
            <p className="mt-2 text-center text-[11px] leading-4 text-[var(--text-muted)]">
              {analyzing
                ? MENU_ANALYSIS_LOADING_HELPER
                : "Images are used for this analysis only and are not stored permanently."}
            </p>
          </footer>
        )}
      </div>

      <BottomSheet
        open={Boolean(preview)}
        onClose={() => setPreviewId(null)}
        title={`Image ${previewNumber}`}
        description="Preview only. Your image session stays unchanged."
      >
        {preview ? (
          <div className="safe-bottom py-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.url}
              alt={`Full preview of image ${previewNumber}`}
              className="max-h-[65dvh] w-full rounded-[20px] object-contain"
            />
          </div>
        ) : null}
      </BottomSheet>

      <ConfirmationDialog
        open={discardOpen}
        title="Discard selected images?"
        description={`You have ${pages.length} ${pages.length === 1 ? "image" : "images"} ready.`}
        cancelLabel="Keep images"
        confirmLabel="Discard"
        destructive
        onCancel={() => setDiscardOpen(false)}
        onConfirm={discardAndLeave}
      />
    </MobileShell>
  );
}
