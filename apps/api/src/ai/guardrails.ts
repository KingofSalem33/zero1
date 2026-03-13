/**
 * Guardrails Layer
 * Safety and quality enforcement for LLM outputs
 */

import pino from "pino";

const logger = pino({ name: "guardrails" });

export interface GuardrailViolation {
  type:
    | "external_theology"
    | "non_kjv_translation"
    | "forward_carry"
    | "prompt_injection"
    | "off_topic"
    | "inappropriate_content";
  severity: "block" | "warn" | "log";
  message: string;
  matchedText?: string;
  suggestion?: string;
}

export interface GuardrailResult {
  passed: boolean;
  violations: GuardrailViolation[];
  sanitizedText?: string;
}

/**
 * External theological systems/figures to detect
 * These should not be cited as authoritative sources
 */
const EXTERNAL_THEOLOGY_PATTERNS = [
  // Reformers/theologians
  { pattern: /\b(John Calvin|Calvinist?|Calvinism)\b/gi, name: "Calvinism" },
  { pattern: /\b(Martin Luther|Lutheran)\b/gi, name: "Luther" },
  { pattern: /\b(John Wesley|Wesleyan|Methodis[tm])\b/gi, name: "Wesley" },
  { pattern: /\b(Arminian|Arminius)\b/gi, name: "Arminianism" },
  { pattern: /\b(Augustine|Augustinian)\b/gi, name: "Augustine" },
  { pattern: /\b(Aquinas|Thomis[tm])\b/gi, name: "Aquinas" },

  // Theological systems
  {
    pattern: /\b(dispensational(?:ism|ist)?)\b/gi,
    name: "Dispensationalism",
  },
  { pattern: /\b(covenant theology)\b/gi, name: "Covenant Theology" },
  { pattern: /\b(reformed theology)\b/gi, name: "Reformed Theology" },
  { pattern: /\b(systematic theology)\b/gi, name: "Systematic Theology" },

  // Creeds/confessions as authority
  {
    pattern: /\b(according to the (?:Nicene|Apostles'?) Creed)\b/gi,
    name: "Creed",
  },
  {
    pattern: /\b(Westminster Confession|Heidelberg Catechism)\b/gi,
    name: "Confession",
  },

  // Modern teachers cited as authority
  {
    pattern: /\b(according to (?:Dr\.|Pastor|Rev\.)\s+\w+)\b/gi,
    name: "Modern teacher",
  },
];

/**
 * Non-KJV translation indicators
 */
const NON_KJV_PATTERNS = [
  // Modern translation markers
  {
    pattern: /\b(NIV|ESV|NASB|NLT|MSG|CEV|GNT|NKJV|CSB|RSV)\b/g,
    name: "Modern translation acronym",
  },
  { pattern: /\[(NIV|ESV|NASB|NLT|MSG)\]/g, name: "Translation citation" },

  // Common NIV/ESV phrasings that differ from KJV
  { pattern: /\bthe Lord's unfailing love\b/gi, name: "NIV phrasing" },
  {
    pattern: /\bfind rest for your souls\b/gi,
    name: "NIV phrasing (Matt 11:29)",
  },
  { pattern: /\bsaved by grace through faith\b/gi, name: "Paraphrase" },

  // Contemporary language markers
  { pattern: /\b(you guys|gonna|wanna|gotta)\b/gi, name: "Informal language" },
];

/**
 * Forward carry patterns (mentioning future content)
 */
const FORWARD_CARRY_PATTERNS = [
  /\bwe('ll| will) explore (?:this |next |further )/i,
  /\bnext(?:,| ) we/i,
  /\bin (?:the )?next (?:section|verse|chapter)/i,
  /\bshall we (?:continue|see|explore)/i,
  /\blet's (?:continue|move on|proceed)/i,
  /\bmore on this (?:later|soon)/i,
  /\bstay tuned/i,
  /\bto be continued/i,
];

/**
 * Prompt injection patterns
 */
const INJECTION_PATTERNS = [
  // System prompt leakage
  /\bsystem prompt\b/i,
  /\bignore (?:all )?(?:previous |prior )?instructions\b/i,
  /\byou are now\b/i,
  /\bact as (?:if|though)\b/i,
  /\bpretend (?:to be|you are)\b/i,

  // Jailbreak attempts
  /\bDAN mode\b/i,
  /\bdeveloper mode\b/i,
  /\bjailbreak\b/i,

  // Role manipulation
  /\byour (?:new )?role is\b/i,
  /\bforget (?:all |everything )?you(?:'ve)? (?:learned|know)\b/i,
];

/**
 * Check for external theology references
 */
export function checkExternalTheology(text: string): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];

  for (const { pattern, name } of EXTERNAL_THEOLOGY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      violations.push({
        type: "external_theology",
        severity: "warn",
        message: `External theology reference detected: ${name}`,
        matchedText: match[0],
        suggestion:
          "Ground all teaching in Scripture alone, not theological systems",
      });
    }
  }

  return violations;
}

/**
 * Check for non-KJV translation indicators
 */
export function checkNonKJVTranslation(text: string): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];

  for (const { pattern, name } of NON_KJV_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      violations.push({
        type: "non_kjv_translation",
        severity: "warn",
        message: `Non-KJV indicator detected: ${name}`,
        matchedText: match[0],
        suggestion: "Use King James Version text only",
      });
    }
  }

  return violations;
}

