export const READER_HIGHLIGHT_COLORS = [
  "#D4AF37",
  "#D1FAE5",
  "#DBEAFE",
  "#FCE7F3",
  "#EDE9FE",
] as const;

export const DEFAULT_READER_HIGHLIGHT_COLOR = READER_HIGHLIGHT_COLORS[0];

export const READER_HIGHLIGHT_COLOR_STORAGE_KEY =
  "mobile.reader.defaultHighlightColor.v1";

export function isReaderHighlightColor(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return READER_HIGHLIGHT_COLORS.some(
    (candidate) => candidate.toLowerCase() === normalized,
  );
}
