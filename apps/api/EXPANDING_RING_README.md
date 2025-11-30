# Expanding Ring Exegesis Pipeline

**The "Golden Path" Implementation**

A graph-theoretic approach to Bible study that treats Scripture as a directed graph, walking cross-references in concentric rings to build deterministic, token-efficient context bundles.

---

## Architecture Overview

```
User Question
     ↓
┌────────────────────────────────────┐
│ 1. ANCHOR RESOLUTION               │
│    - Regex: "John 3:16" (fast)     │
│    - Keyword search (fallback)     │
└────────────────────────────────────┘
     ↓
┌────────────────────────────────────┐
│ 2. GRAPH WALKER (Budgeted BFS)     │
│    Ring 0: Anchor ±3 verses        │
│    Ring 1: 20 direct cross-refs    │
│    Ring 2: 30 secondary refs       │
│    Ring 3: 40 tertiary refs        │
└────────────────────────────────────┘
     ↓
┌────────────────────────────────────┐
│ 3. STRUCTURED PROMPT               │
│    Labels each ring's depth        │
│    ~90 verses total                │
└────────────────────────────────────┘
     ↓
┌────────────────────────────────────┐
│ 4. LLM SYNTHESIS (GPT-5.1)         │
│    Explains anchor outward         │
│    Shows "Golden Thread"           │
└────────────────────────────────────┘
```

---

## File Structure

### Core Modules

| File | Purpose | Key Functions |
|------|---------|---------------|
| `graphWalker.ts` | Budgeted BFS graph traversal | `buildContextBundle()`, `fetchLayer()` |
| `expandingRingExegesis.ts` | Main pipeline orchestrator | `explainScripture()` |
| `referenceParser.ts` | Regex for explicit refs | `parseExplicitReference()` |
| `bibleService.ts` | Legacy KJV text loader | `searchVerses()` (fallback) |

### Database Layer

| File | Purpose |
|------|---------|
| `migrations/001_create_bible_schema.sql` | PostgreSQL schema for Supabase |
| `scripts/importBibleToSupabase.ts` | Data import script |

### Data Sources

- **KJV Text**: `data/kjv.json` (31,102 verses)
- **Cross-References**: `src/bible/crossReferencesData.json` (343,000 edges)

---

## How It Works

### 1. Anchor Resolution

**Goal**: Find the verse ID to start the graph walk.

**Fast Path** (Explicit References):
```typescript
Input: "Explain John 3:16"
Regex: Matches "John 3:16"
Output: Verse ID 26137
```

**Fallback** (Keyword Search):
```typescript
Input: "Tell me about Samson"
Keywords: ["tell", "about", "samson"]
Search: FTS in kjv.json
Output: First match (Judges 13:24)
```

### 2. Graph Walker (The Engine)

**Budgeted Breadth-First Search** with hard caps to prevent exponential growth.

```typescript
// Ring 0: Immediate Context
SELECT * FROM verses
WHERE id BETWEEN anchor_id - 3 AND anchor_id + 3

// Ring 1: Direct Cross-References
SELECT to_verse_id, COUNT(*) as relevance
FROM cross_references
WHERE from_verse_id IN (ring0_ids)
GROUP BY to_verse_id
ORDER BY relevance DESC
LIMIT 20

// Ring 2: References of References (exclude Ring 0 & 1)
SELECT to_verse_id, COUNT(*) as relevance
FROM cross_references
WHERE from_verse_id IN (ring1_ids)
  AND to_verse_id NOT IN (ring0_ids + ring1_ids)
GROUP BY to_verse_id
ORDER BY relevance DESC
LIMIT 30

// Ring 3: Deep Links (exclude all previous)
SELECT to_verse_id, COUNT(*) as relevance
FROM cross_references
WHERE from_verse_id IN (ring2_ids)
  AND to_verse_id NOT IN (ring0 + ring1 + ring2)
GROUP BY to_verse_id
ORDER BY relevance DESC
LIMIT 40
```

**Key Optimizations**:
- **Relevance Scoring**: Verses referenced by multiple sources rank higher
- **Deduplication**: `excludeSet` prevents revisiting nodes
- **Hard Caps**: 20/30/40 limits prevent context explosion

### 3. Structured Prompting

