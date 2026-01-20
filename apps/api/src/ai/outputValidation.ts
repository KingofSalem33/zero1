/**
 * Output Validation Layer
 * Validates LLM outputs against quality and safety criteria
 */

import pino from "pino";

const logger = pino({ name: "outputValidation" });

export interface ValidationIssue {
  type: "citation" | "prohibited_phrase" | "word_count" | "header" | "format";
  severity: "error" | "warning";
  message: string;
  location?: number; // Character index
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  metrics: {
    wordCount: number;
    citationCount: number;
    prohibitedPhraseCount: number;
    hasH2Header: boolean;
  };
}

export interface ValidationOptions {
  requireCitations?: boolean;
  maxWords?: number;
  minWords?: number;
  requireH2Header?: boolean;
  prohibitedPhrases?: string[];
}

// Default prohibited phrases from the system prompts
export const DEFAULT_PROHIBITED_PHRASES = [
  "scripture declares plainly",
  "the word states",
  "the word declares",
  "plainly says",
  "let us open",
  "you asked",
  "this passage contains",
  "this connection matters",
  "matters",
  "this connection shows",
  "decisive victory",
  "ultimate subjugation",
  "anchors the believer",
  "scripture pulls",
  "this invites us",
  "invites us to consider",
  "this shows us that",
  "we can see here",
  "in a similar way",
  "this thread continues",
  "shall we see",
  "thread",
  "next:",
  "do you want to explore",
  "do you want",
  "incarnation",
  "thus establishing",
  "affirming",
  "eternal kingship",
  "thus the scripture is fulfilled",
  "fulfilled in the church",
  "fulfilled in believers",
  "could mean",
  "may suggest",
  "represents",
  "symbolizes",
  "suggests",
  "invites",
  "this is not isolated",
  "the spirit thus interprets",
  "thus the scripture",
  "shall we see",
  "our salvation depends on",
];

/**
 * Validate Bible citation format
 * Supports both [Book Ch:v] and (Book Ch:v) formats
 * Returns array of valid citations found
 */
export function validateCitations(text: string): {
  valid: boolean;
  citations: string[];
  issues: ValidationIssue[];
} {
  // Match patterns like [John 3:16], [Genesis 1:1-3], (Isaiah 9:6), (1 Corinthians 13:4)
  // Supports both bracket and parenthetical formats
  const bracketPattern =
    /\[(?:\d\s)?[A-Za-z]+(?:\s[A-Za-z]+)?\s+\d+:\d+(?:-\d+)?\]/g;
  const parenPattern =
    /\((?:\d\s)?[A-Za-z]+(?:\s[A-Za-z]+)?\s+\d+:\d+(?:-\d+)?(?:;\s*(?:\d\s)?[A-Za-z]+(?:\s[A-Za-z]+)?\s+\d+:\d+(?:-\d+)?)*\)/g;

  const bracketMatches = text.match(bracketPattern) || [];
  const parenMatches = text.match(parenPattern) || [];
  const allMatches = [...bracketMatches, ...parenMatches];

  const issues: ValidationIssue[] = [];

  return {
    valid: allMatches.length > 0 || issues.length === 0,
    citations: allMatches,
    issues,
  };
}

/**
 * Scan text for prohibited phrases
 * Returns matches found
 */
export function scanProhibitedPhrases(
  text: string,
  phrases: string[] = DEFAULT_PROHIBITED_PHRASES,
): {
  found: string[];
  issues: ValidationIssue[];
} {
  const textLower = text.toLowerCase();
  const found: string[] = [];
  const issues: ValidationIssue[] = [];

  for (const phrase of phrases) {
    const phraseLower = phrase.toLowerCase();
    const index = textLower.indexOf(phraseLower);

    if (index !== -1) {
      found.push(phrase);
      issues.push({
        type: "prohibited_phrase",
        severity: "warning",
        message: `Found prohibited phrase: "${phrase}"`,
        location: index,
        suggestion: "Rephrase to avoid this expression",
      });
    }
  }

  return { found, issues };
}

/**
 * Check word count against limits
 */
export function checkWordCount(
  text: string,
  options: { max?: number; min?: number } = {},
): {
  count: number;
  issues: ValidationIssue[];
} {
  // Split on whitespace and filter empty strings
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const count = words.length;
  const issues: ValidationIssue[] = [];

  if (options.max && count > options.max) {
    issues.push({
      type: "word_count",
      severity: "warning",
      message: `Word count (${count}) exceeds maximum (${options.max})`,
      suggestion: `Reduce by ${count - options.max} words`,
    });
  }

  if (options.min && count < options.min) {
    issues.push({
      type: "word_count",
      severity: "warning",
      message: `Word count (${count}) below minimum (${options.min})`,
      suggestion: `Add ${options.min - count} more words`,
    });
  }

  return { count, issues };
}

/**
 * Validate that response starts with H2 header (## )
 */
export function validateH2Header(text: string): {
  valid: boolean;
  issues: ValidationIssue[];
} {
  const trimmed = text.trim();
  const hasH2 = trimmed.startsWith("## ");
  const issues: ValidationIssue[] = [];

  if (!hasH2) {
    // Check if there's an H2 somewhere (just not at start)
    const hasAnyH2 = /^##\s/m.test(trimmed);

    issues.push({
      type: "header",
      severity: "warning",
      message: hasAnyH2
        ? "H2 header found but not at start of response"
        : "Response should start with an H2 header (## Title)",
      suggestion: "Begin response with ## followed by a concise title",
    });
  }

  return { valid: hasH2, issues };
}

