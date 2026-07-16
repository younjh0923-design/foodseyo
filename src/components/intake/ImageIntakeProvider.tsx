"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
} from "react";
import {
  consumePendingImageIntake,
  stagePendingImageIntake,
  type PendingImageIntake,
} from "@/lib/image-intake";

interface ImageIntakeContextValue {
  stageFiles(files: readonly File[]): void;
  consumePendingFiles(): PendingImageIntake | null;
  clearPendingFiles(): void;
}

const ImageIntakeContext = createContext<ImageIntakeContextValue | null>(null);

export function ImageIntakeProvider({ children }: { children: React.ReactNode }) {
  const pendingRef = useRef<PendingImageIntake | null>(null);

  const stageFiles = useCallback((files: readonly File[]) => {
    const next = stagePendingImageIntake(files);
    pendingRef.current = next;
  }, []);

  const consumePendingFiles = useCallback(() => {
    const next = consumePendingImageIntake(pendingRef.current);
    pendingRef.current = next.pending;
    return next.consumed;
  }, []);

  const clearPendingFiles = useCallback(() => {
    pendingRef.current = null;
  }, []);

  return (
    <ImageIntakeContext.Provider
      value={{ stageFiles, consumePendingFiles, clearPendingFiles }}
    >
      {children}
    </ImageIntakeContext.Provider>
  );
}

export function useImageIntake(): ImageIntakeContextValue {
  const value = useContext(ImageIntakeContext);
  if (!value) throw new Error("useImageIntake must be used inside ImageIntakeProvider");
  return value;
}
