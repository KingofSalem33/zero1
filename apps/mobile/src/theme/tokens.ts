export const MOBILE_TOKENS = {
  colors: {
    ink: "#09090B",
    canvas: "#18181B",
    canvasMuted: "#27272A",
    surface: "rgba(39, 39, 42, 0.95)",
    surfaceRaised: "rgba(255, 255, 255, 0.08)",
    border: "rgba(255, 255, 255, 0.10)",
    text: "#E4E4E7",
    textMuted: "#A1A1AA",
    accent: "#D4AF37",
    accentStrong: "#F0D77F",
    accentSoft: "rgba(212, 175, 55, 0.16)",
    pine: "#22C55E",
    pineSoft: "rgba(34, 197, 94, 0.18)",
    danger: "#EF4444",
    dangerSoft: "rgba(239, 68, 68, 0.18)",
    shadow: "rgba(0, 0, 0, 0.45)",
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    pill: 999,
  },
  typography: {
    title: 30,
    heading: 20,
    body: 14,
    caption: 12,
  },
} as const;

export type MobileTabKey =
  | "library"
  | "bookmarks"
  | "highlights"
  | "account"
  | "mapFallback";
