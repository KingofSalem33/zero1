# Orchestrator Refactoring Plan

**Current Problem:** `orchestrator.ts` is 2,190 lines with 19 methods doing too many things

**Goal:** Modularize into focused, testable services following Domain-Driven Design

---

## Current Structure (Anti-Pattern)

```
StepOrchestrator (2,190 lines)
├── Project creation
├── Phase generation
├── Substep generation
├── Master prompt generation
├── Step execution (streaming + non-streaming)
├── Completion handling
├── Project persistence
└── Phase expansion
```

**Problems:**

1. Hard to test (mocking nightmare)
2. Hard to understand (too many responsibilities)
3. Hard to extend (everything coupled)
4. **Bugs hide in complexity** (completion sync gap was invisible!)

---

## Proposed Modular Architecture

### Directory Structure

```
apps/api/src/
├── domain/                          # Core business logic
│   └── projects/
│       ├── entities/
│       │   ├── Project.ts           # Project entity (already exists)
│       │   ├── Phase.ts             # Phase value object
│       │   └── Substep.ts           # Substep value object
│       ├── services/
│       │   ├── ProjectCreationService.ts      # NEW: Create projects
│       │   ├── PhaseGenerationService.ts      # NEW: Generate phases
│       │   ├── SubstepGenerationService.ts    # NEW: Generate substeps
│       │   ├── CompletionService.ts           # NEW: Handle completion logic
│       │   └── ExecutionService.ts            # NEW: Execute steps with LLM
│       └── repositories/
│           └── IProjectRepository.ts
│
├── application/                     # Use cases (orchestration layer)
│   └── projects/
│       ├── use-cases/
│       │   ├── CreateProjectUseCase.ts        # Already exists
│       │   ├── ExecuteStepUseCase.ts          # NEW: Orchestrate step execution
│       │   ├── CompleteSubstepUseCase.ts      # Already exists
│       │   ├── GeneratePhasesUseCase.ts       # NEW: Orchestrate phase generation
│       │   └── ExpandPhaseUseCase.ts          # NEW: Orchestrate phase expansion
│       └── orchestrators/
│           └── StepOrchestrator.ts            # REFACTORED: Thin orchestrator
│
├── infrastructure/                  # External dependencies
│   ├── ai/
│   │   ├── OpenAIClient.ts          # NEW: Wrap OpenAI SDK
│   │   ├── PromptTemplates.ts       # NEW: All prompt templates
│   │   └── StreamingService.ts      # NEW: Handle SSE streaming
│   └── persistence/
│       └── supabase/
│           └── SupabaseProjectRepository.ts
│
└── services/                        # Shared services (already exists)
    ├── completionDetector.ts        # Keep as-is
    ├── projectStateManager.ts       # Keep as-is
    └── threadService.ts             # Keep as-is
```

---

## Refactored Modules

### 1. ProjectCreationService

**Responsibility:** Create new projects with initial roadmap

**File:** `apps/api/src/domain/projects/services/ProjectCreationService.ts`

**Methods:**

- `createProject(goal: string): Promise<Project>`
- `createProjectWithId(id: string, goal: string): Promise<Project>`
- `generateInitialRoadmap(goal: string): Promise<Phase[]>`

**Extracted from orchestrator.ts:**

- Lines 40-101: `createProjectWithPhase1()`
- Lines 104-106: `createProject()`
- Lines 109-167: `createProjectWithId()`

**Dependencies:**

- `PhaseGenerationService` (to generate phases)
- `SubstepGenerationService` (to expand Phase 1)
- `IProjectRepository` (to persist)

**Size:** ~200 lines

---

### 2. PhaseGenerationService

**Responsibility:** Generate project-specific phases (P1-P7)

**File:** `apps/api/src/domain/projects/services/PhaseGenerationService.ts`

**Methods:**

- `generatePhases(goal: string, context?: string): Promise<Phase[]>`
- `generateFallbackPhases(): Phase[]`

**Extracted from orchestrator.ts:**

