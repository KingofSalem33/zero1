# Graph Pipeline End-to-End Performance Analysis

Generated: 2026-03-13
Source: profiling data (`report.md` / `report.json`), full source audit of `graphWalker.ts`, `graphEngine.ts`, `edgeFetchers.ts`, `pericopeGraphWalker.ts`, `pericopeSearch.ts`, `networkScience.ts`, `expandingRingExegesis.ts`, `narrativeMapGraph.ts`, `forceLayout.ts`.

---

## Pipeline Stage Map (Trace / Chat Stream)

```
HTTP Request
  └─ pre_handler                          ~2ms
  └─ anchor.resolve.getVerseId            ~206ms     [DB: verses.eq.book/ch/v]
  └─ trace.resolveMultipleAnchors         ~207ms
  └─ trace.buildVisualBundle              ~4013ms    ← MAJOR
      └─ buildContextBundle
          ├─ [parallel] ring0 fetch + chiasm struct + query embedding
          ├─ fetchRing1Connections / fetchHybridLayer  (+ fetchAllEdges)
          ├─ hydrateVerses(ring1Ids)
          ├─ fetchRing1Connections ring2              (sequential after ring1)
          ├─ [parallel] hydrateVerses(ring2Ids) + ring3LayerPromise
          └─ hydrateVerses(ring3Ids)
      └─ applyGravityMetrics              (fetchCentralityScores)
      └─ fetchAllEdges(allVerseIds)       (multi-strand: ROOTS, ECHOES, …)
      └─ applyPericopeValidation          (2× DB: verse_pericope_map + pericope_embeddings)
      └─ collapseDuplicateReferences
  └─ rank_similarity.embedding_query      ~279ms     [external API]
  └─ rank_similarity.fetch_embeddings     ~316ms     [DB + JSON.parse per row]
  └─ rank_similarity.compute              ~0.3ms
  └─ rank_similarity.sort                 ~0.07ms
  └─ trace.rankVersesBySimilarity         ~619ms
  └─ dedupe.fetch_embeddings              ~303ms     [DB + JSON.parse per row]
  └─ dedupe.compare_pairs                 ~12ms
  └─ trace.deduplicateVerses              ~336ms
  └─ trace.buildPericopeBundle            ~7662ms    ← DOMINANT BOTTLENECK
      └─ getPericopeById(anchor)          (3 serial DB round-trips)
      └─ getPericopeConnections(ring1)
      └─ for each ring1 node: getPericopeById()   ← N+1 SERIAL
      └─ for each ring1 node: getPericopeConnections()  ← N+1 SERIAL
      └─ for each ring2 node: getPericopeById()   ← N+1 SERIAL
Total: ~13044ms mean
```

---

## Findings and Improvement Opportunities (Ranked by Impact)

---

### 1. N+1 Serial `getPericopeById` in `buildPericopeBundle` — **~7.6s, highest impact**

**Location:** `pericopeGraphWalker.ts:168`, `pericopeGraphWalker.ts:232`

**Problem:**
`buildPericopeBundle` fetches each ring node with a separate `getPericopeById()` call inside a sequential `for` loop. Each `getPericopeById` internally fires **3 sequential DB round-trips**:
1. `SELECT * FROM pericopes WHERE id = ?`
2. `Promise.all([ getVerseById(start_id), getVerseById(end_id) ])` → 2 parallel queries
3. `SELECT verse_id FROM verse_pericope_map WHERE pericope_id = ?`

With `ring1Limit=12` and `ring2Limit=18`, this produces **up to 93 serial DB calls** (anchor + 12 ring1 + 12 `getPericopeConnections` + 18 ring2, each 3 queries). At ~50–80ms per round-trip this dominates the ~7.6s mean.

**Fix:**
Replace the per-node loop with a single batch fetch:
- Collect all target pericope IDs after `getPericopeConnections` returns.
- Issue one `SELECT * FROM pericopes WHERE id IN (...)`.
- Issue one `SELECT verse_id, pericope_id FROM verse_pericope_map WHERE pericope_id IN (...)`.
- Issue one `SELECT id, book_abbrev, book_name, chapter, verse FROM verses WHERE id IN (start_ids ∪ end_ids)`.
- Assemble `PericopeDetail` objects in memory from the batched results.
- Parallelize ring1 connection fetches: `Promise.all(ring1Targets.map(id => getPericopeConnections(id, ...)))` instead of sequential `for` loop.