**System Prompt** explains the ring metaphor to the LLM:

```
You will receive a core passage and 3 concentric rings of cross-references.

1. ANCHOR PASSAGE (Ring 0): The main text and immediate context.
2. DIRECT CONNECTIONS (Ring 1): Verses directly linked by KJV cross-refs.
3. BROADER CONTEXT (Ring 2): Themes supporting Ring 1.
4. DEEP ECHOES (Ring 3): Distant theological connections.

INSTRUCTIONS:
- Explain the Anchor first
- Move outward, showing how Ring 1 clarifies the Anchor
- Use Ring 2 and 3 to demonstrate Scripture's consistency
- Quote verses, cite references
- Use only the provided KJV text (no external commentary)
```

**User Message** formats the bundle:

```
USER QUESTION: "Why did Jesus weep?"

== RING 0: ANCHOR PASSAGE ==
[John 11:33] When Jesus therefore saw her weeping...
[John 11:34] And said, Where have ye laid him?...
[John 11:35] Jesus wept.
...

== RING 1: DIRECT LINKS ==
[Luke 19:41] And when he was come near, he beheld the city, and wept over it,
[Hebrews 4:15] For we have not an high priest which cannot be touched...
...

== RING 2: SECONDARY LINKS ==
[Isaiah 53:3] He is despised and rejected of men; a man of sorrows...
...

== RING 3: TERTIARY LINKS ==
[Psalm 56:8] Thou tellest my wanderings: put thou my tears into thy bottle...
...
```

### 4. LLM Synthesis

**Model**: GPT-5.1 (for high-quality synthesis)

**Temperature**: 0.3 (grounded, not creative)

**Output**: Exegetical explanation that:
1. Explains Ring 0 in context
2. Shows how Ring 1 confirms the teaching
3. Weaves Ring 2/3 to show theological depth
4. Cites all references

---

## Performance Characteristics

### Token Efficiency

| Component | Count | Token Estimate |
|-----------|-------|----------------|
| Ring 0 | 7 verses | ~500 tokens |
| Ring 1 | 20 verses | ~1,500 tokens |
| Ring 2 | 30 verses | ~2,000 tokens |
| Ring 3 | 40 verses | ~2,500 tokens |
| System Prompt | - | ~400 tokens |
| **TOTAL INPUT** | **~97 verses** | **~7,000 tokens** |

**vs. Naive Approach**: Loading all 343k cross-refs would exceed 1M tokens.

### Latency

| Stage | Time | Notes |
|-------|------|-------|
| Anchor Resolution | 10-50ms | Regex instant, keyword search slower |
| Graph Walker | 200-500ms | 4 SQL queries (Ring 0-3) |
| LLM Synthesis | 10-30s | GPT-5.1 generation time |
| **TOTAL** | **~15-35s** | Mostly LLM time |

### Determinism

✅ **Same anchor → Same context bundle**
- Graph walk is SQL-based (not heuristic)
- No randomness in BFS traversal
- Cross-refs are fixed data (343k edges)

✅ **Reproducible for testing**
- Given anchor ID, output is deterministic
- Easy to spot-check quality
- A/B test prompt variations

---

## Setup Instructions

### Phase 1: Database Import

1. **Run SQL migration** in Supabase dashboard:
   ```bash
   # Copy contents of migrations/001_create_bible_schema.sql
   # Paste into Supabase SQL Editor
   # Click "Run"
   ```

2. **Import data**:
   ```bash
   cd apps/api
   npx ts-node scripts/importBibleToSupabase.ts
   ```

3. **Verify**:
   ```
   ✓ Inserted 31,102 verses
   ✓ Inserted ~343,000 cross-reference edges
   ✓ Test query for John 3:16 succeeded
   ```

### Phase 2-4: Already Implemented

- ✅ Graph walker (`graphWalker.ts`)
- ✅ Structured prompting (`expandingRingExegesis.ts`)
- ✅ Anchor resolution with regex (`referenceParser.ts`)
- ✅ API integration (`index.ts` line 357)

---

## Usage

### API Endpoint

```typescript
POST /api/chat/stream
{
  "message": "Explain John 3:16",
  "userId": "anonymous"
}
```

### Response Format

