# Current Phase Type Consistency Fix

## Problem

Users encountered this error when completing substeps:

```
Error completing substep: Error: Invalid state: current_phase 1 not found in roadmap.
Available phases: P1(1), P2(2), P3(3), P4(4), P5(5), P6(6), P7(7)
```

**Error location**: `ProjectStateManager.validateCurrentPointer` at `apps/api/src/services/projectStateManager.ts:399`

## Root Cause

The system had **inconsistent data types** for `current_phase`:

1. **TypeScript definition** allows both: `current_phase: number | string`
2. **Database storage** was mixed:
   - Initial creation: `"P0"` (string)
   - After roadmap generation: `1` (number) from ProjectCreationService
   - After update: Could be either depending on code path

3. **Phase structure**:
   - `phase_id`: string like `"P1"`, `"P2"`, etc.
   - `phase_number`: number like `1`, `2`, etc.

4. **Validation logic** used strict equality (`===`):
   ```typescript
   const currentPhase = state.roadmap.phases.find(
     (p) =>
       p.phase_id === state.current_phase || // "P1" === 1 → false
       p.phase_number === state.current_phase, // 1 === "1" → false (if types differ)
   );
   ```

When `current_phase` was a number `1` and `phase_number` was string `"1"` (from JSON deserialization), or vice versa, the strict equality check failed.

## Solution

### 1. Normalize Type Comparisons (projectStateManager.ts)

Added type normalization in `validateCurrentPointer`:

```typescript
// Normalize both current_phase and phase_number to numbers for comparison
// This handles cases where one might be string "1" and other is number 1
const normalizeToNumber = (val: string | number): number => {
  if (typeof val === "string") {
    // Handle both "P1" and "1" formats
    return parseInt(val.replace("P", ""));
  }
  return val;
};

const currentPhaseNum = normalizeToNumber(state.current_phase);

const currentPhase = state.roadmap.phases.find((p) => {
  const phaseNum = normalizeToNumber(p.phase_number);
  return p.phase_id === state.current_phase || phaseNum === currentPhaseNum;
});
```

**Benefits**:

- Handles both number and string types
- Handles both "P1" and "1" formats
- More robust error messages showing types

### 2. Standardize Database Storage (routes/projects.ts)

**Initial project creation** (line 37):

```typescript
// Before: current_phase: "P0"
// After:  current_phase: "P1"  (consistent with P1-P7 structure)
```

**After roadmap generation** (lines 60-71):

```typescript
// Ensure current_phase is in phase_id format (P1, P2, etc.)
const currentPhaseId =
  typeof project.current_phase === "number"
    ? `P${project.current_phase}`
    : project.current_phase;

await supabase.from("projects").update({
  current_phase: currentPhaseId || "P1",
  current_substep: project.current_substep || 1,
  roadmap: { phases: project.phases || [] },
});
```

**API response** (line 105):

```typescript
// Before: current_phase: 1 (number)
// After:  current_phase: "P1" (string, phase_id format)
```

### 3. Standardize Service Layer (ProjectCreationService.ts)

**Project creation** (line 51):

```typescript
// Before: current_phase: 1 (number)
// After:  current_phase: "P1" (string, phase_id format)
```

## Changes Made

### Files Modified

1. **`apps/api/src/services/projectStateManager.ts`**
   - Added `normalizeToNumber` helper function
   - Updated `validateCurrentPointer` to normalize types before comparison
   - Enhanced error messages to show types

2. **`apps/api/src/routes/projects.ts`**
   - Changed initial creation: `"P0"` → `"P1"`
   - Added `current_substep: 1` to initial creation
   - Added normalization when saving after roadmap generation
   - Updated API response to use `"P1"` format

3. **`apps/api/src/domain/projects/services/ProjectCreationService.ts`**
   - Changed `current_phase: 1` → `current_phase: "P1"`

### Documentation

- **`CURRENT_PHASE_TYPE_FIX.md`** - This file

## Data Flow (Fixed)

### Before (Inconsistent)

```
1. POST /api/projects
   └─> Supabase: current_phase = "P0" (string)

2. Roadmap generation
   └─> ProjectCreationService: current_phase = 1 (number)
   └─> Supabase update: current_phase = 1 (number)

3. GET /api/projects/:id
   └─> Load from Supabase: current_phase = 1 (number)

4. POST /api/projects/:id/complete-substep
   └─> validateCurrentPointer: 1 (number) vs phase_number (could be string)
   └─> ERROR: Strict equality fails
```

### After (Consistent)

```
1. POST /api/projects
   └─> Supabase: current_phase = "P1" (string)

2. Roadmap generation
   └─> ProjectCreationService: current_phase = "P1" (string)
   └─> Normalize: current_phase = "P1" (string)
   └─> Supabase update: current_phase = "P1" (string)

3. GET /api/projects/:id
   └─> Load from Supabase: current_phase = "P1" (string)

4. POST /api/projects/:id/complete-substep
   └─> validateCurrentPointer: Normalize both to numbers
   └─> SUCCESS: Type-safe comparison
```

## Testing the Fix

### Manual Test

1. **Create a new project**:

   ```bash
   POST http://localhost:3001/api/projects
   {
     "goal": "Build a todo app"
   }
   ```

   ✅ Response should have `current_phase: "P1"`

2. **Wait for roadmap generation** (poll GET /api/projects/:id)

   ✅ Database should have `current_phase: "P1"` (string)

3. **Complete first substep**:

   ```bash
   POST http://localhost:3001/api/projects/:id/complete-substep
   {
     "phase_id": "P1",
     "substep_number": 1
   }
   ```

   ✅ Should succeed without validation error

### Backend Logs

You should see:

```
[ProjectStateManager] Validating current_phase: P1 (type: string)
[ProjectStateManager] Available phases: [
  { phase_id: 'P1', phase_number: 1 },
  { phase_id: 'P2', phase_number: 2 },
  ...
]
```

No error about "current_phase not found"

## Verification

✅ Type-check passes: `npx tsc --noEmit`
✅ Consistent data type: Always use phase_id format ("P1", "P2", etc.)
✅ Backward compatibility: Normalization handles old data with numbers
✅ Error messages improved: Shows types for debugging

## Future Considerations

### Option 1: Full Migration to phase_id (Recommended)

Update TypeScript definition to only allow strings:

```typescript
export interface Project {
  // ...
  current_phase: string; // "P1", "P2", etc. (remove `| number`)
  // ...
}
```

**Benefits**:

- Type safety at compile time
- More semantic (matches phase structure)
- Eliminates ambiguity

**Migration needed**:

- Update all existing database records
- Remove number fallback in code

### Option 2: Keep Dual Support

Keep current implementation with normalization.

**Benefits**:

- Backward compatible
- Handles mixed data
- No migration needed

**Drawbacks**:

- Runtime overhead (minimal)
- Potential for confusion

## Notes

- The fix is **backward compatible** - it handles both number and string formats
- The normalization function is **defensive** - handles "P1", "1", and 1 inputs
- Error messages now **show types** to aid debugging
- Database now stores **consistent format** ("P1", not 1)
- No breaking changes to API contracts