Expected saving: **~5–6s** (eliminating ~80 serial round-trips).

---

### 2. Sequential Ring Expansion — `buildContextBundle` — **~4s, high impact**

**Location:** `graphWalker.ts:479–639`

**Problem:**
Ring 1 is fully awaited before Ring 2 begins. Ring 2 fetch and Ring 2 hydration are partially parallelized with Ring 3 (via `Promise.all([hydrateVerses(ring2Ids), ring3LayerPromise])`), but Ring 3 hydration is fully sequential after that. Ring 1 hydration (`hydrateVerses(ring1Ids)`) is not overlapped with Ring 2 fetch at all.

More critically, `fetchHybridLayer` contains 6–7 **sequential awaits** internally:
- `fetchAllEdges` (6 parallel sub-fetches → 1 await)
- `scoreVerseIdsByEmbedding` → `buildVerseEmbeddingMap` (DB + parse)
- `fetchPericopeIdsForVerses`
- `fetchPericopeNeighbors`
- `searchPericopesByEmbedding` (conditional)
- `fetchVerseIdsForPericopes`
- `buildVerseEmbeddingMap` again (all candidates)
- `fetchCentralityScores` (conditional)
- `fetchVerseBooks` (conditional)

`fetchPericopeIdsForVerses` and `fetchPericopeNeighbors` are independent of the embedding scoring path and could run in parallel with it.

**Fix:**
- Overlap Ring 1 hydration with Ring 2 fetch: start `fetchRing1Connections(ring1Ids, …)` concurrently with `hydrateVerses(ring1Ids)`.
- Inside `fetchHybridLayer`, run `fetchPericopeIdsForVerses` and `fetchPericopeNeighbors` concurrently with the edge scoring path (`buildVerseEmbeddingMap` for edge candidates).

Expected saving: **~500ms–1s** per ring boundary.

---

### 3. Duplicate Embedding Fetches — `rank_similarity` + `dedupe` — **~619ms total**

**Location:** `graphEngine.ts:171–179` (`rankByQueryRelevance`) and `graphWalker.ts` (`deduplicateVerses` path)

**Problem:**
The `trace` pipeline fetches verse embeddings twice for largely overlapping node sets:
- `rank_similarity.fetch_embeddings` (~316ms) — fetches embeddings for ranked nodes.
- `dedupe.fetch_embeddings` (~303ms) — fetches embeddings for the same nodes to deduplicate.

Both are separate `SELECT id, embedding FROM verses WHERE id IN (...)` round-trips against the same rows, with identical JSON deserialization overhead.

**Fix:**
Pass the already-fetched `embeddingMap` from `rankByQueryRelevance` directly into the deduplication step. This eliminates one full DB round-trip (~303ms) and one round of JSON.parse.

Expected saving: **~300ms**.

---

### 4. JSON Embedding Deserialization in Hot Path — **~50–100ms overhead per fetch**

**Location:** `graphEngine.ts:193–204`, `graphWalker.ts:1005–1030`, `graphWalker.ts:1156`

**Problem:**
Supabase returns stored embeddings as JSON strings. Every `buildVerseEmbeddingMap` and `applyPericopeValidation` call parses them with `JSON.parse(verse.embedding)` in a loop:

```ts
const embedding =
  typeof verse.embedding === "string"
    ? JSON.parse(verse.embedding)  // ← called for every verse, every request
    : verse.embedding;
```

For 50–200 embeddings of 1536 dimensions each, this is non-trivial repeated work.

**Fix:**
- Use Supabase's `pgvector` type with a client that returns a typed `Float32Array` directly, or configure the Supabase client with a custom `arrayParser` so embeddings arrive as numeric arrays.
- Alternatively, use the Postgres `vector::text` cast and parse once at the DB layer if the client cannot be configured. The key is avoiding `JSON.parse` per row in application code.

Expected saving: **~30–80ms per fetch call**.

---

### 5. `applyPericopeValidation` Fires Two Extra DB Round-Trips per `buildVisualBundle`

**Location:** `graphWalker.ts:1074–1161`

