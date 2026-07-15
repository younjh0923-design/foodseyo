"use client";

import { ImagePlus, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BottomSheet } from "@/components/common/BottomSheet";
import { ActionCard, PrimaryButton, SecondaryButton } from "@/components/common/Controls";

interface SelectedScreen {
  file: File;
  url: string;
}

const demoPath = "/restaurant/pai-northern-thai-kitchen";

export function UploadRestaurantAction() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const screenRef = useRef<SelectedScreen | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [screen, setScreen] = useState<SelectedScreen | null>(null);
  const [open, setOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (screenRef.current) URL.revokeObjectURL(screenRef.current.url);
    },
    [],
  );

  const selectFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (screenRef.current) URL.revokeObjectURL(screenRef.current.url);
    const next = { file, url: URL.createObjectURL(file) };
    screenRef.current = next;
    setScreen(next);
    setAnalyzing(false);
    setOpen(true);
  };

  const analyze = () => {
    if (!screen) return;
    setAnalyzing(true);
    timerRef.current = setTimeout(() => router.push(demoPath), 850);
  };

  return (
    <>
      <ActionCard
        onClick={() => inputRef.current?.click()}
        icon={<ImagePlus aria-hidden="true" size={21} />}
        title="Upload restaurant screen"
        description="Choose a saved restaurant screenshot"
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        aria-label="Choose a restaurant screenshot"
        className="sr-only"
        onChange={(event) => {
          selectFile(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Restaurant screen ready"
        description="Confirm the image, then open the demo restaurant analysis."
      >
        {screen ? (
          <div className="safe-bottom pt-5">
            {/* Browser object URLs require a native image element. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={screen.url}
              alt={`Selected restaurant screenshot: ${screen.file.name}`}
              className="max-h-[42dvh] w-full rounded-[22px] border border-[var(--border)] object-contain"
            />
            <p className="mt-3 truncate text-xs text-[var(--text-secondary)]">{screen.file.name}</p>
            <p className="mt-3 rounded-2xl bg-[var(--soft-orange)] p-3 text-xs leading-5 text-[var(--text-secondary)]">
              Demo only: the image is not uploaded and no live vision analysis is performed.
            </p>
            <PrimaryButton className="mt-4 w-full" disabled={analyzing} onClick={analyze}>
              {analyzing ? <LoaderCircle className="soft-spin size-4" aria-hidden="true" /> : null}
              {analyzing ? "Opening demo…" : "Continue with demo"}
            </PrimaryButton>
            <SecondaryButton className="mt-2 w-full" onClick={() => inputRef.current?.click()}>
              Choose another image
            </SecondaryButton>
          </div>
        ) : null}
      </BottomSheet>
    </>
  );
}
