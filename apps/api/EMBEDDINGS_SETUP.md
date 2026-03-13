# Semantic Search with Embeddings - Setup Guide

This guide will help you set up vector-based semantic search for finding anchor verses. This replaces the LLM-based anchor finding with a faster, more accurate embedding-based approach.

## What Changed

**Before (LLM-based):**

```
User query → LLM call (500-1000ms) → Parse LLM response → Get verse ID
```

**After (Embeddings-based):**

```
User query → Generate embedding (50ms) → Vector search (20ms) → Get verse ID
Total: ~70ms (7-14x faster!)
```

## Benefits

✅ **Faster**: 70ms vs 500-1000ms (7-14x speed improvement)
✅ **More Accurate**: Can't hallucinate, always returns real verses
✅ **Consistent**: Same query always returns same result
✅ **Cheaper**: One-time $5 cost vs $0.001 per query
✅ **Better UX**: Near-instant response for users

---

## Setup Instructions

### Step 1: Run the Database Migration

Connect to your Supabase database and run the migration:

```bash
# Option A: Using Supabase CLI
supabase db push

# Option B: Manual via Supabase Dashboard
# Go to SQL Editor and run: apps/api/migrations/002_add_vector_search.sql
```

This will:

- Enable the pgvector extension
- Add `embedding` column to `verses` table
- Create vector index for fast search
- Add `search_verses_by_embedding()` function

### Step 2: Generate Embeddings for All Verses

Run the embedding generation script:

```bash
cd apps/api
npx tsx scripts/generateEmbeddings.ts
```

**What this does:**

- Fetches all ~31,000 KJV verses from your database
- Generates embeddings using OpenAI text-embedding-3-small
- Updates database with embeddings
- Shows progress and ETA

**Expected:**

- **Cost**: ~$5 (one-time)
- **Time**: 30-60 minutes
- **Progress**: Real-time updates showing verses/second and ETA

**Note**: The script is smart:

- Skips verses that already have embeddings (you can resume if interrupted)
- Handles rate limits automatically (waits and retries)
- Batches requests for efficiency

### Step 3: Test It Out

The code is already updated to use embeddings! Just restart your API:

```bash
npm run dev
```

Try a query in your app:

- "Jesus walked on water" → Should find Matthew 14:25
- "In the beginning" → Should find Genesis 1:1
- "Love your neighbor" → Should find Leviticus 19:18 or Matthew 22:39

### Step 4: Monitor Performance

Check your API logs for semantic search timing:

```
[Semantic Search] Query: "Jesus walked on water"
[Semantic Search] Generated query embedding in 52ms
[Semantic Search] Database search completed in 18ms
[Semantic Search] Total time: 70ms
[Semantic Search] Found 3 results
[Semantic Search] Top result:
   Matthew 14:25 (94.2% match)
   "And in the fourth watch of the night Jesus went unto them, walking on the sea..."
```

---

## How It Works

### 1. Embeddings

Each verse is converted to a 1536-dimensional vector that captures its semantic meaning:

```
"In the beginning God created" → [0.012, -0.034, 0.089, ...]
"Jesus walked on water"        → [0.045, -0.012, 0.067, ...]
```

### 2. Similarity Search

When you search, we:

1. Convert your query to the same type of vector
2. Find verses with the most similar vectors (cosine similarity)
3. Return the top matches ranked by relevance

### 3. Fallback Strategy

The code still has keyword search as a fallback:

```
1. Try explicit reference ("John 3:16") ✅
2. Try concept mapping (hardcoded concepts) ✅
3. Try semantic search (embeddings) ✅ NEW!
4. Fallback to keyword search if needed
```

---

## Configuration

### Adjust Similarity Threshold

In `apps/api/src/bible/semanticSearch.ts`:

```typescript
// Default threshold: 0.6 (60% similarity)
// Lower = more permissive, higher = more strict

export async function findAnchorVerse(query: string): Promise<number | null> {
  const results = await searchVersesByQuery(query, 3, 0.6); // ← Adjust here
  // ...
}
```

**Recommendations:**

- `0.5` - Very permissive (good for obscure queries)
- `0.6` - Balanced (default, recommended)
- `0.7` - Strict (only very close matches)

### Get More Candidates

```typescript
// Get top 5 candidates instead of top 3
const results = await searchVersesByQuery(query, 5, 0.6); // ← Adjust here
```

---

## Troubleshooting

### "pgvector extension not found"

**Solution**: Supabase has pgvector pre-installed. If you're using another PostgreSQL host:

```bash
# Install pgvector
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make
make install # may need sudo
```

### "OPENAI_API_KEY not configured"

**Solution**: Add to your `.env` file:

```env
OPENAI_API_KEY=sk-...your-key-here
```

### "Embedding generation is slow"

**Normal**: 30-60 minutes for 31,000 verses is expected.

**Speed it up**:

- Increase `BATCH_SIZE` in the script (default: 100)
- Be careful of rate limits

### "Search returns wrong verses"

**Solutions**:

1. Check similarity scores in logs - are they high enough?
2. Lower the threshold (try 0.5 instead of 0.6)
3. Try more specific queries
4. Check if embeddings were generated correctly:

```sql
-- In Supabase SQL Editor:
SELECT COUNT(*) FROM verses WHERE embedding IS NOT NULL;
-- Should return 31,102 (total verses)
```

---

## Next Steps (Optional Enhancements)

### 1. Add Redis Caching

Cache embedding generation for common queries:

```typescript
// Pseudo-code
const cachedEmbedding = await redis.get(`embedding:${query}`);
if (cachedEmbedding) {
  return JSON.parse(cachedEmbedding);
}
const embedding = await generateEmbedding(query);
await redis.set(`embedding:${query}`, JSON.stringify(embedding), "EX", 3600);
```

### 2. Add Hybrid LLM Verification

If you want the best of both worlds:

```typescript
// 1. Get top 5 candidates via embeddings
const candidates = await searchVersesByQuery(query, 5, 0.6);

// 2. Let LLM pick the best from those 5
const best = await llmPickBest(query, candidates);
```

### 3. Monitor Accuracy

Track which verses users actually click on to measure accuracy over time.

---

## Cost Analysis

**One-time setup cost**: ~$5
**Per-query cost**: $0
**LLM savings**: $0.001/query × 1000 queries/day = $1/day = $365/year

**ROI**: Pays for itself in 5 days 🎉

---

## Technical Details

**Embedding Model**: text-embedding-3-small
**Dimensions**: 1536
**Index Type**: HNSW (Hierarchical Navigable Small World)
**Distance Metric**: Cosine similarity
**Database**: PostgreSQL with pgvector extension

**Why cosine similarity?**

- OpenAI embeddings are normalized
- Cosine similarity is fastest for normalized vectors
- Better semantic matching than euclidean distance

---

## Questions?

- Check logs for detailed timing and similarity scores
- Test with the queries in Step 3
- Compare results with old LLM-based approach
- Adjust threshold if needed

**Remember**: You can always add LLM verification later if you want hybrid accuracy!