```typescript
// SSE stream
event: content
data: {"delta": "For God so loved the world..."}

event: done
data: {
  "citations": [],
  "anchor": {
    "id": 26137,
    "book_name": "John",
    "chapter": 3,
    "verse": 16,
    "text": "For God so loved the world..."
  },
  "contextStats": {
    "ring0": 7,
    "ring1": 18,
    "ring2": 29,
    "ring3": 35,
    "total": 89
  }
}
```

---

## Configuration

### Ring Sizes (Adjustable)

```typescript
// In graphWalker.ts
const DEFAULT_CONFIG: RingConfig = {
  ring0Radius: 3,   // ±3 verses around anchor
  ring1Limit: 20,   // Max direct refs
  ring2Limit: 30,   // Max secondary refs
  ring3Limit: 40,   // Max tertiary refs
};
```

**Trade-offs**:
- **Smaller rings** (10/15/20): Faster, fewer tokens, less context
- **Larger rings** (30/40/50): Slower, more tokens, richer context

**Recommendation**: Start with defaults (20/30/40), tune based on quality.

### LLM Model

```typescript
// In expandingRingExegesis.ts, line 160
model: "gpt-5.1"  // For final synthesis
```

**Alternatives**:
- `gpt-4o`: Faster, cheaper, slightly lower quality
- `gpt-4o-mini`: Very fast, budget-friendly, good for testing

---

## Advantages Over Previous Approaches

| Approach | Pros | Cons |
|----------|------|------|
| **V1: Keyword Search** | Simple, fast | No cross-refs, shallow |
| **V2: JSON Cross-Refs** | Has cross-refs | Returned 0 results (bug) |
| **V3: Expanding Ring** | Graph-based, deterministic, token-efficient | Requires DB setup |

### Why Expanding Ring Wins

1. **Solves Data Explosion**: Budgeted BFS caps growth
2. **Uses KJV's Own System**: 343k cross-refs from OpenBible.info
3. **Deterministic**: Same anchor = same context
4. **Token Efficient**: ~7k tokens vs. 1M+ naive approach
5. **Pedagogically Sound**: Matches how exegesis actually works (near → far)
6. **Hallucination Resistant**: LLM restricted to provided verses

---

## Future Enhancements

### Short-Term
- [x] Regex for explicit refs
- [ ] LLM judge for ambiguous queries
- [ ] Better book name normalization (handle "1 John", "Song of Solomon")

### Medium-Term
- [ ] Cache context bundles (same anchor → reuse bundle)
- [ ] A/B test ring sizes
- [ ] User feedback loop (upvote/downvote answers)

### Long-Term
- [ ] Multi-verse queries ("Compare John 3:16 and Romans 5:8")
- [ ] Thematic search ("All verses about faith")
- [ ] Historical context enrichment (maps, timelines)

---

## Debugging

### Check Database Connection

```typescript
import { supabase } from "./src/db";

const { data, error } = await supabase.from("verses").select("count");
console.log(data, error);
```

### Test Graph Walker

```typescript
import { buildContextBundle } from "./src/bible/graphWalker";

const bundle = await buildContextBundle(26137); // John 3:16
console.log(bundle.contextStats);
```

### Test Reference Parser

```typescript
import { parseExplicitReference } from "./src/bible/referenceParser";

console.log(parseExplicitReference("John 3:16"));
// Output: { book: "jn", chapter: 3, verse: 16 }
```

---

## Credits

- **KJV Text**: Public domain
- **Cross-References**: OpenBible.info (CC-BY license)
- **Architecture**: Inspired by graph theory and traditional biblical cross-referencing
- **Implementation**: Built with TypeScript, PostgreSQL (Supabase), GPT-5.1

---

## Summary

The Expanding Ring architecture solves three critical problems:

1. **Data Explosion** → Budgeted BFS with hard caps
2. **Token Limits** → ~7k tokens vs. 1M+ naive approach
3. **Hallucination** → LLM restricted to structured KJV bundle

It's deterministic, testable, and pedagogically sound. The "ring" metaphor matches how biblical interpretation actually works: start with immediate context, move outward through direct parallels, and finish with deep thematic echoes.

**Status**: ✅ Fully implemented, ready for Phase 1 database setup.
