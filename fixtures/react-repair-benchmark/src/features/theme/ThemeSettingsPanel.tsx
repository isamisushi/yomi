import { ThemePreview } from "./ThemePreview";
import { useTheme } from "./ThemeContext";

export function ThemeSettingsPanel() {
  const { toggleTheme } = useTheme();

  return (
    <section aria-label="Theme settings">
      <button type="button" aria-label="Theme toggle" onClick={toggleTheme}>
        Toggle theme
      </button>
      <ThemePreview />
    </section>
  );
}
