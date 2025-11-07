# P0-P7 Phase-Based Roadmap Implementation

## ✅ Implementation Complete

The P0-P7 phase-based roadmap system has been successfully implemented! This document explains what was built and how to complete the setup.

---

## 📦 What Was Implemented

### 1. **Phase Templates (P0-P7)**

- **File**: `apps/api/src/domain/projects/templates/PhaseTemplates.ts`
- **Description**: Universal 8-phase workflow template covering:
  - **P0**: Define Vision - Crystallize idea into clear vision statement
  - **P1**: Build Environment - Set up professional development workspace
  - **P2**: Core Loop - Build smallest viable input→process→output
  - **P3**: Layered Expansion - Add features incrementally
  - **P4**: Reality Test - Validate with 3-5 real users
  - **P5**: Polish & Freeze Scope - Launch-ready quality, stop feature creep
  - **P6**: Launch - Deploy publicly and track metrics
  - **P7**: Reflect & Evolve - Learn and plan next steps

### 2. **RoadmapGenerationServiceV3**

- **File**: `apps/api/src/domain/projects/services/RoadmapGenerationServiceV3.ts`
- **Description**: Service that generates phase-based roadmaps with:
  - Fixed P0-P7 phase structure
  - LLM-generated custom substeps (2-5 per phase) tailored to user's vision
  - Master prompts with pedagogical guidance for each phase
  - Sequential phase unlocking (complete P0 before accessing P1)

### 3. **Database Schema**

- **File**: `apps/api/supabase/migrations/20250203_phase_based_roadmap.sql`
- **Description**: New database tables and functions:
  - `roadmap_phases` - Stores P0-P7 phases for each project
  - Extended `roadmap_steps` - Now supports substeps linked to phases
  - Helper functions: `unlock_next_phase()`, `complete_phase()`
  - Views for tracking phase progress

### 4. **Backend Routes**

- **File**: `apps/api/src/routes/roadmap-v2.ts`
- **Description**: Updated project creation and retrieval endpoints to:
  - Generate P0-P7 roadmap on project creation
  - Store phases and substeps in database
  - Support both old (flat steps) and new (phase-based) projects
  - Return appropriate structure based on project type

### 5. **Frontend Components**

- **File**: `apps/web/src/components/RoadmapSidebarV2.tsx`
- **Description**: Updated sidebar to display:
  - Phase-based UI with P0-P7 phases
  - Expandable phases showing substeps
  - Current active phase and substep prominently
  - Locked phases (grayed out until unlocked)
  - Completed phases with checkmarks
  - Backward compatible with old flat-step projects

---

## 🔧 Setup Required

### Step 1: Run Database Migration

The database schema changes need to be applied to your Supabase database.

**Option A: Manual Migration (Recommended)**

