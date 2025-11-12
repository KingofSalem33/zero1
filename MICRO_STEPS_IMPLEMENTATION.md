# Micro-Steps Implementation Plan

## Overview

Converting from "do everything at once" → "plan → approve → execute one micro-task at a time"

## What Changed

### Problem

- Users feel overwhelmed by AI doing too much at once
- No control over pace or direction
- Can't pause/resume easily
- Black box execution

### Solution: 3-Phase Micro-Step Flow

```
┌─────────────────────────────────────────────────────────────┐
│ PHASE 1: PLAN (Show first, don't execute)                   │
├─────────────────────────────────────────────────────────────┤
│ AI: "Here's what we'll do:                                   │
│  1. Research Minnesota cottage food laws (2 min)             │
│  2. Create compliance checklist (3 min)                      │
│  3. Find kitchen equipment options (2 min)                   │
│                                                              │
│  Sound good? Or want to adjust?"                             │
│                                                              │
│ [Approve Plan] [Modify]                                      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ PHASE 2: EXECUTE (One micro-step at a time)                 │
├─────────────────────────────────────────────────────────────┤
│ Micro-Step 1: Research Minnesota cottage food laws          │
│                                                              │
│ AI: *Does research* *Finds regulations* *Summarizes*        │
│                                                              │
│ ✅ Done! Found:                                             │
│ - Home kitchen permit: $50/year                             │
│ - Food handler cert: $15                                    │
│ - Cottage food license: Free in MN                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ PHASE 3: CHECKPOINT (Celebrate + Preview)                   │
├─────────────────────────────────────────────────────────────┤
│ ✨ Great work! You now know the legal requirements.          │
│                                                              │
│ Next: Create your compliance checklist (3 min)              │
│                                                              │
│ [Continue] [Take a Break]                                   │
└─────────────────────────────────────────────────────────────┘
```

## Database Changes

### New Table: `micro_steps`

```sql
CREATE TABLE micro_steps (
  id UUID PRIMARY KEY,
  step_id UUID REFERENCES roadmap_steps(id),
  micro_step_number INT,
  title TEXT,                    -- "Research Minnesota cottage food laws"
  description TEXT,              -- Detailed description
  estimated_duration TEXT,       -- "2-3 minutes"
  acceptance_criteria TEXT[],
  status TEXT,                   -- pending | in_progress | completed | skipped
  created_at TIMESTAMP,
  completed_at TIMESTAMP
);
```

### Modified Table: `roadmap_steps`

```sql
ALTER TABLE roadmap_steps ADD COLUMN:
- plan_status TEXT               -- not_generated | generated | approved | rejected
- current_micro_step INT         -- 0 = show plan, 1+ = executing micro-step
```

## Implementation Steps

### ✅ Step 1: Database Migration

**File:** `apps/api/supabase/migrations/20250203_micro_steps.sql`

**Action Required:**

1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of migration file
3. Run migration

### 🔄 Step 2: Prompt Templates (In Progress)

**File:** `apps/api/src/infrastructure/ai/PromptTemplates.ts`

Add new method:

```typescript
static microStepGeneration(
  stepTitle: string,
  stepDescription: string,
  acceptanceCriteria: string[],
  projectGoal: string
): string {
  return `Break this step into 3-5 micro-tasks...`;
}
```

### 📋 Step 3: Micro-Step Service

**File:** `apps/api/src/domain/projects/services/MicroStepService.ts` (NEW)

Methods:

- `generateMicroStepPlan()` - LLM generates 3-5 micro-steps
- `approvePlan()` - User approves generated plan
- `rejectPlan()` - User requests regeneration
- `getMicroStepsForStep()` - Fetch micro-steps

### 🎯 Step 4: Execution Service Updates

**File:** `apps/api/src/domain/projects/services/ExecutionService.ts`

Changes:

- Remove "IMMEDIATE ACTION PROTOCOL"
- Add micro-step-aware execution
- Execute ONE micro-step at a time
- Return checkpoint data after each

### 🔌 Step 5: API Endpoints

**File:** `apps/api/src/routes/roadmap-v2.ts`

New endpoints:

```
POST /api/v2/projects/:id/steps/:stepId/generate-plan
POST /api/v2/projects/:id/steps/:stepId/approve-plan
POST /api/v2/projects/:id/steps/:stepId/execute-micro-step
GET  /api/v2/projects/:id/steps/:stepId/micro-steps
```

### 🎨 Step 6: Frontend UI

**File:** `apps/web/src/components/UnifiedWorkspace.tsx`

Add UI states:

- `showing_plan` - Display plan for approval
- `executing_micro_step` - Show current micro-step progress
- `checkpoint` - Show celebration + next preview

## User Flow Example

1. **User clicks on Step 2: "Set Up Development Environment"**

2. **System generates plan** (behind the scenes)

   ```
   POST /api/v2/projects/{id}/steps/{stepId}/generate-plan
   →  Returns 3-5 micro-steps
   ```

3. **UI shows plan for approval:**

   ```
   "Here's our plan:
    1. Install Git and create repo (5 min)
    2. Set up Node.js and npm (3 min)
    3. Deploy Hello World to Vercel (4 min)

    [Start Building] [Modify Plan]"
   ```

4. **User clicks "Start Building"**

   ```
   POST /api/v2/projects/{id}/steps/{stepId}/approve-plan
   ```

5. **Execute Micro-Step 1:**

   ```
   POST /api/v2/projects/{id}/steps/{stepId}/execute-micro-step
   { "micro_step_number": 1 }
   ```

6. **AI completes micro-step 1, UI shows checkpoint:**

   ```
   "✅ Git is set up! Your repo: github.com/you/project

   Next: Install Node.js (3 min)

   [Continue] [Take a Break]"
   ```

7. **User clicks "Continue" → Execute Micro-Step 2**

## Benefits

✅ **User feels in control** - Sees plan before committing
✅ **Clear progress** - 1 micro-step = 1 visible win
✅ **Natural pauses** - Can stop after any micro-step
✅ **No overwhelm** - Bite-sized 2-5 minute chunks
✅ **Momentum building** - Frequent celebrations

## Testing Plan

1. Create test project
2. Navigate to Step 2
3. Verify plan generation
4. Approve plan
5. Execute first micro-step
6. Verify checkpoint appears
7. Continue to next micro-step
8. Complete all micro-steps
9. Verify step marked complete

## Rollback Plan

If issues arise:

- Database migration is additive (doesn't break existing data)
- Can toggle feature flag to use old execution flow
- Micro-steps are optional (falls back to full step execution)

---

**Status:** Database migration ready, code implementation in progress
**Next:** Apply migration, then implement services & endpoints
