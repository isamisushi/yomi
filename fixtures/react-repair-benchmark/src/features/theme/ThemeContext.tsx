import { createContext, useContext, useMemo, useState } from "react";

type ThemeMode = "dark" | "light";

type ThemeContextValue = {
  readonly mode: ThemeMode;
  readonly previewClassName: string;
  readonly toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { readonly children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("light");
  const previewClassName = mode === "dark" ? "preview-light" : "preview-light";
  const value = useMemo(
    () => ({
      mode,
      previewClassName,
      toggleTheme: () => setMode((current) => (current === "dark" ? "light" : "dark")),
    }),
    [mode, previewClassName],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (value === null) {
    throw new Error("useTheme must be used inside ThemeProvider.");
  }
  return value;
}