- Lines 170-334: `generatePhases()`
- Lines 335-460: `generateFallbackPhases()`

**Dependencies:**

- `OpenAIClient` (for LLM calls)
- `PromptTemplates.phaseGeneration`

**Size:** ~300 lines

---

### 3. SubstepGenerationService

**Responsibility:** Expand phases into actionable substeps

**File:** `apps/api/src/domain/projects/services/SubstepGenerationService.ts`

**Methods:**

- `generateSubsteps(phase: Phase, goal: string): Promise<Substep[]>`
- `getMasterPrompt(phaseId: string, userVision: string): Promise<string>`
- `getPhaseConstraints(phaseId: string): string`
- `getFallbackSubsteps(phaseId: string): Substep[]`

**Extracted from orchestrator.ts:**

- Lines 461-616: `expandPhaseWithSubsteps()`
- Lines 617-668: `getPhaseConstraints()`
- Lines 669-789: `getMasterPromptForPhase()`
- Lines 790-883: `getFallbackMasterPrompt()`
- Lines 884-1434: `getFallbackSubsteps()`

**Dependencies:**

- `OpenAIClient`
- `PromptTemplates.substepGeneration`

**Size:** ~600 lines (lots of domain-specific logic)

---

### 4. CompletionService

**Responsibility:** Detect and handle substep/phase completion

**File:** `apps/api/src/domain/projects/services/CompletionService.ts`

**Methods:**

- `detectCompletion(substep: Substep, messages: Message[]): CompletionConfidence`
- `completeSubstep(projectId: string, phaseId: string, substepNum: number): Promise<CompletionResult>`
- `generateBriefing(project: Project, completed: Substep, next: Substep): Promise<string>`
- `shouldAutoComplete(confidence: CompletionConfidence): boolean`

**Extracted from orchestrator.ts:**

- Lines 1435-1567: `completeSubstep()`

**Dependencies:**

- `CompletionDetector` (already exists)
- `ProjectStateManager` (already exists)
- `CelebrationBriefingHelper` (already exists)

**Size:** ~200 lines

---

### 5. ExecutionService

**Responsibility:** Execute steps with LLM (streaming and non-streaming)

**File:** `apps/api/src/domain/projects/services/ExecutionService.ts`

**Methods:**

- `executeStep(project: Project, prompt: string, userMessage: string): Promise<ExecutionResult>`
- `executeStepStreaming(project: Project, prompt: string, userMessage: string, res: Response): Promise<void>`
- `buildSystemMessage(project: Project, substep: Substep): string`
- `detectAndHandleCompletion(project: Project, messages: Message[], response: string): Promise<CompletionAction>`

**Extracted from orchestrator.ts:**

- Lines 1710-1821: `executeStep()`
- Lines 1822-2107: `executeStepStreaming()`

**Dependencies:**

- `OpenAIClient`
- `StreamingService`
- `ThreadService`
- `CompletionService`
- `CompletionDetector`

**Size:** ~400 lines

**Key Addition:**

```typescript
// NEW: This is where we fix the completion sync gap!
private async detectAndHandleCompletion(
  project: Project,
  messages: Message[],
  aiResponse: string
): Promise<CompletionAction> {
  const currentSubstep = this.getCurrentSubstep(project);

  // Analyze for completion
  const confidence = completionDetector.analyzeCompletion(
    currentSubstep,
    messages
  );

  // Check for explicit requests
  const explicitRequest = messages.some(m =>
    completionDetector.isExplicitCompletionRequest(m.content)
  );

  if (explicitRequest || confidence.recommendation === "ready_to_complete") {
    // Auto-complete the substep
    const result = await this.completionService.completeSubstep(
      project.id,
      currentSubstep.phase_id,
      currentSubstep.step_number
    );

    return {
      action: "completed",
      result,
      nudgeMessage: null
    };
  } else if (confidence.recommendation === "suggest_complete") {
    return {
      action: "nudge",
      result: null,
      nudgeMessage: confidence.nudge_message
    };
  }

  return {
    action: "none",
    result: null,
    nudgeMessage: null
  };
}
```