**Problem:**
After the full node/edge graph is assembled, `applyPericopeValidation` fires:
1. `SELECT verse_id, pericope_id FROM verse_pericope_map WHERE verse_id IN (all_verse_ids)`
2. `SELECT pericope_id, embedding FROM pericope_embeddings WHERE pericope_id IN (...)`

The `verse_pericope_map` lookup duplicates work already done inside `buildContextBundle`'s scope resolution path (`fetchVerseIdsForPericopes`). The pericope embedding fetch is a second embedding deserialization pass.

**Fix:**
- Carry the `pericopeIdByVerse` map forward from the scope-resolution step in `buildContextBundle` rather than re-fetching.
- Overlap the `pericope_embeddings` fetch with the `fetchAllEdges` multi-strand call (both run sequentially at the bottom of `buildVisualBundle` — see `graphWalker.ts:1559` vs `1576`).

Expected saving: **~150–300ms**.

---

### 6. Multi-Strand Edge Fetch (`fetchAllEdges`) After Full Graph Assembly

**Location:** `graphWalker.ts:1559`, `edgeFetchers.ts:570`

**Problem:**
`fetchAllEdges(allVerseIds, ...)` is called at the very end of `buildVisualBundle` **after** all rings are assembled and hydrated. It issues up to 6 DB fetches in parallel internally, then conditionally fires 3 more semantic-thread fallback queries sequentially if canonical tables are empty. This entire operation is sequentially gated behind ring assembly.

Additionally, `fetchAllEdges` filters `filteredEdges` through 11 separate `Array.filter` passes just to log edge-type counts (lines 672–694). Each pass is a full O(N) scan of the edge list for logging only.

**Fix:**
- Start `fetchAllEdges(allVerseIds, ...)` concurrently with `applyGravityMetrics` — both take `allVerseIds` as input and are independent.
- Replace the 11 individual `Array.filter` count loops with a single `reduce` pass that accumulates all counts simultaneously.

Expected saving from parallelization: **~200–400ms**.
Expected saving from count loop: **~5–20ms** (minor, but removes O(11N) scans).

---

### 7. `getPericopeById` 3-Query Waterfall on Every Individual Call

**Location:** `pericopeSearch.ts:120–149`

**Problem:**
Each `getPericopeById` call runs 3 sequential round-trips: pericope record → `[startVerse, endVerse]` in parallel → verse IDs. The inner `getVerseById` calls (`verses.eq.id`) are individual single-row lookups with no batching.

This function is called:
- Once per ring-1 node in `buildPericopeBundle` (up to 12 times).
- Once per ring-2 node in `buildPericopeBundle` (up to 18 times).
- Once inside `buildVisualBundle` step 7.5 for depth-0 nodes.
- Once inside `exegesis.getPericopeById` in `chat_stream` (~584ms mean).

**Fix:**
Create a `getPericopesById(ids: number[])` batch variant that:
1. `SELECT * FROM pericopes WHERE id IN (?)`
2. `SELECT id, book_abbrev, book_name, chapter, verse FROM verses WHERE id IN (all start_ids ∪ end_ids)`
3. `SELECT verse_id, pericope_id, position_in_pericope FROM verse_pericope_map WHERE pericope_id IN (?)`

All three queries run in parallel. This eliminates the serial waterfall entirely when multiple pericopes are needed.

Expected saving: Already counted in finding #1 above, but additionally this benefits `chat_stream`.

---

### 8. `fetchRootsEdges` O(N²) Inner Loop

**Location:** `edgeFetchers.ts:313–344`

**Problem:**
`fetchRootsEdges` has a double-nested loop:
```ts
for (const source of strongsData) {        // up to 200
  for (const target of connectedVerses) {  // up to limit*3 = 180
    if (source.strongs_number === target.strongs_number) { … }
  }
}
```
This is up to **36,000 iterations** per call. The `seenPairs` Set deduplication is correct but the inner loop itself is unnecessary — the matching can be done in O(N+M) by grouping `connectedVerses` by `strongs_number` into a Map first.

**Fix:**
```ts
const byStrongs = new Map<string, number[]>();
for (const row of connectedVerses) {
  const list = byStrongs.get(row.strongs_number) ?? [];
  list.push(row.verse_id);
  byStrongs.set(row.strongs_number, list);
}
for (const source of strongsData) {
  const targets = byStrongs.get(source.strongs_number) ?? [];
  for (const targetId of targets) { … }
}
```

