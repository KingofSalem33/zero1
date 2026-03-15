# Graph Pipeline Implementation Plan

Generated: 2026-03-14

Scope guardrail: this document only covers speed and throughput changes inside the live request pipeline path.

## End-to-End Pipeline Map

### `/api/trace`

1. Request parse in `apps/api/src/index.ts`
2. Anchor resolution via `resolveMultipleAnchors()` / `resolveAnchor()` in `apps/api/src/bible/expandingRingExegesis.ts`
3. Single-anchor path eagerly calls `buildPericopeScopeForVerse()` in `apps/api/src/bible/pericopeGraphWalker.ts`
4. `buildPericopeScopeForVerse()` immediately builds the full pericope bundle via `buildPericopeBundle()`
5. `buildVisualBundle()` in `apps/api/src/bible/graphWalker.ts`
6. `rankVersesBySimilarity()` then `deduplicateVerses()` in `apps/api/src/bible/expandingRingExegesis.ts`
7. Fallback pericope-scope rebuild if the bundle is still missing pericope data
8. Final `res.json(visualBundle)` response

### `/api/chat/stream`

1. Request parse in `apps/api/src/index.ts`
2. `explainScriptureWithKernelStream()` in `apps/api/src/bible/expandingRingExegesis.ts`
3. Conceptual-query ingress may run `resolvePericopeFirst()`, then immediately re-run `getPericopeById()`
4. Single-anchor path again calls `buildPericopeScopeForVerse()` before `buildVisualBundle()`
5. `buildVisualBundle()` or `buildMultiAnchorTree()`
6. `rankVersesBySimilarity()` then `deduplicateVerses()`
7. Optional pericope fallback build
8. `map_data` SSE event is sent only after the full graph path finishes
9. `runModelStream()` starts the LLM stream
10. Web and mobile clients parse SSE, then separately throttle text rendering and compute map layout on the main thread

## Cross-Reference With `SPEED_PLAN.md`

### Confirmed From Source Audit

- `buildPericopeBundle()` is still the largest server bottleneck. Ring 1 and Ring 2 both call `getPericopeById()` inside serial loops in `apps/api/src/bible/pericopeGraphWalker.ts`.
- `getPericopeById()` still performs a three-query waterfall in `apps/api/src/bible/pericopeSearch.ts`.
- `buildContextBundle()` still expands rings mostly in sequence in `apps/api/src/bible/graphWalker.ts`, with only Ring 2 hydration and Ring 3 fetch overlapped.
- `fetchHybridLayer()` in `apps/api/src/bible/graphEngine.ts` still serializes several independent DB steps.
- Ranking and dedupe still fetch verse embeddings twice in `apps/api/src/bible/graphEngine.ts` and `apps/api/src/bible/expandingRingExegesis.ts`.
- Embeddings are still parsed from strings in hot paths across `graphEngine.ts`, `graphWalker.ts`, and `semanticSearch.ts`.
- `applyPericopeValidation()` still re-queries verse-to-pericope mappings and pericope embeddings after graph assembly in `apps/api/src/bible/graphWalker.ts`.
- `fetchAllEdges()` still waits until after graph assembly, and still does repeated full-array scans only for logging in `apps/api/src/bible/edgeFetchers.ts`.
- `fetchRootsEdges()` still has the Strong's nested loop in `apps/api/src/bible/edgeFetchers.ts`.
- Multi-anchor graph construction is still sequential in `apps/api/src/bible/expandingRingExegesis.ts`.
- Force simulation still runs synchronously on the client in `apps/web/src/utils/forceLayout.ts` and `packages/shared/src/graph/narrativeMapGraph.ts`.
- Duplicate-collapse logic still does repeated linear node lookups in `apps/api/src/bible/expandingRingExegesis.ts` and `packages/shared/src/graph/narrativeMapGraph.ts`.
- Verbose hot-path logging still exists across graph building and streaming code.

### Additional Findings Not Called Out Explicitly In `SPEED_PLAN.md`

#### 1. The pericope bundle is not only expensive, it is on the critical path before graph build starts

