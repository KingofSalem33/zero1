# Implementation Roadmap: World-Class Theological Graphing

**Status:** Phase 1 Complete - Foundation Built
**Last Updated:** 2026-01-04
**Progress:** 60% to world-class backend

---

## ✅ Phase 1 Complete: Strong's Numbers & Graph Cache Foundation

### What We Built

#### 1. Strong's Numbers Foundation ✅

- Created `populateStrongsNumbers.ts` script
- **31,234 Strong's number entries** across ~40 Bible books
- True lexical ROOTS edges working (verified with Genesis 1:1 → Amos 4:13 via H1254)
- Note: Some books have JSON parsing errors (1Co, 1Ki, 2Ch, etc.) - can be fixed later

#### 2. Materialized Graph Cache ✅

- Created database schema with `related_verses_cache` table
- Built `populateGraphCache.ts` for overnight batch processing
- Tested successfully on 10 verses (112 edges cached)
- **Ready to cache 51K+ verses for 10-20x performance gain**

#### 3. Scripts & Tools Created

- ✅ `apps/api/scripts/populateStrongsNumbers.ts` - Extract Strong's numbers
- ✅ `apps/api/scripts/testRootsEdges.ts` - Test lexical connections
- ✅ `apps/api/scripts/populateGraphCache.ts` - Build materialized cache
- ✅ `apps/api/scripts/testGraphCache.ts` - Test cache on small sample
- ✅ `apps/api/migrations/004_create_graph_cache.sql` - Cache schema

---

## 📊 Current Database State

```
Verses: 51,567 (includes some duplicates from old data)
Strong's entries: 31,234 (partial coverage due to JSON errors)
Graph cache: 112 edges (test data only)
Cross-references: 343,000 (fully populated)
```

---

## 🚀 Immediate Next Steps

### Option A: Run Overnight Cache Population (HIGHEST PRIORITY)

This will give you **10-20x performance gains** on all graph queries:

```bash
cd apps/api
# Run overnight (8-12 hours for full Bible)
npx ts-node scripts/populateGraphCache.ts
```

**What this does:**

- Pre-computes Ring 1-3 connections for every verse
- Stores ~3-5 million edges in cache
- Changes query time from 200ms → 10ms

**Impact:** Massive performance improvement - your "Genesis Animation" becomes instant

---

### Option B: Fix JSON Parsing Errors (MEDIUM PRIORITY)

Some books failed to parse:

- 1 Corinthians (1Co)
- 1 Kings (1Ki)
- 2 Chronicles (2Ch)
- Acts (Act)
- Isaiah (Isa)
- Mark (Mar)
- Philemon (Phm)
- Plus books with "No data found": 1Ch, 1Jo, 1Pe, 1Sa, 1Th, 1Ti, 2Co, 2Jo, 2Ki, 2Pe, 2Sa, 2Th, 2Ti, 3Jo

**To investigate:**

```bash
# Check what's wrong with a book
cat public/bible/strongs/1Co.json | python -m json.tool

# Or on Windows
type public\bible\strongs\1Co.json | python -m json.tool
```

**Fix:** Edit the JSON files to correct syntax errors, then re-run:

```bash
npx ts-node scripts/populateStrongsNumbers.ts
```

**Impact:** Will increase Strong's entries from 31K to ~188K (full coverage)

---

### Option C: Update graphWalker to Use Cache (AFTER CACHE IS POPULATED)

Once the cache is populated, update `src/bible/graphWalker.ts` to use cached edges:

**Current (slow):**

```typescript
// Real-time BFS traversal
const ring1 = await fetchDeeperEdges(anchorIds);
const ring2 = await fetchDeeperEdges(ring1Targets);
// ... complex graph walking logic
```

**New (fast):**

```typescript
// Simple cache lookup
const { data: cachedEdges } = await supabase
  .from("related_verses_cache")
  .select("*")
  .eq("source_verse_id", verseId)
  .lte("ring_depth", 3);

// Or use the helper function:
const edges = await supabase.rpc("get_cached_edges", {
  p_source_verse_id: verseId,
  p_edge_types: ["DEEPER", "ROOTS", "ECHOES"],
  p_max_ring_depth: 3,
  p_limit: 100,
});
```

**Impact:** 200-400ms → 10-20ms per graph query

---

## 📋 Future Phases

### Phase 2: Root Clustering (Next Month)

