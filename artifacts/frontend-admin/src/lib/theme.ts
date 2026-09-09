// Design & Branding theme system.
//
// Colors are stored server-side as plain hex strings (platform_settings keys
// THEME_PRIMARY / THEME_SECONDARY / THEME_ACCENT / THEME_BACKGROUND /
// THEME_CARD / THEME_TEXT / THEME_MODE) so the admin color-picker UI can use
// native <input type="color"> controls. The rest of the app's design-token
// system (index.css) is HSL triples consumed via hsl(var(--x)), so this file
// converts hex -> "H S% L%" at runtime and pushes the results onto
// document.documentElement as inline CSS custom properties. Inline styles
// win over the stylesheet's :root rule, so this overrides the shipped
// defaults without needing a rebuild when an admin changes colors.

export const THEME_KEYS = [
  'THEME_PRIMARY',
  'THEME_SECONDARY',
  'THEME_ACCENT',
  'THEME_BACKGROUND',
  'THEME_CARD',
  'THEME_TEXT',
  'THEME_MODE',
] as const;

export type ThemeKey = (typeof THEME_KEYS)[number];

// Matches the "Design & Branding" reference: dark navy primary, muted
// slate-blue secondary, teal accent, light cool-gray background.
export const DEFAULT_THEME: Record<ThemeKey, string> = {
  THEME_PRIMARY: '#173B57',
  THEME_SECONDARY: '#315A75',
  THEME_ACCENT: '#16A6A3',
  THEME_BACKGROUND: '#F5F8FA',
  THEME_CARD: '#FFFFFF',
  THEME_TEXT: '#102443',
  THEME_MODE: 'light',
};

const HEX_RE = /^#?([0-9a-f]{6})$/i;

export function hexToHslTriple(hex: string | undefined | null): string | null {
  if (!hex) return null;
  const m = HEX_RE.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// Adjusts an "H S% L%" triple's lightness by a fixed number of points —
// used to derive hover/active shades from a single saved color without
// asking the admin to pick every single state.
export function shiftLightness(hsl: string, deltaPoints: number): string {
  const m = /^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%$/.exec(hsl.trim());
  if (!m) return hsl;
  const [, h, s, l] = m;
  const newL = Math.min(96, Math.max(4, Number(l) + deltaPoints));
  return `${h} ${s}% ${newL}%`;
}

// Simple relative-luminance check so text/icons placed on a saved brand
// color stay legible without asking the admin to also pick a foreground.
export function readableForegroundHsl(hex: string | undefined | null): string {
  if (!hex) return '0 0% 100%';
  const m = HEX_RE.exec(hex.trim());
  if (!m) return '0 0% 100%';
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255, g = (int >> 8) & 255, b = int & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '213 35% 12%' : '0 0% 100%';
}

export interface ThemeSettings {
  THEME_PRIMARY?: string;
  THEME_SECONDARY?: string;
  THEME_ACCENT?: string;
  THEME_BACKGROUND?: string;
  THEME_CARD?: string;
  THEME_TEXT?: string;
  THEME_MODE?: string;
}

// Applies saved brand colors to the document root. Safe to call with
// undefined/partial data (e.g. before the site-content fetch resolves) —
// falls back to DEFAULT_THEME per-key rather than leaving a half-applied
// palette, and is idempotent so it can run on every site-content refetch.
export function applyThemeVars(settings: ThemeSettings | null | undefined): void {
  const root = document.documentElement;
  const get = (key: ThemeKey) => settings?.[key] || DEFAULT_THEME[key];

  const primary = get('THEME_PRIMARY');
  const secondary = get('THEME_SECONDARY');
  const accent = get('THEME_ACCENT');
  const background = get('THEME_BACKGROUND');
  const card = get('THEME_CARD');
  const text = get('THEME_TEXT');

  const primaryHsl = hexToHslTriple(primary);
  const secondaryHsl = hexToHslTriple(secondary);
  const accentHsl = hexToHslTriple(accent);
  const backgroundHsl = hexToHslTriple(background);
  const cardHsl = hexToHslTriple(card);
  const textHsl = hexToHslTriple(text);

  if (primaryHsl) {
    root.style.setProperty('--primary', primaryHsl);
    root.style.setProperty('--primary-foreground', readableForegroundHsl(primary));
    root.style.setProperty('--ring', primaryHsl);
    // The sidebar shares the primary brand color (matches the reference:
    // the dark-navy "Primary" swatch is the same navy the sidebar uses).
    root.style.setProperty('--sidebar', primaryHsl);
    root.style.setProperty('--sidebar-foreground', shiftLightness(primaryHsl, 68));
    root.style.setProperty('--sidebar-accent', shiftLightness(primaryHsl, 10));
    root.style.setProperty('--sidebar-accent-foreground', readableForegroundHsl('#ffffff'));
    root.style.setProperty('--sidebar-border', shiftLightness(primaryHsl, 14));
  }
  if (accentHsl) {
    root.style.setProperty('--accent', accentHsl);
    root.style.setProperty('--accent-foreground', readableForegroundHsl(accent));
    root.style.setProperty('--sidebar-primary', accentHsl);
    root.style.setProperty('--sidebar-primary-foreground', readableForegroundHsl(accent));
    root.style.setProperty('--sidebar-ring', accentHsl);
    root.style.setProperty('--chart-1', accentHsl);
  }
  if (secondaryHsl) {
    root.style.setProperty('--secondary', secondaryHsl);
    root.style.setProperty('--secondary-foreground', readableForegroundHsl(secondary));
    root.style.setProperty('--chart-3', secondaryHsl);
  }
  if (backgroundHsl) root.style.setProperty('--background', backgroundHsl);
  if (cardHsl) {
    root.style.setProperty('--card', cardHsl);
    root.style.setProperty('--popover', cardHsl);
  }
  if (textHsl) {
    root.style.setProperty('--foreground', textHsl);
    root.style.setProperty('--card-foreground', textHsl);
    root.style.setProperty('--popover-foreground', textHsl);
  }

  root.classList.toggle('dark', (settings?.THEME_MODE || 'light') === 'dark');
}