`buildPericopeScopeForVerse()` in `apps/api/src/bible/pericopeGraphWalker.ts` always calls `buildPericopeBundle()` before returning `pericopeIds`. Both `/api/trace` and `/api/chat/stream` invoke this before `buildVisualBundle()`. That means the slowest stage is currently a prerequisite for the rest of the pipeline, not just an auxiliary bundle builder.

Impact:

- It blocks both trace completion and chat map delivery before verse-graph work can start
- It inflates single-anchor latency even when the caller only needs scope IDs and basic pericope metadata

#### 2. Hot `verses` reads overfetch the embedding column via `select("*")`

`graphWalker.ts` uses `select("*")` for:

- anchor lookup
- Ring 0 lookup
- `hydrateVerses()`

The `verses` table includes `embedding vector(1536)` from `apps/api/migrations/002_add_vector_search.sql`. Those graph-building queries do not use embeddings, but `select("*")` can still force the row payload to include that large column on every Supabase round-trip.

Impact:

- Larger HTTP payloads between API server and Supabase
- More serialization and response parsing work per ring
- Duplicate anchor embedding transfer, followed by a second dedicated embedding lookup in hybrid mode

#### 3. Conceptual-query ingress duplicates pericope detail lookup immediately

`resolvePericopeFirst()` already calls `getPericopeById()` to get `allVerseIds`, but `explainScriptureWithKernelStream()` then calls `getPericopeById()` again for the same `pericopeId`.

Impact:

- Extra three-query waterfall before graph build even begins
- Avoidable latency in the conceptual-query chat path

#### 4. Anchor-range resolution is still serial where batch lookup is possible

`resolveAnchorFromReferences()` walks each verse in each suggested range and awaits `getVerseId()` one by one. The structured prompt path in `resolveMultipleAnchors()` also resolves source and target anchors sequentially.

Impact:

- Higher ingress latency on explicit-range and structured go-deeper prompts
- Unnecessary Supabase round-trip serialization at the very front of the request

#### 5. Streaming output has an additional client-side throughput cap

The server is not the only stream bottleneck:

- Web: `apps/web/src/hooks/useChatStream.ts` releases only `4` chars per animation frame
- Mobile: `apps/mobile/src/screens/ChatMapScreens.tsx` does the same and may wait for the buffer to drain before follow-on state transitions

At 60fps, that is roughly 240 chars/sec even when the server is already ahead.

Impact:

- User-visible output throughput is capped after the server has already produced the text
- Large answers can feel slower than the measured server-side `llm.stream_total`

#### 6. `runModelStream()` creates avoidable stdout backpressure during the stream itself

`apps/api/src/ai/runModelStream.ts` logs:

- full input message payloads
- model config
- every streamed event as JSON
- output item summaries
- every SSE send

This is not just startup logging. It runs inside the delta loop.

Impact:

- Extra JSON serialization while streaming
- Synchronous stdout pressure in the same event loop that is trying to forward deltas
- Avoidable drag on TTFT and chunk cadence

#### 7. Multi-anchor work also serializes per-anchor scope resolution before each graph build

`buildMultiAnchorTree()` does more than just serialize `buildVisualBundle()`. Each anchor first runs `buildPericopeScopeForVerse()`, which itself builds the expensive pericope bundle, and only then moves to the verse graph.

Impact:

- Multi-anchor latency compounds both the pericope-bundle waterfall and the visual-bundle work
- The current remaining-budget logic forces strict sequencing

#### 8. Selected centrality data is fetched, then fetched again later

Gravity-based ring selection loads centrality during neighbor scoring, then `applyGravityMetrics()` fetches centrality again for final nodes. The second fetch is correct for final annotation, but the already-loaded values are not reused.

Impact:

- Extra DB round-trips on gravity-based paths
- More duplicated Supabase request overhead on overlapping node sets

## Bottleneck Summary By Stage