1. Go to your Supabase Dashboard: [https://ciuxquemfnbruvvzbfth.supabase.co/project/\_/sql](https://ciuxquemfnbruvvzbfth.supabase.co/project/_/sql)
2. Click **"New query"**
3. Copy the contents of: `apps/api/supabase/migrations/20250203_phase_based_roadmap.sql`
4. Paste into the query editor
5. Click **"Run"**

**Option B: Automated Migration (Requires Service Key)**

1. Add `SUPABASE_SERVICE_KEY` to `apps/api/.env`:

   ```
   SUPABASE_SERVICE_KEY=your-service-role-key-here
   ```

   (Get this from Supabase Dashboard → Settings → API → service_role key)

2. Run the migration script:
   ```bash
   cd apps/api
   npx ts-node scripts/run-phase-migration.ts
   ```

### Step 2: Verify Migration

Check that the new tables exist:

1. Go to Supabase Dashboard → Table Editor
2. Verify these tables exist:
   - `roadmap_phases`
   - `roadmap_steps` (with new columns: `phase_id`, `is_substep`, `substep_number`)
   - `project_roadmap_metadata` (with new columns: `total_phases`, `current_phase`, `roadmap_type`)

---

## 🧪 Testing the Implementation

### Test 1: Create New Phase-Based Project

1. **Start the dev servers** (if not already running):

   ```bash
   npm run dev:api    # Terminal 1
   npm run dev:web    # Terminal 2
   ```

2. **Open the app**: http://localhost:5174

3. **Create a new project**:
   - Click "Generate Roadmap"
   - Enter a project idea (e.g., "A habit tracker with streak rewards")
   - Click "Generate Roadmap"

4. **Verify Phase-Based UI**:
   - Sidebar should show: "Phase 1 of 8"
   - Current phase should be labeled: "CURRENT PHASE: P0"
   - Phase title: "Define Vision"
   - You should see 2-4 substeps under P0
   - Phases P1-P7 should appear under "🔒 LOCKED (7)"

### Test 2: Work Through P0

1. **Click "Ask AI"** in the sidebar
   - AI should guide you through P0 substeps
   - Follow the prompts to define your vision

2. **Complete substeps**:
   - Mark substeps as complete using the checkmark button
   - Watch the phase progress counter update

3. **Phase Unlocking**:
   - When all P0 substeps are complete, P1 should automatically unlock
   - Sidebar should update to show "Phase 2 of 8"
   - P1 substeps should become visible

### Test 3: Backward Compatibility

1. **Check existing projects**:
   - If you have existing projects, they should still work
   - Old projects will show the flat step-based UI
   - New projects will show the phase-based UI

---

## 🎯 Key Features

### Sequential Phase Unlocking

- Phases unlock one at a time (P0 → P1 → P2 → ... → P7)
- Users can't skip ahead - prevents overwhelm
- Clear progression path from idea to launched product

### Custom Substeps

- Each phase gets 2-5 substeps generated by AI
- Substeps are tailored to the user's specific project vision
- Balance between structure (fixed phases) and flexibility (custom substeps)

### Master Prompts

- Each phase has a detailed master prompt with:
  - Clear objectives and deliverables
  - Pedagogical guidance (what to teach)
  - Critical rules for AI execution
  - Acceptance criteria

### Dual Model Support

- **Phase-based projects**: New P0-P7 structure
- **Dynamic projects**: Old flat-step model still works
- System auto-detects which model to use

---

## 📁 File Reference

### Backend

```
apps/api/
├── src/
│   ├── domain/projects/
│   │   ├── templates/
│   │   │   └── PhaseTemplates.ts ..................... P0-P7 phase definitions
│   │   └── services/
│   │       └── RoadmapGenerationServiceV3.ts ......... Phase roadmap generator
│   └── routes/
│       └── roadmap-v2.ts ............................. Updated API routes
├── supabase/migrations/
│   └── 20250203_phase_based_roadmap.sql .............. Database schema
└── scripts/
    └── run-phase-migration.ts ........................ Migration runner
```

### Frontend

```
apps/web/
└── src/components/
    └── RoadmapSidebarV2.tsx .......................... Updated sidebar UI
```

---

## 🚀 Next Steps

### Immediate

1. ✅ Run database migration (see Step 1 above)
2. ✅ Test project creation flow
3. ✅ Verify phase unlocking works

### Future Enhancements

- [ ] Add phase completion endpoints for explicit phase marking
- [ ] Add phase-based analytics and progress tracking
- [ ] Allow users to preview upcoming phases (read-only)
- [ ] Add celebration animations for phase completions
- [ ] Implement phase-based milestone tracking

---

## 💡 Design Philosophy

This implementation follows the "Zero-to-One Builder" philosophy:

1. **Progressive Scaffolding**: Tiny steps with visible wins
2. **Universal Method**: P0-P7 works for any project domain
3. **Senior Architect in Your Pocket**: Expert prompts encode 20+ years of craft
4. **Sequential Unlocking**: Prevents overwhelm, maintains focus
5. **Pedagogical Design**: Each phase teaches a specific skill/mindset

---

## ❓ Troubleshooting

### "Table roadmap_phases does not exist"

→ Run the database migration (see Step 1 above)

### "Phase not unlocking after completion"

→ Check that all substeps in current phase are marked "completed"
→ Verify `complete_phase()` function exists in database

### "Old projects showing errors"

→ System should auto-detect old projects and use flat-step UI
→ Check `metadata.roadmap_type` value in database

### "TypeScript compilation errors"

→ Run `npm install` in both `apps/api` and `apps/web`
→ Run `npx tsc --noEmit` to check for errors

---

## 📞 Support

If you encounter issues:

1. Check the migration was applied successfully
2. Verify API server logs for errors
3. Check browser console for frontend errors
4. Review this document for troubleshooting steps

---

**Implementation Date**: November 4, 2025
**Version**: 3.0 (Phase-Based Roadmap)