Expected saving: **~5–20ms** per call (becomes relevant at scale).

---

### 9. `root_translation.loadLexicon` — Extreme CV (6.96), Per-Request Disk Read

**Location:** Lexicon loading in root translation handler

**Problem:**
The `root_translation.loadLexicon` stage has a CV of **6.96** (extreme variance) and a p99 of **147ms** vs a median of **0.02ms**. This is a classic cold-path file load: the lexicon JSON is read from disk on the first few requests per process lifecycle (or after GC pressure evicts the module), then served from the module-level require cache thereafter. The 147ms p99 case represents the cold load.

Same pattern applies to `root_translation.readBookFile` (~8ms mean) which reads Strongs per-book JSON files per request.

**Fix:**
- Load the lexicon JSON eagerly at module initialization (or at server startup) and hold it in a `const` at module scope. Do not read it inside the request handler.
- Pre-load all book Strongs files into a `Map<string, StrongsBook>` at startup. The total size is bounded and small (~few MB).

Expected saving: **eliminates 147ms p99 spike** on root translation.

---

### 10. `verse.getVerse` and `verse.getCrossReferences` — Extreme Variance (CV ~7)

**Location:** Verse and cross-reference DB queries

**Problem:**
Both stages have CVs of ~6.9 (extreme). Median is 0.02–0.04ms but p99 reaches 133–548ms. This bimodal pattern is characteristic of **missing or cold index paths** — the fast path hits an index scan, the slow path hits a sequential scan or a plan regression.

`fetchEchoesEdges` and `fetchProphecyEdges` use `.or('nt_verse_id.in.(...),ot_verse_id.in.(...)')` and similar OR patterns that can prevent index usage.

**Fix:**
- Verify that `cross_references(from_verse_id)` and `cross_references(to_verse_id)` both have B-tree indexes.
- Replace `.or('nt_verse_id.in.(...),ot_verse_id.in.(...)')` patterns with two parallel queries unioned in application code — this gives the query planner a cleaner index scan on each individual column.
- Use `EXPLAIN ANALYZE` on the slow p99 paths to identify plan regressions.

Expected saving: **~100–500ms** on p99, eliminates cold-path spikes.

---

### 11. `pericope.random.count` — High Variance (CV=0.80), ~216ms Mean

**Location:** `pericope_random` pipeline, `pericope.random.count` stage

**Problem:**
A `COUNT(*)` on the pericopes table takes 216ms mean with CV=0.80. This is a full sequential scan on a relatively stable table. The p99 reaches 1203ms.

**Fix:**
- Use `SELECT reltuples::bigint FROM pg_class WHERE relname = 'pericopes'` for an approximate count (updated by autovacuum) — acceptable for random selection.
- Alternatively, maintain the count in a single-row `table_stats` table updated by trigger.
- For the random selection itself, use `TABLESAMPLE SYSTEM(1)` or the offset-based approach with the fast approximate count.

Expected saving: **~200ms** mean on this pipeline.

---

### 12. `semantic_connection.fetch_verses` — High Variance (CV=0.64), ~236ms Mean

**Location:** `semantic_connection_synopsis` pipeline

**Problem:**
Fetching verse text for semantic connection generation is variable (~124–932ms). This is likely loading the full verse text + embedding columns for a batch of verses. The variance suggests contention or table scan on cold rows.

**Fix:**
- Select only needed columns (`id, book_abbrev, chapter, verse, text`) — avoid pulling `embedding` (a large column) if not needed at this stage.
- Ensure the query uses `id IN (...)` with a covering index.

Expected saving: **~50–150ms** mean.

---

### 13. D3 Force Simulation (300 Ticks) Blocks Client Main Thread

**Location:** `forceLayout.ts:330`, `narrativeMapGraph.ts:351`

**Problem:**
`simulation.tick(300)` runs synchronously on the main JavaScript thread (both in the browser `forceLayout.ts` and in the shared `narrativeMapGraph.ts`). For a graph with 40–80 nodes, each tick runs O(N²) for `forceManyBody` (Barnes-Hut approximation) plus O(E) for link forces. At 300 ticks with ~60 nodes, this is measurable UI jank.