| Stage               | Current bottleneck                                                | Why it is expensive                                     | Priority |
| ------------------- | ----------------------------------------------------------------- | ------------------------------------------------------- | -------- |
| Ingress             | Serial anchor/pericope resolution waterfalls                      | Many small Supabase calls before graph work starts      | Medium   |
| Pericope scope      | `buildPericopeScopeForVerse()` eagerly builds full pericope graph | Slowest stage sits in front of `buildVisualBundle()`    | Critical |
| Verse graph         | Ring expansion and hybrid selection leave overlap on the table    | Independent fetches are still serialized                | High     |
| Data transfer       | Hot `verses` queries overfetch large rows                         | Embedding column is not needed for hydration            | High     |
| Ranking/dedupe      | Duplicate embedding fetch and parse                               | Same rows loaded twice                                  | High     |
| Pericope validation | Re-fetches data the pipeline already derived earlier              | Repeated DB and parse work                              | Medium   |
| Multi-anchor        | Per-anchor work is serialized and merged inefficiently            | Throughput collapses as anchors grow                    | High     |
| Server streaming    | Per-delta debug logging                                           | Event-loop and stdout contention                        | High     |
| Client output       | Text release smoothing and sync force layout                      | Main-thread throughput cap after server response begins | High     |

## Implementation Plan

### Phase 1: Remove Critical-Path Gating And Overfetch

Goal: cut the largest blocking work before graph generation begins.

Changes:

1. Split `buildPericopeScopeForVerse()` into two paths:
   - `resolvePericopeScopeForVerse()` that returns only `pericopeContext` and `pericopeIds`
   - `buildPericopeBundleForVerse()` that builds the narrative bundle only when the caller actually needs it
2. Change `/api/trace` and `/api/chat/stream` to use the cheap scope resolver before `buildVisualBundle()`
3. Return the full `PericopeDetail` from `resolvePericopeFirst()` so chat does not immediately call `getPericopeById()` again
4. Replace hot `verses.select("*")` calls in graph construction with a narrow projection:
   - `id, book_abbrev, book_name, chapter, verse, text`
   - Include `embedding` only on the one branch that truly needs it
5. Reuse `anchorData.embedding` in hybrid mode instead of issuing a second anchor-embedding query
6. Batch structured and range-based anchor ID resolution instead of awaiting `getVerseId()` in loops

Expected outcome:

- Removes the current "pericope bundle before graph bundle" gate
- Shrinks Supabase payload size across Ring 0 and verse hydration
- Reduces ingress and single-anchor baseline latency before the heavy graph steps even begin

Validation:

- `trace.buildPericopeScope` and `exegesis.buildPericopeScope` should fall from seconds to a small DB-only span
- Supabase request count per single-anchor request should materially drop
- `trace.buildVisualBundle` should start earlier in the overall timeline

### Phase 2: Collapse Pericope-Bundle Round-Trips

Goal: remove the dominant serial waterfall inside `buildPericopeBundle()`.

Changes:

1. Add a batched `getPericopesByIds(ids)` helper or RPC that returns:
   - slim pericope fields needed for ring nodes
   - start/end verse refs
   - ordered verse IDs
2. Rewrite `buildPericopeBundle()` to:
   - fetch anchor once
   - fetch Ring 1 connection rows once
   - batch-hydrate all Ring 1 pericopes together
   - fetch Ring 2 connection rows concurrently for Ring 1 targets
   - batch-hydrate final Ring 2 pericopes together
3. Stop selecting full pericope payloads for non-anchor ring nodes when only title/summary/range are used
4. Keep adaptive limit logic, but run it on already-fetched connection rows instead of serial fetch loops

Expected outcome:

- Largest single wall-clock reduction in both trace and chat paths
- Much better throughput under concurrent load because the request no longer emits dozens of serialized Supabase calls

Validation:

- `trace.buildPericopeBundle` and `exegesis.buildPericopeBundle` should drop from ~7.6-7.9s toward low single-digit seconds
- Per-request DB call count for pericope graph build should collapse from dozens to a handful

### Phase 3: Rewire Verse-Graph Concurrency And Data Reuse

Goal: remove duplicated fetches and overlap independent work inside the verse graph.

Changes:

