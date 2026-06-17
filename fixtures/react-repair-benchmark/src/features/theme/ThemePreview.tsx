import { useTheme } from "./ThemeContext";

export function ThemePreview() {
  const { mode, previewClassName } = useTheme();

  return (
    <section aria-label="Theme preview" className={previewClassName}>
      Current theme: {mode}
    </section>
  );
}