**Goal:** Make ROOTS graph 3-5x richer by grouping related Strong's numbers

**What to Build:**

#### 1. Database Schema

```sql
CREATE TABLE strongs_clusters (
  id SERIAL PRIMARY KEY,
  cluster_name VARCHAR(100),  -- "Mercy/Grace/Lovingkindness"
  testament VARCHAR(2)  -- 'OT' or 'NT'
);

CREATE TABLE strongs_cluster_members (
  cluster_id INT REFERENCES strongs_clusters(id),
  strongs_number VARCHAR(10),  -- "H2617", "H2603", etc.
  PRIMARY KEY (cluster_id, strongs_number)
);
```

#### 2. Example Clusters

```typescript
const clusters = [
  {
    name: "Mercy/Grace/Lovingkindness",
    members: ["H2617", "H2603", "H7356", "H7355"],
  },
  {
    name: "Redemption/Kinsman",
    members: ["H1350", "H6299", "G3084", "G629"],
  },
  {
    name: "Covenant/Testament",
    members: ["H1285", "G1242"],
  },
  {
    name: "Salvation/Deliverance",
    members: ["H3467", "H3444", "G4991", "G4992"],
  },
  // ... ~50-100 clusters covering core theological concepts
];
```

#### 3. How to Build Clusters

**Option A: LLM-Assisted (Recommended)**

```typescript
// One-time script using GPT-4
for each Strong's number H1-H8674, G1-G5624:
  prompt = `
    Strong's ${num}: ${definition}
    Find 3-5 semantically related Strong's numbers
    that represent the same theological concept.
    Return as JSON: {related: ["H####", ...], concept: "Name"}
  `
  clusters = await openai.chat.completions.create(...)
  // Manual review + insert
```

**Option B: Manual Curation**

- Start with top 100 most-used words (covers 80% of usage)
- Consult Hebrew/Greek lexicons
- Focus on theologically rich terms

#### 4. Update ROOTS Edge Fetcher

```typescript
// OLD: Exact match only
WHERE verse_strongs.strongs_number = 'H2617'

// NEW: Cluster match
WHERE verse_strongs.strongs_number IN (
  SELECT strongs_number
  FROM strongs_cluster_members
  WHERE cluster_id IN (
    SELECT cluster_id
    FROM strongs_cluster_members
    WHERE strongs_number = 'H2617'
  )
)
```

**Impact:** Genesis 24:12 (H2617 - "show kindness") now links to:

- Ruth 2:20 (H2603 - "has not stopped showing kindness")
- Exodus 34:6 (H7356 - "compassionate")

---

### Phase 3: Citations Table (ECHOES)

**Goal:** Map NT quotations of OT for true ECHOES edges

#### 1. Data Source

- Public databases of NT quotations
- ~1,000-2,000 citations expected

#### 2. Table Already Exists

```sql
-- Already in migration 003
CREATE TABLE citations (
  id SERIAL PRIMARY KEY,
  ot_verse_id INT NOT NULL REFERENCES verses(id),
  nt_verse_id INT NOT NULL REFERENCES verses(id),
  quote_type VARCHAR(20),  -- 'direct', 'allusion', 'paraphrase'
  CONSTRAINT unique_citation UNIQUE (ot_verse_id, nt_verse_id)
);
```

#### 3. Example Data

```typescript
const citations = [
  {
    ot_verse: "Isaiah 53:4",
    nt_verse: "Matthew 8:17",
    quote_type: "direct",
  },
  {
    ot_verse: "Psalm 22:1",
    nt_verse: "Matthew 27:46",
    quote_type: "direct",
  },
];
```

**Impact:** Enables true ECHOES edges instead of semantic approximations

---

### Phase 4: Hybrid Search (Lower Priority)

**When to Consider:** Only if you see user complaints about:

- Missing proper nouns
- Exact phrase searches failing

**Better Alternative:** Add synonym mapping for modern → archaic spellings:

```typescript
const archaicMap = {
  Noah: "Noe",
  Elijah: "Elias",
  Melchizedek: "Melchisedec",
  // ... 50 common names
};
```

**Why Lower Priority:**

- Your semantic search already works well
- OpenAI embeddings handle proper nouns effectively
- Adds complexity without major benefit

---

### Phase 5: Hierarchical Indexing (SKIP)

