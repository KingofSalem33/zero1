# Artifact Iteration Memory Fix

## Problem

The artifact review system loses context between iterations. Each upload is treated as fresh, not building on previous feedback.

## Current Flow (BROKEN)

```
Upload 1 → AI: "Add brand colors" → User fixes → Upload 2 → AI: "Add brand colors" (FORGOT!)
```

## Fixed Flow (CUMULATIVE)

```
Upload 1 → AI: "Missing: colors, mission, fonts" → User adds colors
Upload 2 → AI: "✅ Colors added! Still missing: mission, fonts" → User adds mission
Upload 3 → AI: "✅ Colors + mission done! Just need fonts" → User adds fonts
Upload 4 → AI: "✅ ALL COMPLETE - ready for next substep"
```

## Key Changes Needed

### 1. **Iteration Context Builder** (NEW FILE)

Create comprehensive memory from all previous artifacts in THIS substep:

```typescript
// apps/api/src/services/iteration-context-builder.ts

interface IterationContext {
  iteration_number: number;
  substep_requirements: string[]; // What THIS substep needs
  previously_addressed: string[]; // What user already fixed
  still_missing: string[]; // What's still needed
  quality_progression: number[]; // [5, 6.5, 8, 9] - show improvement
  previous_feedback: string[]; // All past AI comments
  file_diff_summary: string; // What actually changed
}

export function buildIterationContext(
  artifacts: Artifact[],
  currentSubstep: Substep,
): IterationContext {
  // Analyze ALL artifacts for THIS substep chronologically
  // Track what was asked for vs what was delivered
  // Build cumulative memory
}
```

### 2. **Enhanced LLM Prompt**

Current prompt is stateless. Fix by injecting full iteration history:

```typescript
const systemPrompt = `You are analyzing artifact iteration ${ctx.iteration_number} for:
**Substep**: ${currentSubstep.label}
**Requirements**: ${ctx.substep_requirements.join(", ")}

**ITERATION HISTORY**:
${ctx.previous_feedback
  .map(
    (f, i) => `
Iteration ${i + 1}: ${f}
`,
  )
  .join("\n")}

**PROGRESS SO FAR**:
✅ Already addressed: ${ctx.previously_addressed.join(", ")}
⏳ Still missing: ${ctx.still_missing.join(", ")}
📈 Quality trend: ${ctx.quality_progression.join(" → ")}

**YOUR TASK**:
1. Acknowledge what the user ALREADY fixed (don't repeat old feedback!)
2. Focus ONLY on what's still missing from requirements
3. If everything is done → substep_completion_percentage: 100
4. Be specific about NEXT action (not everything)
`;
```

### 3. **Cumulative Roadmap Adjustments**

Current system resets progress. Fix by MERGING not REPLACING:

```typescript
// In artifacts.ts line 240:
const existingCompletions = project.completed_substeps || [];
const mergedCompletions = mergeCompletionResults(
  existingCompletions,
  roadmapDiff.completed_substeps,
);

// NEW: Also merge requirements status
const requirementsHistory = await buildRequirementsHistory(
  projectId,
  project.current_phase,
  project.current_substep,
);
```

### 4. **Conversation Thread Integration**

The AI chat needs to see artifact feedback too:

```typescript
// When user uploads artifact → save feedback to thread
await threadService.saveMessage(
  threadId,
  "system",
  `📤 Artifact uploaded (iteration ${iteration_number})

  AI Feedback: ${llmAnalysis.detailed_analysis}
  Missing: ${llmAnalysis.missing_elements.join(", ")}
  Progress: ${llmAnalysis.substep_completion_percentage}%`,
);

// Next chat message includes this context
```

### 5. **UI Feedback Display**

Show iteration progression visually:

```tsx
<ArtifactDiffModal>
  <IterationTimeline>
    <Iteration num={1} quality={5} feedback="Missing colors, mission, fonts" />
    <Iteration
      num={2}
      quality={6.5}
      feedback="✅ Colors added! Need mission, fonts"
    />
    <Iteration
      num={3}
      quality={8}
      feedback="✅ Colors + mission! Just fonts needed"
    />
    <Iteration num={4} quality={10} feedback="✅ COMPLETE!" status="success" />
  </IterationTimeline>
</ArtifactDiffModal>
```

## Implementation Priority

1. ✅ **HIGH**: Build iteration context (lines 165-212 in artifacts.ts)
2. ✅ **HIGH**: Enhance LLM prompt with full history
3. ✅ **MEDIUM**: Save feedback to conversation thread
4. ✅ **MEDIUM**: UI iteration timeline
5. ✅ **LOW**: Advanced diffing (word-level changes)

## Testing Flow

```bash
# Test cumulative memory:
1. Upload artifact with only 1/3 requirements met
   → AI: "Missing: X, Y, Z" (score: 5/10)

2. Upload artifact with 2/3 requirements met
   → AI: "✅ Good! X is fixed. Still need: Y, Z" (score: 7/10)

3. Upload artifact with 3/3 requirements met
   → AI: "✅ Perfect! All requirements met" (score: 10/10, auto-advance)
```

## Files to Modify

1. `apps/api/src/services/iteration-context-builder.ts` (NEW)
2. `apps/api/src/services/llm-artifact-analyzer.ts` (enhance prompt)
3. `apps/api/src/routes/artifacts.ts` (lines 165-212, add context)
4. `apps/web/src/components/ArtifactDiffModal.tsx` (add timeline UI)
5. `apps/api/src/services/threadService.ts` (save artifact feedback)

## Success Metrics

- ✅ AI never repeats already-fixed feedback
- ✅ User sees clear progression: 5/10 → 7/10 → 10/10
- ✅ Quality scores consistently increase per iteration
- ✅ Auto-advance only when 100% complete (not premature)
- ✅ User feels momentum: "getting closer each time"
