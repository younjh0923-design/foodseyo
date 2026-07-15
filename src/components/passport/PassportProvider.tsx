"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { FoodPassport } from "@/types/domain";
import { emptyPassport, readPassport, removePassport, writePassport } from "@/lib/storage";

interface PassportContextValue {
  passport: FoodPassport;
  hydrated: boolean;
  savePassport: (passport: FoodPassport) => void;
  clearPassport: () => void;
}

const PassportContext = createContext<PassportContextValue | null>(null);

export function PassportProvider({ children }: { children: React.ReactNode }) {
  const [passport, setPassport] = useState<FoodPassport>(emptyPassport);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const hydrateTimer = window.setTimeout(() => {
      setPassport(readPassport());
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrateTimer);
  }, []);

  const value = useMemo<PassportContextValue>(
    () => ({
      passport,
      hydrated,
      savePassport: (nextPassport) => {
        writePassport(nextPassport);
        setPassport(nextPassport);
      },
      clearPassport: () => {
        removePassport();
        setPassport(emptyPassport);
      },
    }),
    [hydrated, passport],
  );

  return <PassportContext.Provider value={value}>{children}</PassportContext.Provider>;
}

export function useFoodPassport(): PassportContextValue {
  const value = useContext(PassportContext);
  if (!value) throw new Error("useFoodPassport must be used inside PassportProvider");
  return value;
}