Additionally, `forceLayout.ts` fires multiple `console.log` calls inside the layout path, including distance/average calculations on every invocation.

**Fix:**
- Move the simulation off the main thread using a `Web Worker`. The simulation input (nodes/edges as plain objects) is serializable; the output (position map) is small.
- Alternatively, reduce `SIMULATION_TICKS` from 300 to 150–200 and use `simulation.alphaDecay` tuning to reach a stable layout faster.
- Remove or gate all `console.log` calls in `forceLayout.ts` behind a `DEBUG` flag — including the `distances.map/reduce/Math.max` pass (lines 345–354) which allocates a temporary array on every layout call.

Expected saving: **removes main-thread block**, reduces layout time by 30–50%.

---

### 14. `collapseDuplicateBundle` / `collapseDuplicateReferencesInBundle` — O(N²) Node Lookup

**Location:** `narrativeMapGraph.ts:473–491`, `expandingRingExegesis.ts:399`

**Problem:**
Inside the canonical node selection loop, `nodes.find(n => n.id === best)` and `nodes.find(n => n.id === current)` are called **O(groups × ids)** times. With N nodes this is O(N²) in the worst case. Similarly in `expandingRingExegesis.ts`.

**Fix:**
Build a `nodeById = new Map(nodes.map(n => [n.id, n]))` before the loop and use `nodeById.get(id)` for O(1) lookup. The map is already built for `degreeMap` — the pattern is consistent, just incomplete.

Expected saving: **minor** for typical graph sizes (< 100 nodes), **significant** for large multi-anchor trees.

---

### 15. `exegesis.buildMultiAnchorTree` — 10.3s, Single-Threaded Sequential Anchor Processing

**Location:** `expandingRingExegesis.ts`, multi-anchor path

**Problem:**
`exegesis.buildMultiAnchorTree` takes **10.3s** (single sample in profiling). The multi-anchor path resolves and builds visual bundles for each anchor and then merges them. If anchors are resolved and built sequentially, each `buildVisualBundle` call (~4s) serially gates the next.

**Fix:**
Run `buildVisualBundle` calls for all anchors in parallel via `Promise.all(anchors.map(a => buildVisualBundle(a.id, config)))`. Anchors are independent — there is no data dependency between them during construction, only during the merge step.

Expected saving: **~8s** (collapses 3× ~3.4s bundle builds to ~3.4s single parallel execution, per profiling `multi_anchor.buildVisualBundle` data showing 3 runs at ~3.4s mean).

---

### 16. Backpressure: `exegesis.buildPericopeBundle` Blocks LLM Stream Start

**Location:** `chat_stream` pipeline order

**Problem:**
In `chat_stream`, `exegesis.buildPericopeBundle` (~7.9s) must complete **before** `llm.stream_create` (~388ms TTFC) begins. The LLM stream is the user-facing output — blocking it behind full pericope bundle construction means time-to-first-token is **~12s after request arrival** (buildVisualBundle + buildPericopeBundle + stream start). The user sees nothing until this entire pipeline completes.

**Fix:**
Structure the pipeline as two concurrent tracks:
1. **Fast track:** Anchor resolve → light context build → start LLM stream (with partial context).
2. **Slow track:** Full `buildVisualBundle` + `buildPericopeBundle` → send graph update to client as a separate SSE event after streaming begins.

The LLM response can reference the anchor verse and immediate connections while the full graph is still computing. This reduces perceived latency from ~12s to ~1–2s TTFT.

---

### 17. `findBridgeVerses` — Serial Semantic Search as Blocking Step

**Location:** `graphWalker.ts:192–243`

**Problem:**
`findBridgeVerses` calls `searchVersesByQuery(anchor.text, 6, 0.5)` — a full vector similarity search — synchronously at the end of `buildContextBundle`. This adds an external embedding API call (~200–400ms) for every request where the anchor verse is OT or the concept map doesn't match.

**Fix:**
Run `findBridgeVerses` concurrently with Ring 3 computation rather than after it. Both only depend on the anchor verse (available after Ring 0). The current code starts Ring 3 before bridge verses, but awaits Ring 3 before queuing the bridge search.

Expected saving: **~200–400ms** (overlaps with existing Ring 3 fetch).

