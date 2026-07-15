"use client";

import { Camera, Images, LoaderCircle, ScanLine, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BottomSheet } from "@/components/common/BottomSheet";
import { ConfirmationDialog } from "@/components/common/ConfirmationDialog";
import { PrimaryButton, SecondaryButton } from "@/components/common/Controls";
import { PageHeader } from "@/components/common/PageHeader";
import { MobileShell } from "@/components/layout/MobileShell";

interface MenuPage {
  id: string;
  file: File;
  url: string;
}

const demoPath = "/restaurant/pai-northern-thai-kitchen";

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pages, setPages] = useState<MenuPage[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      pagesRef.current.forEach((page) => URL.revokeObjectURL(page.url));
    },
    [],
  );

  const appendFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const added = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({ id: makeId(), file, url: URL.createObjectURL(file) }));
    if (!added.length) return;
    setPages((current) => {
      const next = [...current, ...added];
      pagesRef.current = next;
      return next;
    });
  };

  const removePage = (id: string) => {
    setPages((current) => {
      const removed = current.find((page) => page.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      const next = current.filter((page) => page.id !== id);
      pagesRef.current = next;
      return next;
    });
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
    pagesRef.current.forEach((page) => URL.revokeObjectURL(page.url));
    pagesRef.current = [];
    setPages([]);
    setDiscardOpen(false);
    router.push("/");
  };

  const analyze = () => {
    if (!pages.length || analyzing) return;
    setAnalyzing(true);
    timerRef.current = setTimeout(() => router.push(demoPath), 950);
  };

  const preview = pages.find((page) => page.id === previewId) ?? null;
  const previewNumber = preview ? pages.findIndex((page) => page.id === preview.id) + 1 : 0;
  const pageStatus = pages.length === 1 ? "1 page ready" : `${pages.length} pages ready`;

  return (
    <MobileShell>
      <div className="flex min-h-dvh flex-col bg-[var(--surface)]">
        <PageHeader
          title="Scan menu"
          description="Capture every page you want Foodseyo to include in one analysis."
          onBack={handleBack}
          backLabel="Back to home"
        />

        <main className="page-padding flex-1 pb-8">
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
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
            accept="image/*"
            multiple
            aria-label="Choose menu pages from photos"
            className="sr-only"
            onChange={(event) => {
              appendFiles(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />

          <div aria-live="polite" className="sr-only">{pages.length ? pageStatus : "No menu pages yet."}</div>

          {!pages.length ? (
            <section className="mt-3 rounded-[28px] border border-dashed border-[var(--border-strong)] bg-[var(--canvas)] px-5 py-10 text-center">
              <span className="mx-auto flex size-16 items-center justify-center rounded-[22px] bg-[var(--soft-green)] text-[var(--primary)]">
                <ScanLine aria-hidden="true" size={29} />
              </span>
              <h2 className="mt-5 text-xl font-bold tracking-[-0.025em]">No menu pages yet.</h2>
              <p className="mx-auto mt-2 max-w-[28ch] text-sm leading-5 text-[var(--text-secondary)]">
                Start with the first page. You can add more before analyzing.
              </p>
              <PrimaryButton className="mt-6 w-full" onClick={() => cameraRef.current?.click()}>
                <Camera aria-hidden="true" size={18} /> Scan first page
              </PrimaryButton>
              <SecondaryButton className="mt-2 w-full" onClick={() => galleryRef.current?.click()}>
                <Images aria-hidden="true" size={18} /> Choose from photos
              </SecondaryButton>
            </section>
          ) : (
            <section aria-labelledby="ready-pages-title" className="mt-2">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--primary)]">Capture session</p>
                  <h2 id="ready-pages-title" className="mt-1 text-xl font-bold">{pageStatus}</h2>
                </div>
                <p className="text-xs text-[var(--text-muted)]">Tap to preview</p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {pages.map((page, index) => (
                  <article key={page.id} className="relative overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--canvas)]">
                    <button
                      type="button"
                      aria-label={`Preview menu page ${index + 1}`}
                      onClick={() => setPreviewId(page.id)}
                      className="block w-full text-left"
                    >
                      {/* Browser object URLs require a native image element. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={page.url} alt={`Menu page ${index + 1}`} className="aspect-[4/5] w-full object-cover" />
                      <span className="block px-3 py-3 text-sm font-bold">Page {index + 1}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove menu page ${index + 1}`}
                      onClick={() => removePage(page.id)}
                      className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-full border border-white/60 bg-[var(--surface)]/95 text-[var(--destructive)] shadow-sm"
                    >
                      <Trash2 aria-hidden="true" size={18} />
                    </button>
                  </article>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <SecondaryButton onClick={() => cameraRef.current?.click()}>
                  <Camera aria-hidden="true" size={17} /> Scan another page
                </SecondaryButton>
                <SecondaryButton onClick={() => galleryRef.current?.click()}>
                  <Images aria-hidden="true" size={17} /> Choose from photos
                </SecondaryButton>
              </div>
            </section>
          )}
        </main>

        <footer className="sticky-safe-bottom sticky bottom-0 z-20 border-t border-[var(--border)] bg-[var(--surface)] px-4 pt-3 sm:px-6">
          <PrimaryButton className="min-h-12 w-full" disabled={!pages.length || analyzing} onClick={analyze}>
            {analyzing ? <LoaderCircle aria-hidden="true" className="soft-spin size-5" /> : null}
            {analyzing ? "Analyzing demo…" : `Analyze ${pages.length} ${pages.length === 1 ? "page" : "pages"}`}
          </PrimaryButton>
          <p className="mt-2 text-center text-[11px] leading-4 text-[var(--text-muted)]">
            Demo analysis opens PAI Northern Thai Kitchen.
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
            <img src={preview.url} alt={`Full preview of menu page ${previewNumber}`} className="max-h-[65dvh] w-full rounded-[20px] object-contain" />
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