---

### 6. OpenAIClient (Infrastructure)

**Responsibility:** Wrap OpenAI SDK with app-specific logic

**File:** `apps/api/src/infrastructure/ai/OpenAIClient.ts`

**Methods:**

- `chat(messages: Message[], options?: ChatOptions): Promise<string>`
- `chatStream(messages: Message[], options?: ChatOptions): AsyncIterator<string>`
- `chatWithStructuredOutput<T>(messages: Message[], schema: JSONSchema): Promise<T>`

**Replaces:** Scattered `makeOpenAI()` and `runModel()` calls

**Benefits:**

- Centralized error handling
- Centralized retry logic
- Easy to mock for testing
- Easy to swap providers (Anthropic, etc.)

**Size:** ~150 lines

---

### 7. PromptTemplates (Infrastructure)

**Responsibility:** All prompt templates in one place

**File:** `apps/api/src/infrastructure/ai/PromptTemplates.ts`

**Content:**

```typescript
export const PromptTemplates = {
  phaseGeneration: (goal: string) => `...`,
  substepGeneration: (phase: Phase, goal: string) => `...`,
  masterPromptGeneration: (phaseId: string, vision: string) => `...`,
  executionSystem: (project: Project, substep: Substep) => `...`,
  completionBriefing: (completed: Substep, next: Substep) => `...`,
};
```

**Benefits:**

- Easy to version control prompts
- Easy to A/B test prompts
- Prompts visible in one place
- Can be moved to database later

**Size:** ~300 lines (mostly text)

---

### 8. StreamingService (Infrastructure)

**Responsibility:** Handle SSE streaming with proper events

**File:** `apps/api/src/infrastructure/ai/StreamingService.ts`

**Methods:**

- `sendEvent(res: Response, event: string, data: any): void`
- `sendContent(res: Response, delta: string): void`
- `sendStatus(res: Response, message: string): void`
- `sendToolCall(res: Response, tool: string, args: any): void`
- `sendCompletionNudge(res: Response, nudge: CompletionNudge): void` ← **NEW**
- `sendSubstepCompleted(res: Response, completion: CompletionResult): void` ← **NEW**

**Benefits:**

- Consistent SSE event format
- Type-safe event sending
- Easy to add new event types (fixing completion sync!)

**Size:** ~100 lines

---

### 9. Refactored StepOrchestrator (Thin Orchestrator)

**File:** `apps/api/src/application/projects/orchestrators/StepOrchestrator.ts`

**New Size:** ~200 lines (down from 2,190!)

**Role:** Coordinate services, don't do the work

**Methods:**

```typescript
class StepOrchestrator {
  constructor(
    private projectCreationService: ProjectCreationService,
    private executionService: ExecutionService,
    private completionService: CompletionService,
    public stateManager: ProjectStateManager,
  ) {}

  // Delegate to services
  async createProject(goal: string): Promise<Project> {
    return this.projectCreationService.createProject(goal);
  }

  async executeStepStreaming(request: ExecutionRequest): Promise<void> {
    const project = await this.getProjectAsync(request.project_id);
    return this.executionService.executeStepStreaming(project, request);
  }

  async completeSubstep(request: CompletionRequest): Promise<CompletionResult> {
    return this.completionService.completeSubstep(
      request.project_id,
      request.phase_id,
      request.substep_number,
    );
  }

  // Thin orchestration methods...
}
```

---

## Migration Plan

### Phase 1: Extract Services (2 days)

**Day 1:**

1. Create `OpenAIClient` wrapper
2. Create `PromptTemplates` file
3. Create `StreamingService` with new completion events
4. Update all usages to use new services

**Day 2:** 5. Extract `PhaseGenerationService` 6. Extract `SubstepGenerationService` 7. Update tests

### Phase 2: Extract Execution & Completion (2 days)

**Day 3:** 8. Extract `ExecutionService` with completion detection 9. Extract `CompletionService` 10. Wire up auto-completion logic ← **Fixes the sync gap!**