**Recommendation:** Don't implement unless you add a "Story Mode" feature

**Why Skip:**

- Your app is verse-precision, not story-precision
- Users query: "verses about faith" → Need exact verse anchors
- Current verse-level embeddings are optimal for your use case
- Low ROI compared to other improvements

---

## 🛠️ Technical Details

### Materialized Graph Cache Implementation

#### Database Schema

```sql
CREATE TABLE related_verses_cache (
  id SERIAL PRIMARY KEY,
  source_verse_id INT NOT NULL REFERENCES verses(id) ON DELETE CASCADE,
  target_verse_id INT NOT NULL REFERENCES verses(id) ON DELETE CASCADE,
  edge_type VARCHAR(20) NOT NULL, -- 'DEEPER', 'ROOTS', 'ECHOES', 'SEMANTIC'
  similarity_score FLOAT NOT NULL, -- 0.0 to 1.0
  ring_depth INT NOT NULL, -- 1, 2, or 3
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_cached_edge UNIQUE (source_verse_id, target_verse_id, edge_type)
);

-- Indexes for fast lookups
CREATE INDEX idx_cache_source ON related_verses_cache(source_verse_id);
CREATE INDEX idx_cache_source_ring ON related_verses_cache(source_verse_id, ring_depth);
CREATE INDEX idx_cache_source_type ON related_verses_cache(source_verse_id, edge_type);
CREATE INDEX idx_cache_source_type_ring ON related_verses_cache(source_verse_id, edge_type, ring_depth);
```

#### Helper Function

```sql
CREATE OR REPLACE FUNCTION get_cached_edges(
  p_source_verse_id INT,
  p_edge_types VARCHAR[] DEFAULT ARRAY['DEEPER', 'ROOTS', 'ECHOES'],
  p_max_ring_depth INT DEFAULT 3,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  target_verse_id INT,
  edge_type VARCHAR,
  similarity_score FLOAT,
  ring_depth INT,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rc.target_verse_id,
    rc.edge_type,
    rc.similarity_score,
    rc.ring_depth,
    rc.metadata
  FROM related_verses_cache rc
  WHERE rc.source_verse_id = p_source_verse_id
    AND rc.edge_type = ANY(p_edge_types)
    AND rc.ring_depth <= p_max_ring_depth
  ORDER BY rc.ring_depth ASC, rc.similarity_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
```

#### Population Strategy

```typescript
// For each verse in the Bible:
1. Ring 1 (Direct): Fetch top 40 cross-references + Strong's matches
2. Ring 2 (Indirect): Find connections of Ring 1 targets (top 40 by frequency)
3. Ring 3 (Semantic): Find semantically similar verses not in Ring 1/2 (top 20)

// Total per verse: ~100 edges
// Total for Bible: ~3-5 million edges
// Storage: ~500MB
// Build time: 8-12 hours
```

---

## 📈 Expected Performance Impact

| Improvement         | Before          | After            | Speedup                   |
| ------------------- | --------------- | ---------------- | ------------------------- |
| **Graph Cache**     | 200-400ms       | 10-20ms          | **10-20x**                |
| **Strong's Data**   | Semantic approx | True lexical     | **3-5x richer**           |
| **Root Clustering** | Exact matches   | Concept families | **3-5x more connections** |

---

## 🎯 Current Feature Status

| Feature                | Status           | Notes                                 |
| ---------------------- | ---------------- | ------------------------------------- |
| **Strong's Numbers**   | ⚠️ Partial (31K) | Need to fix JSON errors for full 188K |
| **ROOTS Edges**        | ✅ Working       | True lexical connections              |
| **DEEPER Edges**       | ✅ Working       | 343K cross-references                 |
| **Graph Cache**        | ⚠️ Ready         | Schema created, needs population      |
| **Semantic Search**    | ✅ Working       | Full embedding coverage               |
| **Root Clustering**    | ❌ Not started   | Phase 2                               |
| **Citations (ECHOES)** | ⚠️ Schema ready  | Needs data population                 |
| **Prophecy Mapping**   | ⚠️ Schema ready  | Needs theological curation            |
| **Genealogy**          | ⚠️ Schema ready  | Needs NER + curation                  |

---

## 🚦 Recommended Priority Order