---

### 18. Excessive `console.log` in Hot Path

**Location:** `edgeFetchers.ts:592–695`, `graphWalker.ts:325–682`, `graphEngine.ts:1084–1088`, `forceLayout.ts:213–354`

**Problem:**
The hot pipeline path fires 15–25 `console.log` calls per request, including structured object serializations (`console.log("[Edge Fetchers] Options:", { … })`) and array-method chains purely for logging. In Node.js, `console.log` is synchronous by default (stdout is blocking in many environments) and string interpolation/serialization happens even when no consumer reads the output.

**Fix:**
Gate all verbose logging behind a `process.env.LOG_LEVEL === 'debug'` check, or use a proper async logger (e.g., `pino` with async transport). Remove the structured object log on every `fetchAllEdges` call (11-field breakdown log) and replace with a single count summary.

Expected saving: **~10–50ms** per request (removes ~25 synchronous console operations).

---

## Summary Table

| # | Finding | Stage Affected | Est. Saving | Effort |
|---|---------|---------------|-------------|--------|
| 1 | N+1 serial `getPericopeById` in `buildPericopeBundle` | `trace.buildPericopeBundle` | ~5–6s | Medium |
| 2 | Sequential ring expansion in `buildContextBundle` + `fetchHybridLayer` | `trace.buildVisualBundle` | ~500ms–1s | Medium |
| 3 | Duplicate embedding fetches (rank + dedupe) | `rank_similarity` + `dedupe` | ~300ms | Low |
| 4 | JSON embedding deserialization per row per call | Multiple stages | ~50–100ms | Low |
| 5 | `applyPericopeValidation` re-fetches already-known pericope map | `buildVisualBundle` | ~150–300ms | Low |
| 6 | `fetchAllEdges` sequenced after graph assembly; 11× filter scans for logging | `buildVisualBundle` | ~200–400ms | Low |
| 7 | `getPericopeById` 3-query waterfall, unbatched | Multiple stages | (counted in #1) | Medium |
| 8 | O(N²) inner loop in `fetchRootsEdges` | `fetchAllEdges` | ~5–20ms | Low |
| 9 | Lexicon + Strongs book files loaded per-request | `root_translation` | ~147ms p99 spike | Low |
| 10 | Missing/cold indexes on `cross_references`, OR-pattern queries | `verse_cross_refs` | ~100–500ms p99 | Low |
| 11 | Full `COUNT(*)` for random pericope selection | `pericope_random` | ~200ms | Low |
| 12 | Fetching unneeded columns in `semantic_connection.fetch_verses` | `semantic_connection` | ~50–150ms | Low |
| 13 | D3 simulation 300 ticks on main thread + debug logging | Client layout | Blocks UI | Medium |
| 14 | O(N²) node lookup in duplicate-collapse functions | Graph post-processing | Minor | Low |
| 15 | Multi-anchor tree builds anchors sequentially | `buildMultiAnchorTree` | ~8s | Low |
| 16 | LLM stream blocked behind full pericope bundle construction | `chat_stream` TTFT | ~8–10s TTFT | High |
| 17 | `findBridgeVerses` semantic search not overlapped with Ring 3 | `buildContextBundle` | ~200–400ms | Low |
| 18 | Synchronous `console.log` in hot path throughout pipeline | All stages | ~10–50ms | Low |

---

## Highest-Leverage Actions (Non-Cache)

1. **Batch `getPericopeById` calls in `buildPericopeBundle`** — eliminates ~80 serial DB round-trips. Single-highest ROI change.
2. **Decouple LLM stream start from `buildPericopeBundle`** — converts 12s wait into ~1–2s TTFT; the graph arrives as a late SSE event.
3. **Parallelize multi-anchor bundle construction** — cuts `buildMultiAnchorTree` from 10s to ~3.5s.
4. **Reuse embedding map across rank + dedupe steps** — removes one full DB round-trip (~300ms) and deserialization pass.
5. **Parallelize independent steps inside `fetchHybridLayer`** — pericope path and edge-scoring path can overlap.
6. **Eager-load lexicon and Strongs book files at startup** — eliminates 147ms p99 spike on root translation.
7. **Move D3 force simulation to Web Worker** — unblocks main thread; improves render responsiveness for map interactions.