/**
 * Validate for forward carry violations (mentioning next verse/thread)
 */
export function checkForwardCarry(text: string): {
  valid: boolean;
  issues: ValidationIssue[];
} {
  const forwardPatterns = [
    /\bnext\s+verse\b/i,
    /\bnext\s+thread\b/i,
    /\bfuture\s+exploration\b/i,
    /\bwe\s+will\s+explore\b/i,
    /\bshall\s+we\s+see\b/i,
    /\bhow\s+it\s+unfolds\b/i,
    /\bcontinue\s+to\s+explore\b/i,
    /\bmore\s+on\s+this\s+later\b/i,
  ];

  const issues: ValidationIssue[] = [];

  for (const pattern of forwardPatterns) {
    const match = text.match(pattern);
    if (match) {
      issues.push({
        type: "format",
        severity: "warning",
        message: `Forward carry violation: "${match[0]}"`,
        suggestion: "Remove references to future content",
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Main orchestrator function for exegesis output validation
 */
export function validateExegesisOutput(
  text: string,
  options: ValidationOptions = {},
): ValidationResult {
  const {
    requireCitations = true,
    maxWords = 600, // Flexible upper bound for full responses
    minWords = 75, // Lower minimum to allow brief responses
    requireH2Header = true,
    prohibitedPhrases = DEFAULT_PROHIBITED_PHRASES,
  } = options;

  const allIssues: ValidationIssue[] = [];

  // Citation validation
  const citationResult = validateCitations(text);
  allIssues.push(...citationResult.issues);

  if (requireCitations && citationResult.citations.length === 0) {
    allIssues.push({
      type: "citation",
      severity: "error",
      message: "Response contains no valid Scripture citations",
      suggestion: "Add citations in format [Book Ch:v]",
    });
  }

  // Prohibited phrases
  const phraseResult = scanProhibitedPhrases(text, prohibitedPhrases);
  allIssues.push(...phraseResult.issues);

  // Word count
  const wordResult = checkWordCount(text, { max: maxWords, min: minWords });
  allIssues.push(...wordResult.issues);

  // H2 Header
  let hasH2Header = true;
  if (requireH2Header) {
    const headerResult = validateH2Header(text);
    hasH2Header = headerResult.valid;
    allIssues.push(...headerResult.issues);
  }

  // Forward carry check
  const forwardResult = checkForwardCarry(text);
  allIssues.push(...forwardResult.issues);

  // Determine overall validity (only errors make it invalid, warnings are advisory)
  const hasErrors = allIssues.some((issue) => issue.severity === "error");

  const result: ValidationResult = {
    valid: !hasErrors,
    issues: allIssues,
    metrics: {
      wordCount: wordResult.count,
      citationCount: citationResult.citations.length,
      prohibitedPhraseCount: phraseResult.found.length,
      hasH2Header,
    },
  };

  // Log validation results
  if (allIssues.length > 0) {
    logger.info(
      {
        valid: result.valid,
        errorCount: allIssues.filter((i) => i.severity === "error").length,
        warningCount: allIssues.filter((i) => i.severity === "warning").length,
        metrics: result.metrics,
      },
      "Output validation completed with issues",
    );
  }

  return result;
}

/**
 * Attempt to sanitize/fix common issues in output
 * Returns sanitized text and list of fixes applied
 */
export function sanitizeOutput(
  text: string,
  issues: ValidationIssue[],
): {
  text: string;
  fixes: string[];
} {
  let sanitized = text;
  const fixes: string[] = [];

  // Auto-fix: Add H2 header if missing and there's content
  const headerIssue = issues.find(
    (i) => i.type === "header" && !text.trim().startsWith("## "),
  );
  if (headerIssue && sanitized.trim().length > 0) {
    // Try to extract a title from the first sentence
    const firstLine = sanitized.trim().split("\n")[0];
    const firstSentence = firstLine.split(/[.!?]/)[0];

    if (firstSentence.length < 60 && firstSentence.length > 5) {
      // Use first sentence as title
      sanitized = `## ${firstSentence.trim()}\n\n${sanitized.slice(firstSentence.length).trim()}`;
      fixes.push("Added H2 header from first sentence");
    } else {
      // Generic title
      sanitized = `## Scripture Study\n\n${sanitized}`;
      fixes.push("Added generic H2 header");
    }
  }

  // Log fixes applied
  if (fixes.length > 0) {
    logger.info({ fixes }, "Output sanitization applied");
  }

  return { text: sanitized, fixes };
}

/**
 * Streaming-friendly validation that buffers and validates on completion
 */
export class StreamingOutputValidator {
  private buffer: string = "";
  private options: ValidationOptions;

  constructor(options: ValidationOptions = {}) {
    this.options = options;
  }

  /**
   * Append delta to buffer
   */
  append(delta: string): void {
    this.buffer += delta;
  }

  /**
   * Get current buffer content
   */
  getContent(): string {
    return this.buffer;
  }

  /**
   * Validate the complete buffered output
   */
  validate(): ValidationResult {
    return validateExegesisOutput(this.buffer, this.options);
  }

  /**
   * Reset the buffer
   */
  reset(): void {
    this.buffer = "";
  }
}