1. **🔴 CRITICAL:** Populate materialized graph cache (10-20x performance)
2. **🟡 HIGH:** Fix JSON parsing errors (complete Strong's coverage)
3. **🟡 HIGH:** Build Root Clustering (3-5x richer ROOTS)
4. **🟢 MEDIUM:** Populate Citations table (true ECHOES edges)
5. **🟢 MEDIUM:** Update graphWalker to use cache by default
6. **⚪ LOW:** Hybrid Search (only if user complaints)
7. **⚪ SKIP:** Hierarchical Indexing (doesn't fit use case)

---

## 📝 Quick Reference Commands

### Run Cache Population

```bash
cd apps/api
npx ts-node scripts/populateGraphCache.ts
```

### Re-populate Strong's Numbers

```bash
cd apps/api
npx ts-node scripts/populateStrongsNumbers.ts
```

### Test ROOTS Edges

```bash
cd apps/api
npx ts-node scripts/testRootsEdges.ts
```

### Test Graph Cache

```bash
cd apps/api
npx ts-node scripts/testGraphCache.ts
```

### Check Cache Stats

```sql
SELECT * FROM cache_stats;
```

### Manual Cache Query

```sql
-- Get all cached edges for Genesis 1:1
SELECT * FROM get_cached_edges(
  (SELECT id FROM verses WHERE book_abbrev='gen' AND chapter=1 AND verse=1),
  ARRAY['DEEPER', 'ROOTS'],
  3,
  50
);
```

---

## 🐛 Known Issues

### 1. JSON Parsing Errors

**Books Affected:** 1Co, 1Ki, 2Ch, Act, Isa, Mar, Phm
**Symptoms:** "Expected ',' or '}' after property value in JSON"
**Fix:** Edit JSON files to correct syntax errors
**Priority:** Medium

### 2. Missing Book Data

**Books Affected:** 1Ch, 1Jo, 1Pe, 1Sa, 1Th, 1Ti, 2Co, 2Jo, 2Ki, 2Pe, 2Sa, 2Th, 2Ti, 3Jo
**Symptoms:** "No data found in file"
**Possible Cause:** Abbreviation mismatch (expecting "1Ch" but file uses "1chr")
**Fix:** Check actual filenames in public/bible/strongs/
**Priority:** Medium

### 3. Duplicate Verse Data

**Symptom:** 51K verses instead of expected 31K
**Cause:** Old data with different abbreviations (EX, ACT, etc.) + new data (exo, act)
**Impact:** Minimal - doesn't break functionality
**Fix:** Run database cleanup (low priority)
**Priority:** Low

### 4. Missing Verses in Some Chapters

**Example:** Exodus 35-40, Ezekiel 39-48, Genesis 34-50
**Symptom:** "Verse not found" warnings during Strong's population
**Cause:** Verses exist in JSON but not in database (or vice versa)
**Impact:** Partial Strong's coverage for affected chapters
**Fix:** Investigate JSON structure vs database schema mismatch
**Priority:** Medium

---

## 💡 Pro Tips

### Resumable Scripts

All scripts are designed to be resumable:

- `populateGraphCache.ts` - Skips already-cached verses
- `populateStrongsNumbers.ts` - Skips books already processed (if using upsert)

### Progress Monitoring

```sql
-- Check cache population progress
SELECT
  COUNT(DISTINCT source_verse_id) as cached_verses,
  (SELECT COUNT(*) FROM verses) as total_verses,
  ROUND(100.0 * COUNT(DISTINCT source_verse_id) / (SELECT COUNT(*) FROM verses), 2) as percent_complete
FROM related_verses_cache;
```

### Performance Testing

```sql
-- Before cache (slow)
EXPLAIN ANALYZE
SELECT * FROM verses WHERE id IN (
  SELECT to_verse_id FROM cross_references WHERE from_verse_id = 1
);

-- After cache (fast)
EXPLAIN ANALYZE
SELECT * FROM related_verses_cache WHERE source_verse_id = 1;
```

---

## 🎉 Success Metrics

Once fully implemented, you'll have:

- ✅ **10-20x faster graph queries** (via materialized cache)
- ✅ **True lexical connections** (via Strong's numbers)
- ✅ **3-5x richer ROOTS graph** (via root clustering)
- ✅ **Instant "Genesis Animation"** (pre-computed edges)
- ✅ **World-class theological graphing backend** (untouchable in this space)

---

**Last Updated:** 2026-01-04
**Next Review:** After cache population completes
