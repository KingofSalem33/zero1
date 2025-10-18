type NormalizeOpts = {
  expectJson?: boolean;
  minChars?: number;
  log?: (m: string, o?: any) => void;
};

export function normalizeAIResponse(
  raw: unknown,
  opts: NormalizeOpts = {},
): string {
  const { expectJson = false, minChars = 1, log } = opts;
  const rawStr = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
  log?.("[NORMALIZE] raw length", { len: rawStr.length });

  // Common model quirks: strip code fences, BOM, zero-width chars
  const s = rawStr
    .replace(/^\uFEFF/, "")
    .replace(/```[a-z]*\n?([\s\S]*?)```/gi, "$1")
    .replace(/\u200B/g, "");

  log?.("[NORMALIZE] after fence-strip", { len: s.length });

  if (expectJson) {
    // Try direct parse; if empty, try to salvage JSON object
    const t = s.trim();
    if (t.length === 0) return "";

    try {
      JSON.parse(t);
      return t;
    } catch {
      // Continue to salvage attempts
    }

    // salvage { ... } from noisy text
    const m = t.match(/\{[\s\S]*\}$/);
    if (m) {
      const candidate = m[0];
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        // Continue to next salvage attempt
      }
    }
    // last resort: extract bracket-balanced region
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const candidate = t.slice(start, end + 1);
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        // Failed all salvage attempts
      }
    }
    // If still invalid, return original (caller will decide)
    return t;
  }

  // Non-JSON path: enforce min length (let guard throw if needed)
  if (s.trim().length < minChars) return s.trim();
  return s.trim();
}
