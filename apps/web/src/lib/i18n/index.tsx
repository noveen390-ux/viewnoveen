"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import ar from "./ar.json";
import en from "./en.json";

export type Lang = "ar" | "en";
type Dict = typeof ar;

const dicts: Record<Lang, Dict> = { ar, en };

interface I18nCtx {
  lang: Lang;
  dir: "rtl" | "ltr";
  setLang: (l: Lang) => void;
  t: (path: string) => string;
}

const Ctx = createContext<I18nCtx | null>(null);
const STORAGE_KEY = "viewnoveen.lang";

function get(obj: any, path: string): string {
  return path.split(".").reduce((acc, k) => (acc && acc[k] != null ? acc[k] : null), obj) ?? path;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");

  // Load saved lang on mount (client only)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved === "ar" || saved === "en") setLangState(saved);
  }, []);

  // Reflect on <html>
  useEffect(() => {
    if (typeof document === "undefined") return;
    const dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, l);
  };

  const dir = lang === "ar" ? "rtl" : "ltr";
  const t = (path: string) => get(dicts[lang], path);

  return <Ctx.Provider value={{ lang, dir, setLang, t }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
