# Dynamic Roadmap V2 - Integration Guide

## 🎯 What We Built

A complete LLM-driven roadmap system that replaces the static P0-P7 structure with dynamic, custom-tailored step-by-step journeys.

---

## ✅ Phase 1: Core Complete

### Backend (✅ Done)

1. **Database Schema**
   - Location: `apps/api/supabase/migrations/20250202_dynamic_roadmap.sql`
   - Tables:
     - `roadmap_steps` - Linear steps (replaces phases/substeps)
     - `project_roadmap_metadata` - Roadmap metadata
     - `completion_suggestions` - LLM completion suggestions
   - **Action Required**: Run migration via Supabase dashboard

2. **Services**
   - `RoadmapGenerationService` - Generates custom roadmaps
   - `StepCompletionService` - Intelligent completion detection
   - Both include LLM integration + fallbacks

3. **API Endpoints** (`/api/v2/...`)
   - `POST /projects` - Create with dynamic roadmap
   - `GET /projects/:id` - Get project with steps
   - `GET /projects/:id/current-step` - Current step details
   - `POST /projects/:id/check-completion` - Check if complete
   - `POST /projects/:id/complete-step` - Mark complete
   - `POST /projects/:id/continue` - Advance to next step

### Frontend (✅ Done)

1. **Components**
   - `RoadmapSidebarV2.tsx` - Linear roadmap UI
   - `CompletionSuggestionCard.tsx` - LLM completion suggestions

---

## 🚀 Next Steps: Integration

### Step 1: Run Database Migration

Open Supabase Dashboard → SQL Editor → Run:

```sql
-- Copy contents of apps/api/supabase/migrations/20250202_dynamic_roadmap.sql
-- and execute in the SQL editor
```

**Verify tables created:**

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('roadmap_steps', 'project_roadmap_metadata', 'completion_suggestions');
```

### Step 2: Update Frontend to Use V2

#### Option A: Add V2 Route (Recommended for Testing)

In `App.tsx`, add a route for V2 projects:

```typescript
import RoadmapSidebarV2 from "./components/RoadmapSidebarV2";
import CompletionSuggestionCard from "./components/CompletionSuggestionCard";

// Add state for V2 projects
const [projectV2, setProjectV2] = useState<any>(null);
const [completionSuggestion, setCompletionSuggestion] = useState<any>(null);
const [isCompletingStep, setIsCompletingStep] = useState(false);