1. Overlap Ring 1 hydration with Ring 2 fetch
2. Overlap `findBridgeVerses()` with Ring 3 work instead of waiting until all rings finish
3. In `fetchHybridLayer()`, run the pericope path and embedding-scoring path concurrently
4. Start `fetchAllEdges()` and pericope-validation prerequisites as soon as the final node set is known, instead of after all post-processing
5. Carry forward reusable data:
   - ranking embedding map into dedupe
   - pericope ID mapping into `applyPericopeValidation()`
   - centrality scores where already available
6. Replace logging-only repeated `Array.filter()` scans with a single counting pass

Expected outcome:

- Lower single-anchor wall time for `buildVisualBundle()`
- Less duplicated data transfer and parsing in the middle of the pipeline

Validation:

- `trace.buildVisualBundle` mean should fall from ~4.0s toward ~2-3s
- `rank_similarity.fetch_embeddings` plus `dedupe.fetch_embeddings` should no longer both appear for the same request shape

### Phase 4: Fix Streaming And Output Throughput

Goal: reduce user-visible latency after graph computation and remove output-path backpressure.

Changes:

1. Start the LLM stream as soon as a light graph payload is ready; deliver the richer pericope bundle and expanded map as later SSE events
2. Strip `runModelStream()` delta-loop logs behind a strict debug gate
3. Collapse SSE writes into a single preformatted string per event where possible
4. Remove the fixed `4` chars/frame client release cap or make it adaptive:
   - if backlog is small, preserve smoothing
   - if backlog is large, release much larger chunks so client display keeps pace with server output
5. Move client force layout off the main thread or reduce tick count and layout frequency

Expected outcome:

- Lower time-to-first-token and time-to-first-map for chat
- Better chunk cadence during streaming
- Faster visible response completion on both web and mobile
- Less UI jank when a new bundle arrives

Validation:

- `llm.stream_ttft` should no longer sit behind full pericope-bundle completion
- End-user time from request start to first visible token should drop materially
- Main-thread layout cost should stay within a frame budget for typical graph sizes

### Phase 5: Parallelize Multi-Anchor Throughput

Goal: keep multi-anchor synthesis from multiplying latency linearly.

Changes:

1. Compute per-anchor budgets up front so anchors can build concurrently
2. Run per-anchor scope resolution and `buildVisualBundle()` with bounded parallelism
3. Replace merge-time `allEdges.some(...)` duplicate checks with a `Set`
4. Replace duplicate-collapse linear lookups with `Map` lookups in both server and shared graph code

Expected outcome:

- Multi-anchor requests stop serializing the whole bundle path anchor by anchor
- Merge and collapse become stable even as graph size grows

Validation:

- `exegesis.buildMultiAnchorTree` should move closer to "one anchor cost plus merge" instead of "sum of anchor costs"

## Recommended Sequencing

1. Phase 1 first. It removes the worst architectural gate and cuts unnecessary row width.
2. Phase 2 second. It attacks the dominant server span directly.
3. Phase 3 third. It compounds the server-side wins by removing duplicate work.
4. Phase 4 fourth. It converts backend gains into user-visible gains.
5. Phase 5 last. It depends on the cheaper single-anchor path and simpler scope resolver.

## Verification Targets

Use the existing profiler labels and add a few missing ones around scope resolution. Success criteria:

- Single-anchor trace mean materially below the current ~13.0s baseline
- `buildPericopeScopeForVerse()` reduced to a lightweight metadata/scope operation
- `buildPericopeBundle()` no longer dominant by several seconds
- `buildVisualBundle()` reduced by removing overfetch and serial waits
- Chat first visible token no longer blocked on full pericope graph assembly
- Web and mobile text display keep pace with stream arrival
- Map layout no longer blocks the main thread for large visible bundles

## First Concrete Work Items

1. Refactor `buildPericopeScopeForVerse()` into cheap scope resolution plus optional bundle build.
2. Replace `select("*")` in `graphWalker.ts` hot verse reads with explicit field lists.
3. Add batched pericope lookup helpers and rewrite `buildPericopeBundle()`.
4. Reuse the ranking embedding map inside `deduplicateVerses()`.
5. Remove delta-loop logging from `runModelStream()` and relax client text throttling.
