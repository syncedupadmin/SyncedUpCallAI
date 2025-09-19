"use client";
import React, { createContext, useContext, useMemo, useState } from "react";
import type { Prefs } from "@/lib/prefs";
import { loadPrefs, savePrefs } from "@/lib/prefs";

type Ctx = {
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  resetPrefs: () => void;
};

const PrefsContext = createContext<Ctx | null>(null);

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setState] = useState<Prefs>(loadPrefs());

  const api = useMemo<Ctx>(() => ({
    prefs,
    setPrefs: (patch) => {
      const next = { ...prefs, ...patch };
      setState(next);
      savePrefs(next);
    },
    resetPrefs: () => {
      setState(loadPrefs()); // reload defaults + any persisted
    }
  }), [prefs]);

  return <PrefsContext.Provider value={api}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Ctx {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used within PrefsProvider");
  return ctx;
}