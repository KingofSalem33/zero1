export const MOBILE_TOKENS = {
  colors: {
    ink: "#12100C",
    canvas: "#F6F1E7",
    canvasMuted: "#ECE3D2",
    surface: "#FFF9EE",
    surfaceRaised: "#FFFFFF",
    border: "#D8CCB8",
    text: "#221E17",
    textMuted: "#6E6355",
    accent: "#8A6238",
    accentStrong: "#6E4B28",
    accentSoft: "#E9D5B7",
    pine: "#315E4A",
    pineSoft: "#DDECE4",
    danger: "#A63B3B",
    dangerSoft: "#F7DFDF",
    shadow: "rgba(23, 18, 12, 0.08)",
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    pill: 999,
  },
  typography: {
    title: 28,
    heading: 18,
    body: 14,
    caption: 12,
  },
} as const;

export type MobileTabKey =
  | "home"
  | "library"
  | "bookmarks"
  | "highlights"
  | "account";
