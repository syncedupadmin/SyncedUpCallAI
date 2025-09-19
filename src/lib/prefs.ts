export type Prefs = {
  showActions: boolean;
  showCustomerQuotes: boolean;
  showRebuttalScores: boolean;
  compactUI: boolean;
  redactCC: "last4" | "none";
  language: "auto" | "en" | "es";
  timezone: string; // e.g. "America/New_York"
};

export const DEFAULT_PREFS: Prefs = {
  showActions: false,
  showCustomerQuotes: false,
  showRebuttalScores: true,
  compactUI: false,
  redactCC: "last4",
  language: "auto",
  timezone: "America/New_York",
};

const KEY = "su:callai:prefs:v1";

export function loadPrefs(): Prefs {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    return { ...DEFAULT_PREFS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(next: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {/* localStorage being its usual self */}
}