**Day 4:** 11. Extract `ProjectCreationService` 12. Refactor `StepOrchestrator` to be thin 13. Update all route handlers

### Phase 3: Test & Polish (1 day)

**Day 5:** 14. Write unit tests for each service 15. Write integration tests 16. Update frontend to handle new SSE events 17. Documentation

---

## Benefits of Modularization

### 1. Easier to Test

```typescript
// Before: Must mock entire orchestrator
const orchestrator = new StepOrchestrator();
// 50 lines of mocking...

// After: Test one service in isolation
const service = new CompletionService(mockDetector, mockStateManager);
expect(service.detectCompletion(...)).toBe(...);
```

### 2. Easier to Debug

```typescript
// Before: Breakpoint in 2,190-line file, good luck
// After: Breakpoint in focused 200-line service
```

### 3. Easier to Extend

```typescript
// Want to add Anthropic support?
// Before: Modify 20 places in orchestrator
// After: Implement OpenAIClient interface
class AnthropicClient implements ILLMClient {
  async chat(...) { ... }
}
```

### 4. Completion Sync Gap is Obvious

```typescript
// In ExecutionService.executeStepStreaming():
const aiResponse = await this.streamResponse(res, messages);

// NEW: This is now an obvious required step!
const completionAction = await this.detectAndHandleCompletion(
  project,
  messages,
  aiResponse,
);

if (completionAction.action === "completed") {
  this.streamingService.sendSubstepCompleted(res, completionAction.result);
} else if (completionAction.action === "nudge") {
  this.streamingService.sendCompletionNudge(res, completionAction.nudge);
}
```

**The gap was invisible in 2,190 lines. It's obvious in 50 lines.**

### 5. Follows DDD Architecture

```
domain/          ← Business logic (pure, testable)
application/     ← Use cases (orchestration)
infrastructure/  ← External dependencies (swappable)
```

---

## Impact on Completion Sync Gap

**Refactoring directly solves the sync gap because:**

1. **ExecutionService** will have clear responsibility: "After LLM responds, check for completion"
2. **CompletionService** will have all completion logic in one place
3. **StreamingService** will make it obvious we need `completion_detected` events
4. **Smaller files** = bugs can't hide in complexity

**Current code hides the gap:**

```typescript
// orchestrator.ts line 1937 (buried in 2,190 lines)
if (isExplicitCompletionRequest(msg)) {
  console.log("detected"); // ← Easy to miss this does nothing!
}
```

**Refactored code makes gap obvious:**

```typescript
// ExecutionService.ts line 45 (in focused 400-line file)
async executeStepStreaming(...) {
  const response = await this.streamLLM(...);

  // ⚠️ TODO: Handle completion detection!
  // This is obviously missing!

  return response;
}
```

---

## Recommendation

**Yes, modularize first, then fix the gap.**

**Why this order:**

1. Fixing the gap in current 2,190-line file = adding more complexity
2. Modularizing first = the gap fix becomes trivial
3. You'll fix other hidden bugs during refactoring
4. Future features will be 10x easier to add

**Estimated effort:**

- Modularization: 5 days
- Completion sync fix (after modularization): 4 hours ← **Much faster!**

**Alternative (not recommended):**

- Fix gap in current orchestrator: 1-2 days
- Still have 2,190-line God Object
- Next bug will be equally hard to find

---

## Decision

**Should we modularize?**

✅ **YES** - The orchestrator is too large and violates SRP

**When?**

Option A: **Now** (before fixing completion gap)

- Pros: Clean architecture, gap fix is trivial
- Cons: 5-day investment

Option B: **Later** (after quick gap fix)

- Pros: Quick win for users
- Cons: Technical debt grows, harder to refactor later

**My recommendation: Option A (modularize now)**

The completion sync gap is just **one symptom** of the larger problem. Fixing it without refactoring is like putting a band-aid on a broken leg.

Shall I proceed with the modularization?
