"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  consumePendingImageIntake,
  stagePendingImageIntake,
  type ImageIntakeSource,
  type PendingImageIntake,
} from "@/lib/image-intake";

interface ImageIntakeContextValue {
  readonly pending: PendingImageIntake | null;
  stageFiles(files: readonly File[], source: ImageIntakeSource): void;
  consumePendingFiles(): PendingImageIntake | null;
  clearPendingFiles(): void;
}

const ImageIntakeContext = createContext<ImageIntakeContextValue | null>(null);

export function ImageIntakeProvider({ children }: { children: React.ReactNode }) {
  const pendingRef = useRef<PendingImageIntake | null>(null);
  const [pending, setPending] = useState<PendingImageIntake | null>(null);

  const stageFiles = useCallback((files: readonly File[], source: ImageIntakeSource) => {
    const next = stagePendingImageIntake(files, source);
    pendingRef.current = next;
    setPending(next);
  }, []);

  const consumePendingFiles = useCallback(() => {
    const next = consumePendingImageIntake(pendingRef.current);
    pendingRef.current = next.pending;
    setPending(next.pending);
    return next.consumed;
  }, []);

  const clearPendingFiles = useCallback(() => {
    pendingRef.current = null;
    setPending(null);
  }, []);

  const value = useMemo<ImageIntakeContextValue>(
    () => ({ pending, stageFiles, consumePendingFiles, clearPendingFiles }),
    [clearPendingFiles, consumePendingFiles, pending, stageFiles],
  );

  return <ImageIntakeContext.Provider value={value}>{children}</ImageIntakeContext.Provider>;
}

export function useImageIntake(): ImageIntakeContextValue {
  const value = useContext(ImageIntakeContext);
  if (!value) throw new Error("useImageIntake must be used inside ImageIntakeProvider");
  return value;
}
