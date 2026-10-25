import { useCallback, useEffect, useState } from "react";

import { readStored, writeStored } from "./storage";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "compose-doctor:theme";
const query = "(prefers-color-scheme: dark)";

function apply(preference: ThemePreference): void {
  const dark = preference === "dark" || (preference === "system" && window.matchMedia(query).matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function initial(): ThemePreference {
  const stored = readStored(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(initial);

  useEffect(() => {
    apply(preference);
    if (preference !== "system") return;
    const media = window.matchMedia(query);
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const choose = useCallback((next: ThemePreference) => {
    writeStored(STORAGE_KEY, next === "system" ? null : next);
    setPreference(next);
  }, []);

  return { preference, choose };
}
