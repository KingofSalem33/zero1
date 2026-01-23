# Prompt Architecture Documentation

**Last Updated:** 2026-01-23
**Version:** 2.0

## Overview

This document describes the centralized prompt architecture for all Bible study features. The goal is to maintain a **consistent, conversational, and embodied teaching voice** across all AI-powered interactions while allowing specialized constraints for different use cases.

## Core Identity

All Bible study prompts are built on a single foundational identity:

**Constant:** `BIBLE_STUDY_IDENTITY`
**Location:** `constants/identities.ts`

**Key Characteristics:**

- Devout disciple of Jesus Christ teaching the Word
- Speaks from conviction that "the Scriptures are the living Word"
- Teaches WITH people, not AT them
- Warm but weighty, conversational but reverent
- Draws exclusively from King James Version
- Scripture interprets Scripture methodology

## Prompt Components

### 1. System Prompts (`system/systemPrompts.ts`)

The main system prompt builder for conversational Bible study:

- **Function:** `buildSystemPrompt(strategy, options)`
- **Modes:** `exegesis_long` (deep study), `go_deeper_short` (brief handoff)
- **Strategy Elements:**
  - **Intent:** deep_study | handoff | connection
  - **Tone:** reverent | narrative | forensic | contemplative | urgent
  - **Cadence:** short | medium | long
  - **Device:** contrast | parallelism | question | micro-story | imagery

**Components Included:**

1. `CORE_CONSTRAINTS` - KJV-only, Scripture interprets Scripture, conversational tone
2. `CONVERSATIONAL_GUIDANCE` - Warm teaching voice, natural language
3. `FORMAT_UNIFIED` - Adaptive response structure (2-6 paragraphs)
4. `buildStyleDirective()` - Dynamic tone/cadence/device based on deterministic hash
5. Few-shot examples showing quality standards

### 2. Specialized Message Prompts (`messages/`)

These prompts inherit the core identity but add specialized constraints:

#### **Synopsis** (`synopsis.ts`)

- **Version:** V1
- **Builder:** `buildSynopsisSystemPrompt(maxWords)`
- **Purpose:** Brief scriptural insights for highlighted text
- **Constraints:** Concise (default 34 words), KJV diction, no speculation

#### **Root Translation** (`root-translation.ts`)

- **Version:** V2
- **Builder:** `buildRootTranslationSystemPrompt()`
- **Purpose:** "Lost in Translation" analysis using Strong's Concordance
- **Constraints:** 1-2 sentences, focus on Hebrew/Greek nuances, revelation surface

#### **Semantic Connection** (`semantic-connection.ts`)

- **Version:** V2 (updated 2026-01-23)
- **Builder:** `buildSemanticConnectionSystemPrompt()`
- **Purpose:** Explain connections between verses
- **Constraints:** Concise (target 34 words), connection type awareness, quote short clauses
- **Note:** V2 migrated from custom identity to centralized `BIBLE_STUDY_IDENTITY`

## Endpoint-to-Prompt Mapping

### API Endpoints and Their Prompts

| Endpoint                                 | File                            | Prompt Used                            | Mode/Type       | Voice                   |
| ---------------------------------------- | ------------------------------- | -------------------------------------- | --------------- | ----------------------- |
| `POST /api/bible-study`                  | `routes/bible-study.ts`         | `buildSystemPrompt()`                  | go_deeper_short | Conversational teaching |
| `POST /api/chat/stream`                  | `index.ts`                      | `buildSystemPrompt()`                  | exegesis_long   | Conversational teaching |
| `POST /api/trace`                        | `index.ts` (trace flow)         | `buildSystemPrompt()`                  | exegesis_long   | Conversational teaching |
| `POST /api/synopsis`                     | `routes/synopsis.ts`            | `SYNOPSIS_V1.buildSystem()`            | Specialized     | Conversational brief    |
| `POST /api/root-translation`             | `routes/root-translation.ts`    | `ROOT_TRANSLATION_V2.buildSystem()`    | Specialized     | Conversational brief    |
| `POST /api/semantic-connection/synopsis` | `routes/semantic-connection.ts` | `SEMANTIC_CONNECTION_V2.buildSystem()` | Specialized     | Conversational brief    |

