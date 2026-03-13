import type { BibleHighlight } from "../contexts/BibleHighlightsContext";
import { formatVerseRange } from "../contexts/BibleHighlightsContext";

const CARD_W = 1080;
const CARD_H = 1080;
const PADDING = 80;
const TEXT_AREA_W = CARD_W - PADDING * 2;

/**
 * Render a highlight as a shareable image card and return as a Blob.
 * Dark background, accent color strip, verse text, reference, and branding.
 */
export async function generateHighlightImage(
  highlight: BibleHighlight,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Subtle border
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, CARD_W - 2, CARD_H - 2);

  // Color accent strip (left side)
  const accentColor = highlight.color;
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, 6, CARD_H);

  // Top accent glow
  const glow = ctx.createRadialGradient(CARD_W / 2, 0, 0, CARD_W / 2, 0, 400);
  glow.addColorStop(0, `${accentColor}18`);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, 400);

  // Reference text (top)
  const reference = `${highlight.book} ${highlight.chapter}:${formatVerseRange(highlight.verses)}`;
  ctx.fillStyle = "#D4AF37";
  ctx.font = "600 28px system-ui, -apple-system, sans-serif";
  ctx.fillText(reference, PADDING, PADDING + 30);

  // Thin separator
  ctx.fillStyle = "rgba(212, 175, 55, 0.2)";
  ctx.fillRect(PADDING, PADDING + 52, 120, 2);

  // Verse text — word-wrap manually
  const verseText = `\u201C${highlight.text}\u201D`;
  ctx.fillStyle = "#e5e5e5";
  const fontSize =
    highlight.text.length > 300 ? 28 : highlight.text.length > 150 ? 32 : 38;
  ctx.font = `300 ${fontSize}px system-ui, -apple-system, sans-serif`;

  const lines = wrapText(ctx, verseText, TEXT_AREA_W);
  const lineHeight = fontSize * 1.6;
  const textStartY = PADDING + 100;
  const maxLines = Math.floor((CARD_H - textStartY - 160) / lineHeight);
  const displayLines = lines.slice(0, maxLines);

  if (lines.length > maxLines) {
    // Truncate last visible line with ellipsis
    displayLines[displayLines.length - 1] = displayLines[
      displayLines.length - 1
    ].replace(/\s+\S*$/, "\u2026\u201D");
  }

  for (let i = 0; i < displayLines.length; i++) {
    ctx.fillText(displayLines[i], PADDING, textStartY + i * lineHeight);
  }

  // Note (if present, below verse text)
  if (highlight.note) {
    const noteY = textStartY + displayLines.length * lineHeight + 20;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = `italic 300 22px system-ui, -apple-system, sans-serif`;
    const noteLines = wrapText(ctx, highlight.note, TEXT_AREA_W);
    for (let i = 0; i < Math.min(noteLines.length, 2); i++) {
      ctx.fillText(noteLines[i], PADDING, noteY + i * 32);
    }
  }

  // Bottom branding
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.font = "500 18px system-ui, -apple-system, sans-serif";
  ctx.fillText("Biblelot", PADDING, CARD_H - PADDING + 10);

  // Bottom accent line
  ctx.fillStyle = `${accentColor}40`;
  ctx.fillRect(PADDING, CARD_H - PADDING - 12, CARD_W - PADDING * 2, 1);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/png");
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/** Download the image or use Web Share API if available */
export async function shareHighlightImage(
  highlight: BibleHighlight,
): Promise<void> {
  const blob = await generateHighlightImage(highlight);
  const reference = `${highlight.book} ${highlight.chapter}:${formatVerseRange(highlight.verses)}`;
  const fileName = `biblelot-${reference.replace(/\s+/g, "-").replace(/:/g, "-")}.png`;

  // Try Web Share API first (mobile)
  if (navigator.share && navigator.canShare) {
    const file = new File([blob], fileName, { type: "image/png" });
    const shareData = { files: [file], title: reference, text: reference };
    if (navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // User cancelled or share failed — fall through to download
      }
    }
  }

  // Fallback: download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
