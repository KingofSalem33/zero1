# Golden Thread Architecture - Reference Genealogy ✨

## Overview

The **Golden Thread** visualization has been successfully integrated into the biblelot codebase. This feature provides a real-time, interactive **reference genealogy tree** that visualizes how Scripture references Scripture, creating a hierarchical map of biblical cross-references.

## What is the Golden Thread?

The Golden Thread is a **hierarchical tree visualization** following verse-to-verse reference chains:

- **Reference Genealogy** (Gray Tree): A vertical tree starting from an anchor verse, showing:
  - Verses it references (children)
  - Verses those verses reference (grandchildren)
  - Continuing down through 6 levels of reference chains
- **The Golden Path** (Gold Nodes): Specific verses the AI activates by citing them in its response
- **Real-time Highlighting**: Nodes light up as the AI streams its response and cites verses

### Why "Genealogy" Instead of "Rings"?

The genealogy model is more intuitive than the original "ring" abstraction:

**Old Model (Rings):**

```
     [Anchor]
    /   |   \
  Ring1 Ring1 Ring1
   / \   |    / \
Ring2 Ring2 Ring2
```

- Bushy, hard to trace paths
- "Rings" don't reflect actual reference relationships

**New Model (Genealogy):**

```
      [Matthew 3:1]
         /        \
   [Isaiah 40:3]  [Mark 1:3]
        |              |
   [Malachi 3:1]  [Luke 3:4]
        |
   [Exodus 23:20]
```

- Clear parent→child reference chains
- Natural vertical scrolling through depth levels
- Shows exactly how Scripture references Scripture

## Architecture

### Backend (apps/api/)

#### 1. Type Definitions (`src/bible/types.ts`)

- **ThreadNode**: Extended verse with graph metadata (depth, parentId, isSpine)
- **VisualEdge**: Parent-child relationships with weights
- **VisualContextBundle**: Complete graph structure for visualization

#### 2. Reference Genealogy Builder (`src/bible/referenceGenealogy.ts`) ⭐ NEW

- **`buildReferenceTree(anchorId, options)`**: Core genealogy builder that:
  - Uses depth-first search (DFS) to follow reference chains
  - Tracks parent→child relationships (verse references verse)
  - Prevents cycles with visited set
  - Respects configurable limits:
    - `maxDepth: 6` - How many levels deep to traverse
    - `maxNodes: 100` - Total node limit
    - `maxChildrenPerNode: 5` - Limit per verse to prevent explosion
  - Calculates "spine" path (deepest branch for visual guide)
  - Returns hierarchical tree structure

**Key Difference from Old graphWalker:**

- Old: BFS "rings" - all verses at same distance
- New: DFS "genealogy" - actual reference chains parent→child

#### 3. SSE Stream Enhancement (`src/index.ts`)

- Modified `/api/chat/stream` endpoint to:
  - Call `buildReferenceTree()` after anchor resolution
  - Send `map_data` SSE event with genealogy tree before streaming text
  - Configured with optimal limits (depth=6, nodes=100, children=5)
  - Gracefully degrades if visualization fails

#### 4. System Prompt Update (`src/bible/expandingRingExegesis.ts`)

- Updated to describe **genealogy tree** instead of rings
- Instructs LLM to "trace the reference chains"
- Enforced citation format: `[Book Chapter:Verse]`
- Examples: `[John 3:16]`, `[1 Corinthians 13:4]`
- Critical for frontend parsing and highlighting

### Frontend (apps/web/)

#### 1. Type Definitions (`src/types/goldenThread.ts`)

- Mirrors backend types for type safety
- ThreadNode, VisualEdge, VisualContextBundle

#### 2. VerseNode Component (`src/components/golden-thread/VerseNode.tsx`)

- Individual node visualization
- Three states:
  - **Anchor**: Gold background, bold, large
  - **Highlighted**: Light gold, shows verse text
  - **Inactive**: Gray, minimal

#### 3. NarrativeMap Component (`src/components/golden-thread/NarrativeMap.tsx`)

- Main visualization using React Flow + dagre
- Vertical tree layout (top-to-bottom)
- Features:
  - Auto-layout with dagre (hierarchical)
  - Background grid
  - Minimap
  - Zoom controls
  - Animated edges for highlighted paths

#### 4. Highlighting Hook (`src/hooks/useGoldenThreadHighlighting.ts`)

- Regex parser for `[Book Ch:v]` citations
- Accumulates highlighted refs as text streams
- Reset function for new queries

#### 5. SSE Hook Update (`src/hooks/useChatStream.ts`)

- Added `onMapData` callback parameter
- New `map_data` event handler
- Fires callback when visualization bundle arrives

#### 6. UnifiedWorkspace Integration (`src/components/UnifiedWorkspace.tsx`)

- Split-view layout (chat | visualization)
- Toggle button to show/hide visualization
- Real-time citation parsing from streaming text
- Header shows highlight count

## Data Flow

```
User Question
  ↓
Backend: resolveAnchor() → finds anchor verse
  ↓
Backend: buildReferenceTree(anchorId, {depth:6, nodes:100, children:5})
  │
  ├─ DFS traversal from anchor
  ├─ Follow verse→verse reference chains
  ├─ Build hierarchical tree (parent→child relationships)
  └─ Calculate spine path (visual guide)
  ↓
SSE: event=map_data → data={nodes[], edges[], rootId}
  ↓
Frontend: NarrativeMap renders GRAY genealogy tree
  │
  └─ dagre layout (vertical hierarchy, top-to-bottom)
  ↓
Backend: LLM streams answer with [Book Ch:v] citations
  ↓
SSE: event=content → data={delta: "..."}
  ↓
Frontend: Regex parses citations from streamed text
  ↓
Frontend: highlightedRefs state updates
  ↓
NarrativeMap: Cited nodes & their paths turn GOLD
  ↓
User sees: Reference genealogy with golden path highlighted
```

