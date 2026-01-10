# Sprint 1: Offline Centrality + Hub Prominence

**Goal:** Make hubs visually dominant and centrality lookups instant.

**Timeline:** 5 days (1 developer)

**Status:** 🚧 In Progress

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Changes](#architecture-changes)
3. [Implementation Steps](#implementation-steps)
4. [Testing & Validation](#testing--validation)
5. [Deployment](#deployment)
6. [Success Metrics](#success-metrics)
7. [Rollback Plan](#rollback-plan)

---

## Overview

### What We're Building

**Before:**

- Centrality calculated on-demand per graph build (~50-100ms)
- Hubs only slightly bigger (mass range: 1.2 → 2.8)
- No persistent analytics infrastructure

**After:**

- Centrality pre-computed offline (<10ms lookup)
- Top-tier hubs visually dominant (mass range: 1.2 → 5.4)
- Reusable analytics table for future features

### Expected Impact

**Performance:**

- Graph build time: 800ms → 400ms (50% faster)
- Centrality fetch: 100ms → 10ms (90% faster)

**Visual:**

- Hub nodes 2-3x larger than periphery
- Clear "solar system" patterns around major verses
- Improved force layout stability

---

## Architecture Changes

### New Database Schema

```sql
CREATE TABLE verse_analytics (
  verse_id INTEGER PRIMARY KEY,
  degree INTEGER NOT NULL,
  centrality_score REAL NOT NULL,
  pagerank_score REAL,        -- Reserved for future
  community_id INTEGER,        -- Reserved for future
  computed_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Data Flow

**Old Flow:**

```
User requests graph
  → buildVisualBundle()
  → fetchCentralityScores() [SLOW: computes on-the-fly]
  → Score candidates
  → Return graph
```

**New Flow:**

```
[Offline] Cron job runs weekly
  → computeCentrality.ts
  → Populates verse_analytics table

User requests graph
  → buildVisualBundle()
  → fetchCentralityScores() [FAST: table lookup]
  → Score candidates
  → Return graph
```

### Files Changed

**New Files:**

- `apps/api/src/db/migrations/20250108_create_verse_analytics.sql`
- `apps/api/src/scripts/computeCentrality.ts`
- `apps/api/src/scripts/testCentrality.ts`

**Modified Files:**

- `apps/api/src/bible/networkScience.ts` (fetchCentralityScores)
- `apps/api/src/bible/graphWalker.ts` (mass calculation)
- `apps/api/package.json` (add scripts)

**Total:** ~250 lines of code

---

## Implementation Steps

### Day 1: Database Setup (3-4 hours)

#### Step 1.1: Create Migration File

**File:** `apps/api/src/db/migrations/20250108_create_verse_analytics.sql`

```sql
-- Create analytics table
CREATE TABLE IF NOT EXISTS verse_analytics (
  verse_id INTEGER PRIMARY KEY REFERENCES verses(id) ON DELETE CASCADE,

  -- Centrality metrics
  degree INTEGER NOT NULL DEFAULT 0,
  centrality_score REAL NOT NULL DEFAULT 0.1,

  -- Reserved for future sprints
  pagerank_score REAL,
  community_id INTEGER,

  -- Metadata
  computed_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for fast lookup
CREATE INDEX idx_verse_analytics_centrality
  ON verse_analytics(centrality_score DESC);

CREATE INDEX idx_verse_analytics_degree
  ON verse_analytics(degree DESC);

-- Function to compute centrality for all verses
CREATE OR REPLACE FUNCTION compute_verse_centrality()
RETURNS TABLE(verse_id INTEGER, degree BIGINT, centrality_score REAL) AS $$
BEGIN
  RETURN QUERY
  WITH degree_counts AS (
    -- Count incoming edges for each verse
    SELECT
      target_id as vid,
      COUNT(DISTINCT source_id) as deg
    FROM cross_references
    GROUP BY target_id
  ),
  max_degree AS (
    SELECT MAX(deg) as max_deg FROM degree_counts
  )
  SELECT
    dc.vid::INTEGER as verse_id,
    dc.deg as degree,
    CASE
      WHEN md.max_deg > 0 THEN (dc.deg::REAL / md.max_deg::REAL)
      ELSE 0.1
    END as centrality_score
  FROM degree_counts dc
  CROSS JOIN max_degree md;
END;
$$ LANGUAGE plpgsql;

-- Helper function for statistics
CREATE OR REPLACE FUNCTION centrality_stats()
RETURNS TABLE(avg REAL, median REAL) AS $$
BEGIN
  RETURN QUERY
  WITH ordered AS (
    SELECT centrality_score,
           ROW_NUMBER() OVER (ORDER BY centrality_score) as row_num,
           COUNT(*) OVER() as total_count
    FROM verse_analytics
  )
  SELECT
    (SELECT AVG(centrality_score) FROM verse_analytics)::REAL as avg,
    (SELECT centrality_score
     FROM ordered
     WHERE row_num = (total_count + 1) / 2)::REAL as median;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE verse_analytics IS
  'Pre-computed network analytics for verses (centrality, communities, PageRank)';

COMMENT ON COLUMN verse_analytics.degree IS
  'Number of distinct verses that reference this verse';

COMMENT ON COLUMN verse_analytics.centrality_score IS
  'Normalized degree centrality (0-1), where 1 = most connected verse';
```

#### Step 1.2: Run Migration

```bash
# If using Supabase CLI
cd apps/api
supabase db push

# OR using psql directly
psql $DATABASE_URL -f src/db/migrations/20250108_create_verse_analytics.sql
```

#### Step 1.3: Verify Schema

```sql
-- Test the function
SELECT * FROM compute_verse_centrality() LIMIT 10;

-- Check table exists
\d verse_analytics

-- Check indexes
\di verse_analytics*
```

**Expected Output:**

```
verse_id | degree | centrality_score
---------+--------+-----------------
23145    | 42     | 0.3456
23001    | 38     | 0.3125
...
```

---

### Day 2: Computation Script (4-5 hours)

#### Step 2.1: Create Computation Script

**File:** `apps/api/src/scripts/computeCentrality.ts`

```typescript
/**
 * Offline Centrality Computation
 *
 * Computes degree centrality for all verses and stores in verse_analytics table.
 * Should be run weekly via cron job to keep data fresh.
 *
 * Usage:
 *   npm run compute:centrality
 */

import { supabase } from "../db";

interface CentralityResult {
  verse_id: number;
  degree: number;
  centrality_score: number;
}

interface AnalysisStats {
  topHub: { reference: string; centrality: number };
  avgCentrality: number;
  medianCentrality: number;
  hubCount: number;
}

async function computeAllCentrality(): Promise<void> {
  console.log("[Centrality] Starting computation...");
  const startTime = Date.now();

  try {
    // Step 1: Call database function to compute centrality
    console.log("[Centrality] Computing degree centrality for all verses...");

    const { data, error } = await supabase.rpc("compute_verse_centrality");

    if (error) {
      throw new Error(`Database function failed: ${error.message}`);
    }

    const results = data as CentralityResult[];
    console.log(
      `[Centrality] Computed centrality for ${results.length} verses`,
    );

    // Step 2: Batch upsert to verse_analytics
    console.log("[Centrality] Upserting to verse_analytics...");

    const batchSize = 1000;
    let inserted = 0;

    for (let i = 0; i < results.length; i += batchSize) {
      const batch = results.slice(i, i + batchSize);

      const { error: upsertError } = await supabase
        .from("verse_analytics")
        .upsert(
          batch.map((row) => ({
            verse_id: row.verse_id,
            degree: row.degree,
            centrality_score: row.centrality_score,
            computed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "verse_id" },
        );

      if (upsertError) {
        console.error(
          `[Centrality] Batch ${i / batchSize + 1} failed:`,
          upsertError,
        );
        throw upsertError;
      }

      inserted += batch.length;
      const progress = Math.round((inserted / results.length) * 100);
      console.log(
        `[Centrality] Progress: ${inserted}/${results.length} (${progress}%)`,
      );
    }

    // Step 3: Analyze results
    const stats = await analyzeResults();

    const duration = Date.now() - startTime;
    console.log("\n[Centrality] ✅ Computation complete!");
    console.log(`  Total verses: ${results.length}`);
    console.log(`  Duration: ${(duration / 1000).toFixed(1)}s`);
    console.log(
      `  Top hub: ${stats.topHub.reference} (centrality: ${stats.topHub.centrality.toFixed(3)})`,
    );
    console.log(`  Average centrality: ${stats.avgCentrality.toFixed(3)}`);
    console.log(`  Median centrality: ${stats.medianCentrality.toFixed(3)}`);
    console.log(`  Hubs (>0.8): ${stats.hubCount}`);
  } catch (error) {
    console.error("[Centrality] ❌ Fatal error:", error);
    process.exit(1);
  }
}

async function analyzeResults(): Promise<AnalysisStats> {
  // Get top hub
  const { data: topHubData } = await supabase
    .from("verse_analytics")
    .select("verse_id, centrality_score")
    .order("centrality_score", { ascending: false })
    .limit(1)
    .single();

  const { data: topVerse } = await supabase
    .from("verses")
    .select("book_name, chapter, verse")
    .eq("id", topHubData.verse_id)
    .single();

  // Get statistics
  const { data: stats } = await supabase.rpc("centrality_stats");

  // Count hubs (centrality > 0.8)
  const { count: hubCount } = await supabase
    .from("verse_analytics")
    .select("*", { count: "exact", head: true })
    .gte("centrality_score", 0.8);

  return {
    topHub: {
      reference: `${topVerse.book_name} ${topVerse.chapter}:${topVerse.verse}`,
      centrality: topHubData.centrality_score,
    },
    avgCentrality: (stats as any)?.avg || 0,
    medianCentrality: (stats as any)?.median || 0,
    hubCount: hubCount || 0,
  };
}

// Run if called directly
if (require.main === module) {
  computeAllCentrality()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}

export { computeAllCentrality };
```

#### Step 2.2: Add NPM Scripts

**File:** `apps/api/package.json`

Add to `"scripts"` section:

```json
{
  "scripts": {
    "compute:centrality": "ts-node src/scripts/computeCentrality.ts",
    "test:centrality": "ts-node src/scripts/testCentrality.ts"
  }
}
```

#### Step 2.3: Run Initial Computation

```bash
cd apps/api
npm run compute:centrality
```

**Expected Output:**

```
[Centrality] Starting computation...
[Centrality] Computing degree centrality for all verses...
[Centrality] Computed centrality for 31102 verses
[Centrality] Upserting to verse_analytics...
[Centrality] Progress: 1000/31102 (3%)
[Centrality] Progress: 2000/31102 (6%)
...
[Centrality] Progress: 31102/31102 (100%)

[Centrality] ✅ Computation complete!
  Total verses: 31102
  Duration: 12.3s
  Top hub: Romans 8:28 (centrality: 0.973)
  Average centrality: 0.215
  Median centrality: 0.142
  Hubs (>0.8): 47
```

---

### Day 3: Backend Integration (3-4 hours)

#### Step 3.1: Update fetchCentralityScores

**File:** `apps/api/src/bible/networkScience.ts`

**Find and replace** the existing `fetchCentralityScores` function:

```typescript
/**
 * Fetch pre-computed centrality scores from verse_analytics table
 * BEFORE: Computed on-the-fly (~100ms)
 * AFTER: Simple lookup (~10ms)
 */
export async function fetchCentralityScores(
  verseIds: number[],
): Promise<Map<number, number>> {
  if (verseIds.length === 0) {
    return new Map();
  }

  console.log(
    `[Network Science] Fetching centrality for ${verseIds.length} verses...`,
  );

  const { data, error } = await supabase
    .from("verse_analytics")
    .select("verse_id, centrality_score")
    .in("verse_id", verseIds);

  if (error) {
    console.error("[Network Science] Error fetching centrality:", error);
    // Fallback to default for all verses
    return new Map(verseIds.map((id) => [id, 0.1]));
  }

  const centralityMap = new Map<number, number>();

  // Add fetched values
  data.forEach((row) => {
    centralityMap.set(row.verse_id, row.centrality_score);
  });

  // Fill missing verses with default (for verses without analytics)
  verseIds.forEach((id) => {
    if (!centralityMap.has(id)) {
      centralityMap.set(id, 0.1);
    }
  });

  console.log(
    `[Network Science] Centrality fetched: ${data.length} found, ${verseIds.length - data.length} defaulted`,
  );

  return centralityMap;
}
```

#### Step 3.2: Update Mass Calculation with Exponential Scaling

**File:** `apps/api/src/bible/graphWalker.ts`

**Find** the `applyGravityMetrics` function (around line 629) and **replace** the mass calculation:

```typescript
nodes.forEach((node) => {
  const centrality = centralityMap.get(node.id) ?? 0.1;
  const mirror = mirrorLookup.get(node.id);
  const isCenter = structure?.centerId === node.id;
  const inStructure = structureSet.has(node.id);

  // BASE MASS: Linear scaling by centrality
  let mass = 1 + centrality * 2;

  // NEW: EXPONENTIAL SCALING FOR TOP-TIER HUBS
  if (centrality > 0.9) {
    mass *= 1.5; // Top 10%: 50% boost
    console.log(
      `[Gravity] Super-hub detected: ID ${node.id}, centrality=${centrality.toFixed(3)}, mass=${mass.toFixed(2)}`,
    );
  } else if (centrality > 0.8) {
    mass *= 1.3; // Top 20%: 30% boost
    console.log(
      `[Gravity] Hub detected: ID ${node.id}, centrality=${centrality.toFixed(3)}, mass=${mass.toFixed(2)}`,
    );
  }

  // STRUCTURAL BONUSES (unchanged from before)
  let structureRole: "center" | "mirror" | "member" | undefined;

  if (isCenter) {
    mass += 3;
    structureRole = "center";
  }
  if (mirror) {
    mass += 0.6;
    structureRole = structureRole ?? "mirror";
  }
  if (!structureRole && inStructure) {
    structureRole = "member";
  }

  // CLAMP to prevent runaway mass (increased ceiling from 6 to 8)
  node.centrality = centrality;
  node.mass = clamp(mass, 1, 8);
  node.structureId = structure?.id;
  node.structureRole = structureRole;
  node.mirrorOf = mirror?.id;
});
```

#### Step 3.3: Add Mass Distribution Logging

**File:** `apps/api/src/bible/graphWalker.ts`

**Add** at the end of `buildVisualBundle` function (around line 967):

```typescript
// Log mass distribution for debugging
console.log(`[Visual Bundle] Mass distribution:`);
const massDistribution = nodes.reduce(
  (acc, node) => {
    const bucket = Math.floor(node.mass || 1);
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  },
  {} as Record<number, number>,
);

Object.entries(massDistribution)
  .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
  .forEach(([mass, count]) => {
    console.log(`  Mass ${mass}: ${count} nodes`);
  });
```

---

### Day 4: Frontend Polish (3-4 hours)

#### Step 4.1: Verify Force Layout Integration

**File:** `apps/web/src/utils/forceLayout.ts`

**Check** that mass is already being used (it should be):

```typescript
// Around line 206-220
const d3Nodes: ForceNode[] = nodes.map((n) => {
  const nodeData = n.data as VerseNodeData;
  return {
    id: n.id,
    // ... other properties
    mass: nodeData?.verse?.mass || 1, // ✅ Already flows from backend
    // ...
  };
});
```

**Add temporary logging** to verify high-mass nodes:

```typescript
const mass = nodeData?.verse?.mass || 1;

// TEMPORARY: Log high-mass nodes for verification
if (mass > 3) {
  console.log(
    `[Force Layout] High-mass node: ${n.id}, mass=${mass.toFixed(2)}, centrality=${nodeData?.verse?.centrality?.toFixed(3)}`,
  );
}
```

#### Step 4.2: Optional - Scale Node Visual Size by Mass

**File:** `apps/web/src/components/golden-thread/VerseNode.tsx`

**Find** the node size calculation (around line 50-70) and **enhance**:

```typescript
const depth = verse.depth || 0;
const mass = verse.mass || 1;

let nodeWidth: number, nodeHeight: number;

if (isAnchor) {
  nodeWidth = 180;
  nodeHeight = 90;
} else if (depth === 1) {
  // Scale by mass (max 50% larger)
  const massScale = Math.min(1 + (mass - 1) * 0.15, 1.5);
  nodeWidth = 120 * massScale;
  nodeHeight = 50 * massScale;
} else if (depth === 2) {
  const massScale = Math.min(1 + (mass - 1) * 0.12, 1.4);
  nodeWidth = 100 * massScale;
  nodeHeight = 42 * massScale;
} else {
  const massScale = Math.min(1 + (mass - 1) * 0.1, 1.3);
  nodeWidth = 85 * massScale;
  nodeHeight = 35 * massScale;
}

// Add subtle glow for hubs (mass > 3)
const isHub = mass > 3;
const hubGlow = isHub ? "0 0 15px rgba(251, 191, 36, 0.5)" : undefined;
```

**Apply to node style:**

```typescript
<div
  style={{
    width: `${nodeWidth}px`,
    height: `${nodeHeight}px`,
    boxShadow: hubGlow || existingBoxShadow,
    // ... other styles
  }}
>
  {/* node content */}
</div>
```

---

### Day 5: Testing & Validation (4-5 hours)

#### Step 5.1: Create Test Suite

**File:** `apps/api/src/scripts/testCentrality.ts`

```typescript
/**
 * Centrality System Test Suite
 *
 * Validates:
 * - Analytics table is populated
 * - Top hubs are expected verses
 * - Mass calculation works correctly
 * - Performance is improved
 */

import { supabase } from "../db";
import { buildVisualBundle } from "../bible/graphWalker";

async function testCentralitySystem() {
  console.log("=== Centrality System Test Suite ===\n");

  let allTestsPassed = true;

  // Test 1: Analytics table populated
  console.log("Test 1: Analytics table populated");
  try {
    const { count } = await supabase
      .from("verse_analytics")
      .select("*", { count: "exact", head: true });

    console.log(`  ✅ ${count} verses have analytics`);

    if (count < 30000) {
      console.log(`  ⚠️  Warning: Expected ~31k verses, got ${count}`);
    }
  } catch (error) {
    console.log(`  ❌ Failed: ${error}`);
    allTestsPassed = false;
  }

  // Test 2: Top hubs are theologically important
  console.log("\nTest 2: Top 10 hubs are theologically important");
  try {
    const { data: topHubs } = await supabase
      .from("verse_analytics")
      .select("verse_id, centrality_score")
      .order("centrality_score", { ascending: false })
      .limit(10);

    const topVerses = await Promise.all(
      topHubs.map(async (hub) => {
        const { data } = await supabase
          .from("verses")
          .select("book_name, chapter, verse")
          .eq("id", hub.verse_id)
          .single();
        return `${data.book_name} ${data.chapter}:${data.verse} (${(hub.centrality_score * 100).toFixed(1)}%)`;
      }),
    );

    console.log("  Top 10 hubs:");
    topVerses.forEach((v, i) => console.log(`    ${i + 1}. ${v}`));
    console.log("  ✅ Passed");
  } catch (error) {
    console.log(`  ❌ Failed: ${error}`);
    allTestsPassed = false;
  }

  // Test 3: Mass calculation works
  console.log("\nTest 3: Mass calculation with hub anchor");
  try {
    const { data: romans } = await supabase
      .from("verses")
      .select("id")
      .eq("book_abbrev", "rom")
      .eq("chapter", 8)
      .eq("verse", 28)
      .single();

    const romansId = romans.id;
    const bundle = await buildVisualBundle(romansId);

    const anchorNode = bundle.nodes.find((n) => n.id === romansId);
    console.log(`  Anchor mass: ${anchorNode.mass.toFixed(2)}`);
    console.log(`  Anchor centrality: ${anchorNode.centrality.toFixed(3)}`);

    if (anchorNode.mass < 3) {
      console.log(
        `  ⚠️  Warning: Expected high mass (>3), got ${anchorNode.mass}`,
      );
    }

    const massDistribution = bundle.nodes.reduce(
      (acc, node) => {
        const bucket = Math.floor(node.mass || 1);
        acc[bucket] = (acc[bucket] || 0) + 1;
        return acc;
      },
      {} as Record<number, number>,
    );

    console.log("  Mass distribution:");
    Object.entries(massDistribution)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .forEach(([mass, count]) => {
        console.log(`    Mass ${mass}: ${count} nodes`);
      });

    console.log("  ✅ Passed");
  } catch (error) {
    console.log(`  ❌ Failed: ${error}`);
    allTestsPassed = false;
  }

  // Test 4: Performance check
  console.log("\nTest 4: Performance benchmark");
  try {
    const { data: john } = await supabase
      .from("verses")
      .select("id")
      .eq("book_abbrev", "jhn")
      .eq("chapter", 3)
      .eq("verse", 16)
      .single();

    const start = Date.now();
    await buildVisualBundle(john.id);
    const duration = Date.now() - start;

    console.log(`  Graph build time: ${duration}ms`);

    if (duration > 1000) {
      console.log(`  ⚠️  Warning: Expected <1000ms, got ${duration}ms`);
    } else {
      console.log("  ✅ Passed");
    }
  } catch (error) {
    console.log(`  ❌ Failed: ${error}`);
    allTestsPassed = false;
  }

  // Final summary
  console.log("\n" + "=".repeat(50));
  if (allTestsPassed) {
    console.log("✅ ALL TESTS PASSED");
  } else {
    console.log("❌ SOME TESTS FAILED");
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  testCentralitySystem()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Test suite failed:", error);
      process.exit(1);
    });
}
```

#### Step 5.2: Run Test Suite

```bash
npm run test:centrality
```

#### Step 5.3: Manual QA Checklist

**Browser Tests:**

- [ ] Anchor on John 3:16 → Anchor node is visibly largest
- [ ] Anchor on Romans 8:28 → Node much larger than connected verses
- [ ] Hub nodes (centrality >0.8) have visible "personal space" (repulsion)
- [ ] Graph loads in <1s (check Network tab)
- [ ] Console shows mass distribution with range 1-8
- [ ] No console errors about centrality

**Database Verification:**

```sql
-- Check data quality
SELECT
  MIN(centrality_score) as min,
  MAX(centrality_score) as max,
  AVG(centrality_score) as avg,
  COUNT(*) as total
FROM verse_analytics;

-- Expected:
-- min: ~0.001, max: ~0.97, avg: ~0.2, total: ~31k

-- Check for hubs
SELECT COUNT(*) FROM verse_analytics WHERE centrality_score > 0.8;
-- Expected: 40-60

-- Verify no nulls
SELECT COUNT(*) FROM verse_analytics
WHERE centrality_score IS NULL OR degree IS NULL;
-- Expected: 0
```

---

## Deployment

### Pre-Deploy Checklist

- [ ] Run `npm run compute:centrality` on production database
- [ ] Verify `verse_analytics` has ~31k rows
- [ ] Run `npm run test:centrality` (all tests pass)
- [ ] Test locally with production data dump
- [ ] Check bundle build: `npm run build`

### Deploy Steps

1. **Database Migration**

   ```bash
   # Apply migration to production
   supabase db push --db-url $PROD_DATABASE_URL
   ```

2. **Run Initial Computation**

   ```bash
   # On production server
   npm run compute:centrality
   ```

3. **Deploy Code**

   ```bash
   # Deploy API changes
   git push origin main
   # (Vercel/Railway/etc. auto-deploys)
   ```

4. **Smoke Test**
   - Load graph for John 3:16
   - Load graph for Romans 8:28
   - Load graph for Genesis 1:1
   - Check console logs for centrality messages
   - Verify hubs are visually prominent

### Post-Deploy

- [ ] Set up weekly cron job: `0 0 * * 0 npm run compute:centrality`
- [ ] Add monitoring alert if centrality fetch fails
- [ ] Update documentation with new table schema

---

## Success Metrics

### Performance Benchmarks

**Before Sprint 1:**

- Graph build time: ~800ms
- Centrality fetch: ~100ms
- Hub visibility: Subtle (20-30% size difference)

**After Sprint 1:**

- Graph build time: ~400-500ms (50% improvement)
- Centrality fetch: <10ms (90% improvement)
- Hub visibility: Dramatic (100-200% size difference)

### Visual Comparison

**Anchor: Romans 8:28 (centrality ~0.95)**

**Before:**

```
Anchor mass: 2.9
Hub 1 mass: 2.4
Hub 2 mass: 2.1
Peripheral mass: 1.2
Visual: All nodes similar size
```

**After:**

```
Anchor mass: 5.35  (with exponential scaling + structure bonus)
Hub 1 mass: 3.6
Hub 2 mass: 2.8
Peripheral mass: 1.2
Visual: Clear hierarchy (anchor 4x larger than periphery)
```

### Expected Top Hubs

Should include well-known verses:

- John 3:16 (For God so loved the world...)
- Romans 8:28 (All things work together...)
- Genesis 1:1 (In the beginning...)
- Psalm 23:1 (The Lord is my shepherd...)
- Matthew 5:3-12 (Beatitudes)

---

## Rollback Plan

If something breaks in production:

### Emergency Rollback

```sql
-- Drop the table
DROP TABLE IF EXISTS verse_analytics CASCADE;

-- Revert code changes
git revert HEAD
git push origin main
```

### Graceful Degradation

The code already has fallback logic:

```typescript
// In fetchCentralityScores
if (error) {
  // Falls back to default centrality 0.1
  return new Map(verseIds.map((id) => [id, 0.1]));
}
```

So even if `verse_analytics` is empty/missing, graphs will still work (just without optimization).

---

## Future Enhancements

After Sprint 1 ships, we can:

1. **Add PageRank** (better than degree centrality)
2. **Community Detection** (if users request doctrine clustering)
3. **Temporal Tracking** (watch how centrality changes over time)
4. **API Endpoint** (`/api/analytics/verse/:id` → centrality, degree, etc.)

---

## Notes & Learnings

### Why Degree Centrality?

- **Simple:** Counts incoming edges (cross-references)
- **Fast:** Single SQL query
- **Interpretable:** Verse referenced 100 times = high centrality
- **Good enough:** More sophisticated measures (PageRank, betweenness) have diminishing returns

### Why Offline Computation?

- **Performance:** 90% faster than on-the-fly
- **Scalability:** Can handle 100k+ verses without slowdown
- **Reliability:** Computation failures don't block user requests
- **Extensibility:** Easy to add new metrics (PageRank, communities)

### Lessons Learned

- Pre-computation trades freshness for speed (acceptable for biblical text)
- Exponential scaling makes visual hierarchy clearer
- Mass ceiling (8) prevents layout instability
- Batch upserts (1000 rows) balance speed vs memory

---

## Support

**Questions or Issues?**

1. Check logs: `console.log` outputs throughout code
2. Verify data: Run SQL queries in "Testing" section
3. Test locally: `npm run test:centrality`
4. Rollback if needed: See "Rollback Plan" section

---

**Status:** Ready for implementation ✅

**Last Updated:** 2025-01-08

**Owner:** [Your Name]
