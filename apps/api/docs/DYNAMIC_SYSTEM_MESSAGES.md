# Dynamic System Messages - Roadmap-Aware AI

## Overview

The dynamic system message system ensures the LLM is **always roadmap-aware** by building fresh context on every AI turn. This solves the problem of the AI losing track of progress mid-step.

## Problem Statement

**Before:** Master prompts were static - generated once at roadmap creation and stored in the database. When a user partially completed a substep (e.g., installed Node.js but hadn't created package.json yet), the AI had no awareness of this partial progress.

**After:** Every AI turn fetches the current step, analyzes the conversation history, and builds a dynamic system message showing:
- What's been completed in this conversation
- Progress against acceptance criteria (✅ DONE vs ⏳ NEEDED)
- What specific work remains
- Real-time guidance on next actions

## Architecture

### Components

1. **ConversationAnalyzer** (`ConversationAnalyzer.ts`)
   - Analyzes conversation history to extract completed work
   - Tracks progress against acceptance criteria
   - Identifies artifacts, tech decisions, and active work
   - Calculates completion percentage

2. **DynamicPromptBuilder** (`DynamicPromptBuilder.ts`)
   - Builds fresh system messages on every AI turn
   - Injects real-time progress tracking
   - Provides next-action guidance based on current state
   - Formats acceptance criteria with status indicators

3. **ExecutionService** (`ExecutionService.ts`)
   - Orchestrates the dynamic message generation
   - Fetches conversation history from threadService
   - Falls back to static messages when threads unavailable

## How It Works

### Every AI Turn:

```
1. User sends message
   ↓
2. ExecutionService receives request with current_step_context
   ↓
3. Fetch recent conversation messages (last 20)
   ↓
4. ConversationAnalyzer.analyzeProgress()
   - Extract completed work from conversation
   - Check each acceptance criterion for evidence
   - Calculate completion percentage
   ↓
5. DynamicPromptBuilder.buildSystemMessage()
   - Inject master prompt (phase-level guidance)
   - Add current substep details
   - Add REAL-TIME PROGRESS section showing:
     * Completed work: "✅ Installed Node.js v18.20.0"
     * Acceptance criteria status:
       [✅ DONE] Node.js 18+ installed
       [⏳ NEEDED] package.json created
       [⏳ NEEDED] npm install runs successfully
     * Next action guidance: "Complete: Create package.json"
   - Add execution guidelines
   ↓
6. Send to LLM with fresh, roadmap-aware context
   ↓
7. LLM responds with focused guidance on remaining work
```

### Example Dynamic System Message

```
You are helping with project execution.
...
[Master prompt content here]
...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🎯 CURRENT SUBSTEP (1): Install Node.js and Initialize Project

**Description:** Set up Node.js development environment and create package.json

**ACCEPTANCE CRITERIA:**
1. [✅ DONE] Node.js 18+ installed
   Evidence: "installed Node.js v18.20.0 successfully"
2. [⏳ NEEDED] package.json created with project metadata
3. [⏳ NEEDED] npm install runs successfully

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 📊 REAL-TIME PROGRESS IN THIS SUBSTEP (33% COMPLETE)

**Completed:**
- Installed Node.js v18.20.0
- Verified npm is working

**Still Needed:**
⏳ package.json created with project metadata
⏳ npm install runs successfully

**📍 YOU'RE MAKING PROGRESS!** Focus on completing the remaining criteria:
- package.json created with project metadata
- npm install runs successfully

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🔨 YOUR EXECUTION GUIDELINES:

**YOUR JOB RIGHT NOW:**
Complete the next acceptance criterion: "package.json created with project metadata".
Use your tools to execute this work directly.

**EXECUTION STYLE:**
- Be a DOER, not a guide
- Focus ONLY on THIS substep's remaining criteria
- Use tools immediately (Write, Edit, Bash)
- Report: "✅ [what you did]" after each action
- DO NOT jump ahead to future substeps

**START EXECUTING THE NEXT NEEDED ACTION NOW.**
```

## Key Features

### 1. Mid-Step Resume
The LLM can resume exactly where it left off, even mid-step. If the user installed Node.js yesterday and comes back today, the AI knows Node.js is done and focuses on package.json.

### 2. Progress Indicators
Every acceptance criterion shows its status:
- `[✅ DONE]` - Criterion satisfied (with evidence)
- `[⏳ NEEDED]` - Criterion not yet addressed

### 3. Evidence Extraction
When criteria are marked DONE, the system includes evidence:
```
[✅ DONE] Node.js 18+ installed
   Evidence: "installed Node.js v18.20.0 successfully"
```

### 4. Completion Percentage
Real-time calculation: `(satisfied_criteria / total_criteria) * 100`

### 5. Next Action Guidance
Automatically determines what to focus on:
- All complete: "🎉 ALL CRITERIA SATISFIED!"
- 50%+ complete: "📍 YOU'RE HALFWAY THERE! Focus on..."
- <50% complete: "🚀 NEXT ACTIONS: Complete these criteria..."

### 6. Smart Criterion Detection
Uses keyword matching to detect when criteria are satisfied:
- Extracts key terms from criterion (ignoring stop words)
- Checks if 60%+ of key terms appear in conversation
- Finds evidence (specific sentence mentioning the work)

## Fallback Behavior

If threads are unavailable or conversation history can't be fetched, the system falls back to **static system messages** (the original behavior). This ensures backward compatibility.

## Integration Points

### ExecutionService.executeStepStreaming()
Lines 149-208: Dynamic system message construction

```typescript
if (request.current_step_context && useThreads && thread) {
  // Build dynamic message with real-time progress
  const conversationMessages = await threadService.getRecentMessages(thread.id, 20);
  systemMessage = dynamicPromptBuilder.buildSystemMessage({
    project_goal: project.goal,
    current_substep: request.current_step_context,
    master_prompt: request.master_prompt,
    conversation_messages: conversationMessages,
    completed_steps_summary: completedSteps,
  });
} else {
  // Fallback to static message
  systemMessage = this.buildStaticSystemMessage(request, completedSteps);
}
```

### roadmap-v2.ts: /api/v2/projects/:id/execute-step
Lines 897-908: Passes current_step_context to ExecutionService

```typescript
await executionService.executeStepStreaming({
  project_id: id,
  master_prompt,
  user_message: user_message || "",
  res,
  current_step_context: {
    step_number: currentStep.step_number,
    title: currentStep.title,
    description: currentStep.description,
    acceptance_criteria: currentStep.acceptance_criteria || [],
  },
});
```

## Configuration

### ConversationAnalyzer Settings

- **Message window:** Last 20 messages analyzed for recent work
- **Completion patterns:** `✅`, `completed`, `finished`, `created`, `installed`, etc.
- **Active work patterns:** `working on`, `currently`, `in progress`, `🔄`
- **Criterion match threshold:** 60% of key terms must match

### DynamicPromptBuilder Settings

- **Completion threshold:** 80%+ = likely complete
- **Progress milestones:**
  - 0-49%: "NEXT ACTIONS"
  - 50-99%: "HALFWAY THERE"
  - 100%: "ALL CRITERIA SATISFIED"

## Testing

To verify dynamic messages are working, check backend logs:

```
🧠 [ExecutionService] Building dynamic system message for Step 1
✅ [ExecutionService] Dynamic system message built with 8 messages analyzed
```

If you see static fallback:
```
⚠️ [ExecutionService] Using static system message (no substep context or threads)
```

## Benefits

1. **Never lose context** - AI always knows exactly where the user is
2. **Mid-step resume** - Can pick up after breaks without re-explaining
3. **Focus enforcement** - AI stays on current substep, doesn't jump ahead
4. **Progress visibility** - User and AI both see what's done/remaining
5. **Auto-advancement ready** - Completion detection uses same analysis

## Future Enhancements

- [ ] Artifact analysis integration (scan uploaded files)
- [ ] Tech stack tracking across phases
- [ ] Cumulative context (lessons from previous phases)
- [ ] User preference learning
- [ ] Smart criterion reordering based on dependencies