## File Structure

```
apps/
├── api/
│   └── src/
│       ├── bible/
│       │   ├── types.ts                    # Added: VisualContextBundle types
│       │   ├── referenceGenealogy.ts       # NEW: buildReferenceTree() with DFS
│       │   ├── graphWalker.ts              # (old ring builder - can be removed)
│       │   └── expandingRingExegesis.ts    # Modified: genealogy-aware prompts
│       └── index.ts                        # Modified: uses buildReferenceTree()
│
└── web/
    └── src/
        ├── types/
        │   └── goldenThread.ts        # New: Frontend types
        ├── components/
        │   ├── golden-thread/
        │   │   ├── VerseNode.tsx      # New: Node component
        │   │   └── NarrativeMap.tsx   # New: Main visualization
        │   └── UnifiedWorkspace.tsx   # Modified: Split view integration
        └── hooks/
            ├── useGoldenThreadHighlighting.ts  # New: Citation parser
            └── useChatStream.ts       # Modified: map_data handler
```

## Key Design Decisions

### 1. Parallel Data Structure

- Created `VisualContextBundle` instead of modifying `ContextBundle`
- Zero breaking changes to existing code
- Visualization is additive-only enhancement

### 2. Parent-Child Tracking

- Calculated on backend (has access to cross-reference metadata)
- Frontend just renders what it receives
- Efficient: only 3-4 extra DB queries (Ring 1, 2, 3 relationships)

### 3. Vertical Tree Layout

- `dagre` with `rankdir: 'TB'` (top-to-bottom)
- More natural for Bible study (reading flow)
- Anchor at top, depth increases downward

### 4. Hidden by Default

- Visualization only appears when `map_data` event received
- Keeps existing UX intact
- Progressive enhancement

### 5. Citation Format Enforcement

- Backend system prompt makes `[Book Ch:v]` **mandatory**
- Frontend regex is simple and reliable
- If AI doesn't cite a verse, it stays gray (intentional)

## Usage

### Starting the System

1. **Backend:**

   ```bash
   cd apps/api
   npm run dev:api
   ```

2. **Frontend:**

   ```bash
   cd apps/web
   npm run dev
   ```

3. **Ask a biblical question:**
   - "What does the Bible say about faith?"
   - "Explain John 3:16 in context"
   - "Show me verses about love"

4. **Watch the Golden Thread:**
   - Gray tree loads first (all available verses)
   - As AI cites verses like `[Romans 5:8]`, nodes light up gold
   - Edges animate to show the path

### Toggle Visualization

- Click the **X** button in the visualization header to close
- Visualization auto-opens when new `map_data` arrives

## Implementation Stats

- **Backend Changes:** 4 files modified, ~200 lines added
- **Frontend Changes:** 6 new files, 2 modified files, ~500 lines added
- **Dependencies Added:** `@xyflow/react`, `dagre`, `@types/dagre`
- **Breaking Changes:** Zero
- **TypeScript Errors:** Zero

## Testing Checklist

- [x] Backend compiles without errors
- [x] Frontend compiles without errors
- [x] Type safety across backend/frontend boundary
- [ ] End-to-end: Ask question → See gray tree → See citations light up
- [ ] Toggle visualization on/off
- [ ] Multiple questions in sequence (highlights reset correctly)
- [ ] Mobile responsiveness (visualization hidden on small screens)

## Future Enhancements

### Phase 4 (Polish)

- [ ] Add animation when nodes light up (scale pulse)
- [ ] Verse detail tooltip on hover
- [ ] Click node to see full verse text
- [ ] Filter by ring (show/hide Ring 3, etc.)
- [ ] Export visualization as PNG

### Phase 5 (Advanced)

- [ ] Lens support ("MESSIANIC", "NARRATIVE", etc.)
- [ ] User can manually highlight verses
- [ ] Compare two questions side-by-side
- [ ] Historical view (show previous queries)
- [ ] Share visualization link

## Troubleshooting

### Visualization doesn't appear

- Check browser console for `map_data` event
- Verify backend sends SSE event (check API logs)
- Ensure `anchorId` is not null in response

### Nodes don't highlight

- Check citation format in AI response (must be `[Book Ch:v]`)
- Verify regex in `useGoldenThreadHighlighting.ts`
- Check `highlightedRefs` state in React DevTools

### Layout looks broken

- Verify `dagre` is installed
- Check browser console for React Flow errors
- Ensure parent div has defined height

## Credits

- **Architecture:** "Golden Thread" concept from PROJECT BLUEPRINT v7.0
- **Graph Traversal:** Existing "Expanding Ring Exegesis" system
- **Visualization Library:** React Flow (@xyflow/react)
- **Layout Algorithm:** dagre (hierarchical graph layout)
- **Integration:** Claude Code (Anthropic) - December 2025

## License

Same as parent project (biblelot).

---

**Status:** ✅ Integration Complete - Ready for Testing

Last Updated: 2025-12-03