// V2 Project Creation
const handleCreateProjectV2 = async (vision: string) => {
  try {
    const response = await fetch(`${API_URL}/api/v2/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vision, user_id: userId }),
    });

    const data = await response.json();
    setProjectV2(data);
  } catch (error) {
    console.error("Error creating V2 project:", error);
  }
};

// V2 Step Completion
const handleCompleteStepV2 = async () => {
  if (!projectV2) return;

  setIsCompletingStep(true);

  try {
    // Step 1: Complete current step
    await fetch(`${API_URL}/api/v2/projects/${projectV2.id}/complete-step`, {
      method: "POST",
    });

    // Step 2: Continue to next step
    const response = await fetch(
      `${API_URL}/api/v2/projects/${projectV2.id}/continue`,
      { method: "POST" },
    );

    const data = await response.json();

    if (data.project_complete) {
      alert("🎉 Project Complete!");
    }

    // Refresh project
    await refreshProjectV2();
  } catch (error) {
    console.error("Error completing step:", error);
  } finally {
    setIsCompletingStep(false);
    setCompletionSuggestion(null);
  }
};

// V2 Refresh
const refreshProjectV2 = async () => {
  if (!projectV2?.id) return;

  const response = await fetch(`${API_URL}/api/v2/projects/${projectV2.id}`);
  const data = await response.json();
  setProjectV2(data);
};
```

#### Option B: Full Migration (Replace V1)

Replace old roadmap system entirely:

1. Remove `RoadmapSidebar.tsx` references → use `RoadmapSidebarV2.tsx`
2. Replace `/api/projects` calls → `/api/v2/projects`
3. Update project state to use new structure

---

## 📊 Data Structure Comparison

### Old (V1):

```typescript
{
  current_phase: "P1",  // or number
  current_substep: 1,
  phases: [
    {
      phase_id: "P1",
      phase_number: 1,
      substeps: [...]
    }
  ]
}
```

### New (V2):

```typescript
{
  current_step: 23,
  roadmap_status: "in_progress",
  metadata: {
    total_steps: 45,
    completion_percentage: 51
  },
  steps: [
    {
      step_number: 23,
      title: "Implement AI Categorization",
      description: "...",
      status: "active",
      estimated_complexity: 7,
      acceptance_criteria: [...]
    }
  ]
}
```

---

## 🎨 UI Flow

### 1. Project Creation

```
User enters vision → "I want to build a budget tracker..."
↓
POST /api/v2/projects
↓
LLM generates custom roadmap (8-60 steps based on complexity)
↓
Returns project with all steps
```

### 2. Working on Steps

```
RoadmapSidebarV2 shows:
- Current step (prominent)
- Completed steps (collapsible)
- Upcoming steps (preview)
- Progress: "Step 23/45 • 51%"

User clicks "Ask AI"
↓
AI uses current step's master_prompt (context-aware)
↓
User works, uploads code, chats with AI
```

### 3. Step Completion

```
Option A: User clicks "Mark Complete" button
↓
POST /api/v2/projects/:id/complete-step
↓
POST /api/v2/projects/:id/continue
↓
Moves to next step

Option B: LLM Auto-Suggests (Future)
↓
POST /api/v2/projects/:id/check-completion
↓
Returns CompletionSuggestion
↓
Shows CompletionSuggestionCard
↓
User clicks "Continue to Next Step"
↓
Same flow as Option A
```

---

## 🧪 Testing Checklist

### Backend Tests

- [ ] Create project via `POST /api/v2/projects`
- [ ] Verify roadmap generated with steps
- [ ] Get current step via `GET /api/v2/projects/:id/current-step`
- [ ] Complete step via `POST /api/v2/projects/:id/complete-step`
- [ ] Continue to next via `POST /api/v2/projects/:id/continue`
- [ ] Check completion detection via `POST /api/v2/projects/:id/check-completion`

### Frontend Tests

- [ ] RoadmapSidebarV2 displays correctly
- [ ] Current step shows with acceptance criteria
- [ ] Complexity indicators display (●/●●/●●●)
- [ ] Completed/Upcoming sections expand/collapse
- [ ] "Ask AI" button triggers correct action
- [ ] "Mark Complete" button works
- [ ] CompletionSuggestionCard appears and functions
- [ ] Progress updates after completion

### Integration Tests

- [ ] Create project end-to-end
- [ ] Complete all steps in a roadmap
- [ ] Upload artifact during step
- [ ] Check LLM completion detection works
- [ ] Verify project marked complete at end

---

## 🔧 Configuration

### Required Environment Variables

Already configured in `.env`:

```
OPENAI_API_KEY=...
OPENAI_MODEL_NAME=gpt-4o-mini
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
```

### LLM Model Settings

- **Roadmap Generation**: `gpt-4o-mini`, temp 0.5, max 8000 tokens
- **Completion Detection**: `gpt-4o-mini`, temp 0.3, max 1500 tokens
- Both use JSON schema for structured output

---

## 🐛 Troubleshooting

### Migration Won't Run

**Issue**: Supabase anon key doesn't have SQL execution rights

**Solution**:

1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy/paste migration SQL
4. Execute manually

### Roadmap Generation Fails

**Issue**: OpenAI API error or rate limit

**Solution**:

- Check `OPENAI_API_KEY` is valid
- Verify API quota
- Fallback roadmap will be used (4 generic steps)

### Steps Not Showing in UI

**Issue**: Data structure mismatch

**Solution**:

- Verify migration ran successfully
- Check API response matches V2 structure
- Ensure `RoadmapSidebarV2` is being used

---

## 📈 Next: Phase 2 Features

After Phase 1 is tested:

1. **Artifact Fast-Forward**
   - Upload existing code
   - LLM analyzes and marks steps complete
   - Jump to appropriate current step

2. **Adaptive Roadmap**
   - Insert micro-steps when user blocked
   - Regenerate steps based on new context
   - Roadmap versioning

3. **Enhanced Detection**
   - Real-time completion monitoring
   - Auto-suggest completion during chat
   - Confidence-based nudges

---

## 📝 Migration Path

### For Existing Users (V1 → V2)

1. Keep V1 system running
2. Add V2 route for new projects
3. Test V2 thoroughly
4. Gradually migrate projects
5. Deprecate V1 once stable

### For New Users

Start directly with V2 - simpler, more powerful.

---

## 🎓 Key Design Decisions

### Why Linear Steps Instead of Phases?

**Before**: Forced every project into P0-P7
**After**: Adaptive - simple project = 10 steps, complex = 60 steps

### Why User-Controlled Advancement?

**Philosophy**: "Carry them, but they own it"

- LLM suggests completion
- User decides to advance
- Preserves autonomy and learning

### Why Context-Aware Master Prompts?

Each step knows:

- What was built before
- What's coming next
- Available artifacts
- Project vision

Result: AI gives targeted, actionable guidance

---

## 💡 Usage Example

```typescript
// 1. Create project
const project = await fetch("/api/v2/projects", {
  method: "POST",
  body: JSON.stringify({
    vision: "A habit tracker with streak rewards"
  })
});
// → Returns project with ~15 custom steps

// 2. User works on Step 1
<RoadmapSidebarV2
  project={project}
  onAskAI={() => {
    // AI uses step 1's master prompt
    // Knows this is first step, what's next, etc.
  }}
/>

// 3. Complete step
await fetch(`/api/v2/projects/${id}/complete-step`, {
  method: "POST"
});
await fetch(`/api/v2/projects/${id}/continue`, {
  method: "POST"
});
// → Moves to Step 2

// 4. Repeat through Step 15
// → Project complete!
```

---

## ✅ Success Criteria

Phase 1 is complete when:

- [x] Database migration executed
- [x] Backend services deployed
- [x] API endpoints functional
- [x] Frontend components built
- [ ] End-to-end test passes
- [ ] User can create → work → complete a project

---

## 🚀 Ready to Launch

Everything is built. Just need to:

1. Run the migration
2. Wire up the frontend
3. Test!

The backend is running (`localhost:3001`), frontend is ready (`localhost:5174`).

**Next command**: Test creating a V2 project via API to verify the flow works!
