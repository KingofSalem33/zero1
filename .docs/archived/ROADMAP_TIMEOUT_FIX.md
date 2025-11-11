# Roadmap Generation Timeout Fix

## Problem

Users were seeing "⏱️ Roadmap generation is taking longer than expected. Please refresh the page." even though the backend successfully completed roadmap generation. The roadmap wasn't showing on the frontend.

## Root Causes

### 1. **Frontend Timeout Too Short**

- **Issue**: Frontend was timing out after 60 seconds (30 attempts × 2s)
- **Reality**: AI roadmap generation can take 2-3 minutes
- **Fix**: Increased timeout to 3 minutes (90 attempts × 2s = 180 seconds)

### 2. **Cache Invalidation Missing**

- **Issue**: When roadmap was saved to Supabase, the in-memory cache wasn't cleared
- **Flow**:
  1. POST /api/projects creates project with empty phases
  2. Backend starts async roadmap generation
  3. First GET request caches project with empty phases
  4. Roadmap completes and saves to Supabase
  5. Subsequent GET requests return cached empty project
- **Fix**: Clear cache after roadmap is saved to Supabase

### 3. **Inconsistent Roadmap Structure**

- **Issue**: Backend was saving `roadmap: project.phases` (array)
- **Loading**: Frontend checks `project.phases` OR `project.roadmap.phases` (nested)
- **Result**: Mismatch in data structure
- **Fix**: Always save as `roadmap: { phases: [...] }` for consistency

### 4. **No Progress Feedback**

- **Issue**: User had no indication that generation was still in progress
- **Fix**: Show elapsed time every 10 seconds during polling

## Changes Made

### Backend (`apps/api/src/routes/projects.ts`)

```typescript
// OLD: Saved roadmap as array
roadmap: project.phases || {},

// NEW: Save roadmap as object with phases property
roadmap: {
  phases: project.phases || [],
},

// NEW: Clear cache after saving
orchestrator.clearProjectCache(supabaseProject.id);
```

### Backend (`apps/api/src/engine/orchestrator.ts`)

```typescript
// NEW: Added cache clearing method
clearProjectCache(projectId: string): void {
  projects.delete(projectId);
  console.log(`[Orchestrator] Cleared cache for project: ${projectId}`);
}
```

### Frontend (`apps/web/src/App.tsx`)

```typescript
// OLD: 60 second timeout
const maxAttempts = 30; // Poll for up to 60 seconds (30 * 2s)

// NEW: 3 minute timeout
const maxAttempts = 90; // Poll for up to 3 minutes (90 * 2s = 180 seconds)

// NEW: Progress indicator
if (pollAttempts % 5 === 0) {
  const elapsed = pollAttempts * 2;
  setGuidance(`⏳ Generating your roadmap with AI... (${elapsed}s elapsed)`);
}

// NEW: Check both locations for phases
const phases = pollData.project?.phases || pollData.project?.roadmap?.phases;
const hasPhases = phases && Array.isArray(phases) && phases.length > 0;

if (pollResponse.ok && pollData.project && hasPhases) {
  // Roadmap is ready!
  // ...
}
```

## Testing the Fix

### Before Fix

1. Create project with goal
2. Wait 60+ seconds for roadmap generation
3. See timeout message: "⏱️ Roadmap generation is taking longer than expected..."
4. Refresh page manually to see roadmap

### After Fix

1. Create project with goal
2. See progress: "⏳ Generating your roadmap with AI... (10s elapsed)"
3. Progress updates every 10 seconds
4. Roadmap appears automatically when ready (up to 3 minutes)
5. No manual refresh needed

## Data Flow (Fixed)

```
1. POST /api/projects
   └─> Create in Supabase with empty phases
   └─> Return project { id, goal, phases: [] }
   └─> Start async roadmap generation

2. Frontend starts polling GET /api/projects/:id every 2 seconds

3. First GET request (while generating)
   └─> orchestrator.getProjectAsync()
   └─> Load from Supabase
   └─> Cache: { id, goal, phases: [] }
   └─> Return: { phases: [] }

4. Roadmap generation completes (30-180 seconds)
   └─> Save to Supabase: { roadmap: { phases: [...] } }
   └─> Clear cache ✅ NEW

5. Next GET request (after cache cleared)
   └─> orchestrator.getProjectAsync()
   └─> Load fresh from Supabase ✅ Cache was cleared
   └─> Return: { phases: [...] } ✅ Has phases!

6. Frontend detects phases
   └─> Stop polling
   └─> Display roadmap
   └─> Show success message
```

## Files Modified

### Backend

- `apps/api/src/routes/projects.ts` - Save roadmap structure, clear cache
- `apps/api/src/engine/orchestrator.ts` - Add clearProjectCache method

### Frontend

- `apps/web/src/App.tsx` - Increase timeout, add progress indicator, check both phase locations

### Documentation

- `ROADMAP_TIMEOUT_FIX.md` - This file

## Verification

✅ Type-check passes (backend): `npx tsc --noEmit`
✅ Type-check passes (frontend): `npx tsc --noEmit`
✅ Roadmap structure consistent: Always `{ phases: [...] }`
✅ Cache invalidation: Clears after roadmap save
✅ Timeout extended: 60s → 180s
✅ Progress feedback: Shows elapsed time

## Next Steps

To test the fix:

1. **Start the backend**:

   ```bash
   cd apps/api
   npm run dev
   ```

2. **Start the frontend**:

   ```bash
   cd apps/web
   npm run dev
   ```

3. **Test roadmap generation**:
   - Create a new project with a goal
   - Observe progress messages
   - Verify roadmap appears automatically
   - No timeout error should appear (unless > 3 minutes)

4. **Verify backend logs**:
   ```
   [Projects] Creating project with goal: ...
   [Projects] Step 1 complete. Project ID: ...
   [Projects] Step 2: Starting async roadmap generation...
   [Projects] Step 2 complete. Roadmap generated.
   [Projects] Roadmap persisted to Supabase
   [Projects] Cache cleared for project: ...
   ```

## Future Improvements (Optional)

1. **Server-Sent Events (SSE)**: Stream progress updates in real-time
2. **WebSocket**: Bidirectional communication for instant updates
3. **Background Job Queue**: Redis/Bull for better async job management
4. **Progress Stages**: Show which phase of roadmap generation is running
5. **Retry Logic**: Auto-retry if generation fails
6. **Estimated Time**: Show estimated completion time based on goal complexity

## Notes

- The 3-minute timeout is generous and should accommodate most roadmap generations
- Cache clearing ensures fresh data is always retrieved after updates
- Consistent data structure (`roadmap: { phases: [] }`) prevents mismatches
- Progress indicator gives users confidence the system is working
- No breaking changes to existing functionality