/**
 * Check for forward carry violations
 */
export function checkForwardCarry(text: string): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];

  for (const pattern of FORWARD_CARRY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      violations.push({
        type: "forward_carry",
        severity: "warn",
        message: "Forward carry violation: mentioning future content",
        matchedText: match[0],
        suggestion: "End with resolved, declarative statement from Scripture",
      });
    }
  }

  return violations;
}

/**
 * Check for prompt injection attempts
 * This checks both input and output
 */
export function checkPromptInjection(text: string): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];

  for (const pattern of INJECTION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      violations.push({
        type: "prompt_injection",
        severity: "block",
        message: "Potential prompt injection detected",
        matchedText: match[0],
      });
    }
  }

  return violations;
}

/**
 * Check for off-topic content
 * Detects when response strays from Bible study
 */
export function checkOffTopic(text: string): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];

  // Off-topic indicators
  const offTopicPatterns = [
    // Politics
    /\b(democrat|republican|liberal|conservative|political party)\b/gi,
    // Current events
    /\b(breaking news|latest update|current events)\b/gi,
    // Personal advice unrelated to Scripture
    /\b(financial advice|investment tips|medical advice)\b/gi,
  ];

  for (const pattern of offTopicPatterns) {
    const match = text.match(pattern);
    if (match) {
      violations.push({
        type: "off_topic",
        severity: "warn",
        message: "Off-topic content detected",
        matchedText: match[0],
        suggestion: "Keep focus on Scripture study",
      });
    }
  }

  return violations;
}

/**
 * Main guardrails enforcement function
 * Runs all checks and returns consolidated result
 */
export function enforceGuardrails(
  text: string,
  options: {
    checkInput?: boolean; // If true, also check for injection in input
    strictMode?: boolean; // If true, warnings become blocks
  } = {},
): GuardrailResult {
  const { strictMode = false } = options;

  const allViolations: GuardrailViolation[] = [];

  // Run all checks
  allViolations.push(...checkExternalTheology(text));
  allViolations.push(...checkNonKJVTranslation(text));
  allViolations.push(...checkForwardCarry(text));
  allViolations.push(...checkPromptInjection(text));
  allViolations.push(...checkOffTopic(text));

  // In strict mode, upgrade warnings to blocks
  if (strictMode) {
    for (const violation of allViolations) {
      if (violation.severity === "warn") {
        violation.severity = "block";
      }
    }
  }

  // Determine if passed (no blocking violations)
  const hasBlockingViolation = allViolations.some(
    (v) => v.severity === "block",
  );
  const passed = !hasBlockingViolation;

  // Log violations
  if (allViolations.length > 0) {
    logger.warn(
      {
        passed,
        violationCount: allViolations.length,
        blockCount: allViolations.filter((v) => v.severity === "block").length,
        warnCount: allViolations.filter((v) => v.severity === "warn").length,
        types: [...new Set(allViolations.map((v) => v.type))],
      },
      "Guardrail violations detected",
    );
  }

  return {
    passed,
    violations: allViolations,
  };
}

/**
 * Sanitize text by removing/replacing problematic content
 * Use with caution - only for minor fixes
 */
export function sanitizeText(
  text: string,
  violations: GuardrailViolation[],
): string {
  let sanitized = text;

  for (const violation of violations) {
    if (violation.matchedText && violation.severity === "warn") {
      // For forward carry, try to remove the offending phrase
      if (violation.type === "forward_carry") {
        // Remove sentences containing forward carry
        const escapedMatch = violation.matchedText.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        );
        const sentencePattern = new RegExp(
          `[^.!?]*${escapedMatch}[^.!?]*[.!?]?`,
          "gi",
        );
        sanitized = sanitized.replace(sentencePattern, "");
      }
    }
  }

  // Clean up any double spaces or trailing whitespace
  sanitized = sanitized.replace(/\s+/g, " ").trim();

  return sanitized;
}

/**
 * Check user input for potential issues before processing
 */
export function checkUserInput(input: string): GuardrailResult {
  const violations: GuardrailViolation[] = [];

  // Check for injection attempts in input
  violations.push(...checkPromptInjection(input));

  // Check for extremely long inputs (potential DoS)
  if (input.length > 10000) {
    violations.push({
      type: "inappropriate_content",
      severity: "block",
      message: "Input exceeds maximum length",
    });
  }

  return {
    passed: !violations.some((v) => v.severity === "block"),
    violations,
  };
}