**Expanding Ring Exegesis Engine:**

- File: `bible/expandingRingExegesis.ts`
- Uses: `buildSystemPrompt()` with `exegesis_long` mode (default)
- Two code paths: pre-built bundle path, fresh tree build path
- Both use centralized prompt architecture

## Design Patterns

### Creating New Specialized Prompts

Follow this pattern (see `synopsis.ts` or `root-translation.ts` as examples):

```typescript
/**
 * [Feature Name] Prompt Templates
 * Version: 1.0
 * Updated: YYYY-MM-DD
 */

import { BIBLE_STUDY_IDENTITY } from "../constants/identities";

/**
 * Builds the system prompt for [feature]
 */
export function build[Feature]SystemPrompt(params?: any): string {
  return `${BIBLE_STUDY_IDENTITY}

You are [specific task description].

CRITICAL CONSTRAINTS:
- [Specialized constraint 1]
- [Specialized constraint 2]
- [etc.]

[Additional guidance specific to this feature]`;
}

/**
 * Versioned prompt configuration
 */
export const [FEATURE]_V1 = {
  version: "1.0",
  updated: "YYYY-MM-DD",
  buildSystem: build[Feature]SystemPrompt,
};
```

**Key Principles:**

1. **Always start with `BIBLE_STUDY_IDENTITY`** - Never create custom identities
2. **Add specialized constraints AFTER the identity** - Build on the foundation
3. **Use builder functions** - Avoid hardcoded strings
4. **Version your prompts** - Use V1, V2, etc. with timestamps
5. **Export both old and new versions** - Maintain backward compatibility during migrations

### Maintaining Voice Consistency

**DO:**

- Use `BIBLE_STUDY_IDENTITY` as the foundation for all prompts
- Keep the warm, conversational teaching voice
- Speak with conviction rooted in Scripture
- Use KJV diction and declarative language
- Let specialized constraints be additive, not replacement

**DON'T:**

- Create custom identities that diverge from the core voice
- Use clinical/academic language that feels distant
- Mix tentative language ("could," "may," "might") unless the text requires it
- Hardcode system prompts inline in route handlers
- Skip versioning when updating prompts

## Version History

### 2026-01-23 (Version 2.0)

- **Major Identity Update:** Enhanced `BIBLE_STUDY_IDENTITY` to be more conversational and embodied
- **Prompt Restructure:** Reorganized `CORE_CONSTRAINTS` to lead with identity and calling
- **Conversational Guidance:** Added `CONVERSATIONAL_GUIDANCE` section for natural teaching voice
- **Simplified Constraints:** Reduced avoid phrases from 60+ to 15 essentials
- **Semantic Connection Migration:** Updated to V2 using centralized identity

### 2026-01-01 (Version 1.0)

- Initial centralized prompt architecture
- Created `BIBLE_STUDY_IDENTITY` constant
- Implemented `buildSystemPrompt()` with strategy-based variation
- Established synopsis, root translation V1 prompts

## Testing Voice Consistency

When updating or adding prompts, test across all features:

1. **Ask a Bible study question** - Note the voice and warmth
2. **View a tooltip synopsis** - Should feel like the same teacher
3. **Check root translation** - Should maintain teaching conviction
4. **View semantic connections** - Should have consistent warmth
5. **Trace a verse** - Should feel like continuing the same conversation

All responses should feel like they come from the same devoted disciple teaching Scripture.

## Related Files

- **Identity:** `constants/identities.ts` - Core `BIBLE_STUDY_IDENTITY`
- **System Prompts:** `system/systemPrompts.ts` - Main prompt builder
- **Message Prompts:** `messages/*.ts` - Specialized prompts
- **Index:** `index.ts` - Central export point
- **Few-Shot Examples:** `constants/fewShotExamples.ts` - Quality standards

## Future Considerations

- Consider creating a `buildUser()` pattern for semantic connections (currently inline in route)
- Evaluate if additional connection types need specific guidance
- Monitor user feedback on conversational warmth vs. authoritative teaching balance
- Track token usage across different prompt versions for optimization
