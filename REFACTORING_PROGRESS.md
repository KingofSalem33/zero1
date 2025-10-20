# Orchestrator Refactoring Progress

**Started:** 2025-01-19
**Goal:** Modularize 2,190-line orchestrator.ts into focused, testable services

---

## Phase 1: Infrastructure Layer ✅ COMPLETE

### Completed Files:

#### 1. `apps/api/src/infrastructure/ai/OpenAIClient.ts` ✅

- **Purpose:** Centralized OpenAI SDK wrapper
- **Features:**
  - Type-safe chat completions
  - Structured output support (JSON schema)
  - Tool calling support
  - Error handling and logging
  - Easy to mock for tests
  - Provider abstraction (easy to swap to Anthropic)

#### 2. `apps/api/src/infrastructure/ai/PromptTemplates.ts` ✅

- **Purpose:** All LLM prompts in one place
- **Templates:**
  - `phaseGeneration()` - Generate P1-P7 roadmap
  - `substepGeneration()` - Expand phases into substeps
  - `masterPromptGeneration()` - Generate expert guidance
  - `executionSystem()` - System message for step execution
  - `completionBriefing()` - Celebration + next step
  - `visionRefinement()` - Help users clarify ideas
  - `getPhaseConstraints()` - Domain-specific constraints
  - `getFallbackMasterPrompt()` - Fallback prompts

#### 3. `apps/api/src/infrastructure/ai/StreamingService.ts` ✅

- **Purpose:** Type-safe SSE event handling
- **Standard Events:**
  - `sendHeartbeat()` - Keep connection alive
  - `sendContent()` - Streaming text deltas
  - `sendStatus()` - Status updates
  - `sendToolCall()` / `sendToolResult()` / `sendToolError()` - Tool execution
  - `sendCitations()` - Search results
  - `sendDone()` - Stream completion
  - `sendError()` - Error handling

- **NEW Completion Events (Fixes Sync Gap!):**
  - `sendCompletionNudge()` - Suggest user mark complete
  - `sendSubstepCompleted()` - Auto-completion notification
  - `sendCompletionDetected()` - Inform without action

**Benefits:**

- Clean separation of concerns
- All prompts visible and versionable
- Type-safe event sending
- **Foundation for completion sync fix**

---

## Phase 2: Domain Services (IN PROGRESS)

### Next Tasks:

#### 4. Extract PhaseGenerationService

- Move phase generation logic from orchestrator
- Use `OpenAIClient` and `PromptTemplates`
- ~300 lines

#### 5. Extract SubstepGenerationService

- Move substep expansion logic
- ~600 lines (lots of domain logic)

#### 6. Extract ExecutionService **← CRITICAL FOR SYNC FIX**

- Move step execution logic
- **Add automatic completion detection**
- **Wire up new StreamingService events**
- ~400 lines

#### 7. Extract CompletionService

- Move completion handling logic
- Centralize all completion logic
- ~200 lines

#### 8. Extract ProjectCreationService

- Move project creation logic
- ~200 lines

---

## Phase 3: Refactor Orchestrator (TODO)

#### 9. Refactor StepOrchestrator to be thin

- Remove all business logic
- Delegate to services
- Reduce from 2,190 lines to ~200 lines

#### 10. Update route handlers

- Use new services
- Maintain backward compatibility

#### 11. Update tests

- Test each service in isolation
- Update integration tests

---

## Impact on Completion Sync Gap

### Before Refactoring:

```typescript
// orchestrator.ts line 1937 (buried in 2,190 lines)
if (completionDetector.isExplicitCompletionRequest(msg)) {
  console.log("detected"); // ← Does nothing!
}
```

### After Refactoring:

```typescript
// ExecutionService.ts (focused 400-line file)
async executeStepStreaming(...) {
  const response = await this.streamLLM(...);

  // ✅ OBVIOUS that completion detection is needed!
  const completion = await this.detectCompletion(project, messages, response);

  if (completion.action === "completed") {
    // Actually complete the substep
    const result = await this.completionService.complete(...);
    // Notify frontend
    this.streamingService.sendSubstepCompleted(res, result);
  } else if (completion.action === "nudge") {
    // Show suggestion
    this.streamingService.sendCompletionNudge(res, completion.nudge);
  }
}
```

**The gap becomes impossible to miss in small, focused files.**

---

## Estimated Time Remaining

- Phase 2: 3 days
- Phase 3: 2 days

**Total: 5 days** (1 day complete, 4 days remaining)

---

## Key Wins So Far

1. ✅ Centralized all prompts (easy to version/test)
2. ✅ Created completion event infrastructure
3. ✅ Type-safe AI client wrapper
4. ✅ Foundation for completion sync fix

Next session: Extract domain services and wire up completion detection!
