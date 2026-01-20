# Surgical Implementation: Follow-Up Detection

## Goal

Prevent unnecessary anchor resolution and map rebuilding for contextual follow-up questions.

## Current Problem

When user asks "What does that mean?" with an existing map:

- `shouldReanchor` → `true` (no explicit verse reference)
- Triggers fast bundle build + background full map fetch
- Wasteful and slower than needed

## Solution Overview

Add `isContextualFollowUp()` check that, when true, forces use of existing bundle path.

---

## Files to Modify

### 1. `apps/web/src/components/UnifiedWorkspace.tsx`

**Change 1: Add follow-up detection function (~20 lines)**

Location: Near other utility functions (around line 1080)

```typescript
/**
 * Detect if a message is a contextual follow-up that doesn't need re-anchoring.
 * Returns true if the question references existing context without new verses.
 */
const isContextualFollowUp = useCallback(
  (message: string, hasBundle: boolean): boolean => {
    if (!hasBundle) return false;

    const normalized = message.trim().toLowerCase();
    const wordCount = normalized.split(/\s+/).length;

    // Short contextual questions (< 15 words, no verse references)
    const hasVerseRef = /\b\d?\s?[a-z]+\s+\d+:\d+/i.test(message);
    if (hasVerseRef) return false;

    // Pronoun-heavy (references prior context)
    const pronounPattern =
      /\b(it|that|this|these|those|the same|what you said|you mentioned)\b/i;
    const hasPronoun = pronounPattern.test(normalized);

    // Follow-up indicators
    const followUpPattern =
      /^(what|why|how|can you|could you|tell me|explain|more about|go deeper|elaborate|clarify|meaning|significance)/i;
    const isFollowUpPhrase = followUpPattern.test(normalized);

    // Short question with pronoun or follow-up phrase = contextual
    if (wordCount <= 15 && (hasPronoun || isFollowUpPhrase)) {
      return true;
    }

    // Very short questions are likely follow-ups
    if (wordCount <= 6 && !hasVerseRef) {
      return true;
    }

    return false;
  },
  [],
);
```

**Change 2: Modify `shouldReanchor` in `handleSendMessage` (~line 1535)**

Before:

```typescript
const shouldReanchor =
  !hasActiveBundle ||
  (!fullMapPending &&
    !shouldUseSuggested &&
    (!hasExplicitRef || offMapReferences.length > 0));
```

After:

```typescript
const isFollowUp = isContextualFollowUp(userMessage, hasActiveBundle);
const shouldReanchor =
  !hasActiveBundle ||
  (!fullMapPending &&
    !shouldUseSuggested &&
    !isFollowUp && // ← NEW: Don't reanchor for follow-ups
    (!hasExplicitRef || offMapReferences.length > 0));
```

**Change 3: Same modification in `pendingPrompt` useEffect (~line 1252)**

Before:

```typescript
const shouldReanchor =
  !bundleForMap ||
  (!fullMapPending && (!hasExplicitRef || offMapReferences.length > 0));
```

After:

```typescript
const isFollowUp = isContextualFollowUp(
  normalizedPrompt.displayText,
  !!bundleForMap,
);
const shouldReanchor =
  !bundleForMap ||
  (!fullMapPending &&
    !isFollowUp &&
    (!hasExplicitRef || offMapReferences.length > 0));
```

**Change 4: Same modification in `handleExploreReference` (~line 1851)**

Before:

```typescript
const shouldReanchor =
  !hasActiveBundle || (!fullMapPending && offMapReferences.length > 0);
```

After:

```typescript
const isFollowUp = isContextualFollowUp(reference, hasActiveBundle);
const shouldReanchor =
  !hasActiveBundle ||
  (!fullMapPending && !isFollowUp && offMapReferences.length > 0);
```

---

## Test Cases

| Input                          | hasBundle | Expected                            |
| ------------------------------ | --------- | ----------------------------------- |
| "What does that mean?"         | ✓         | `isFollowUp=true`, use bundle       |
| "Tell me more about the blood" | ✓         | `isFollowUp=true`, use bundle       |
| "Why is this significant?"     | ✓         | `isFollowUp=true`, use bundle       |
| "Go deeper"                    | ✓         | `isFollowUp=true`, use bundle       |
| "Explain it"                   | ✓         | `isFollowUp=true`, use bundle       |
| "John 3:16"                    | ✓         | `isFollowUp=false`, check if on-map |
| "What about Romans 8:28?"      | ✓         | `isFollowUp=false`, may reanchor    |
| "What is grace?"               | ✗         | `isFollowUp=false`, reanchor        |
| "Tell me about salvation"      | ✗         | `isFollowUp=false`, reanchor        |

---

## Implementation Order

1. Add `isContextualFollowUp` function
2. Update `handleSendMessage` (main chat flow)
3. Update `pendingPrompt` useEffect
4. Update `handleExploreReference`
5. Test each scenario

---

## Risks & Mitigations

**Risk**: False positive - user wants new topic but triggers follow-up path

- **Mitigation**: Verse references always bypass follow-up detection
- **Mitigation**: "Tell me about [topic]" with new topic words won't match pronouns

**Risk**: False negative - actual follow-up triggers reanchor

- **Mitigation**: Broad pattern matching for follow-up phrases
- **Mitigation**: Short questions (≤6 words) default to follow-up if no verse ref

---

## Success Metrics

- Follow-up questions with existing map: No `/api/trace` call
- Response latency for follow-ups: < 500ms to first token
- No regression in new topic handling

---

## Lines Changed

- ~30 lines new (function + modifications)
- 3 locations updated with same pattern
- No backend changes needed
