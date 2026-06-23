/**
 * Deck themes for the renderer. `designStyle` on a deck artifact is a free-form
 * string (the agent picks it), so we map known names to palettes and fall back
 * to a clean light theme. Fonts default to Arial: it is present on virtually
 * every machine, in PowerPoint, and in Google Slides, which keeps the exported
 * text wrapping identical to the preview (no substitution drift).
 */
export interface DeckTheme {
  colors: {
    background: string;
    surface: string;
    primary: string;
    accent: string;
    text: string;
    textMuted: string;
    divider: string;
  };
  fonts: { heading: string; body: string };
}

const LIGHT: DeckTheme = {
  colors: {
    background: "#FFFFFF",
    surface: "#F4F6FB",
    primary: "#111827",
    accent: "#2563EB",
    text: "#0F172A",
    textMuted: "#475569",
    divider: "#E2E8F0",
  },
  fonts: { heading: "Arial", body: "Arial" },
};

const DARK: DeckTheme = {
  colors: {
    background: "#0B0F1A",
    surface: "#141A2A",
    primary: "#7C5CFF",
    accent: "#22D3EE",
    text: "#F8FAFC",
    textMuted: "#9AA4B2",
    divider: "#1F2638",
  },
  fonts: { heading: "Arial", body: "Arial" },
};

const THEMES: Record<string, DeckTheme> = {
  modern: LIGHT,
  light: LIGHT,
  corporate: LIGHT,
  minimal: LIGHT,
  dark: DARK,
  modern_premium_startup: DARK,
  tech: DARK,
};

export function getTheme(designStyle?: string | null): DeckTheme {
  if (!designStyle) return LIGHT;
  return THEMES[designStyle.trim().toLowerCase()] ?? LIGHT;
}
