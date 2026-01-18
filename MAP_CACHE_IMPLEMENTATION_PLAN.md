# Map Cache Implementation Plan (Versioned + Scalable)

## Goal

Make map generation fast and durable at scale by caching map bundles and pericope bundles with explicit versioning so algorithm changes never serve stale data.

## Current Hotspots (from profiling)

- `buildPericopeBundle` dominates both `/api/trace` and `chat_stream` pipelines.
- `buildVisualBundle` is the next largest cost.
- LLM time is non-trivial but smaller than graph + pericope bundle compute.

## Scope (code areas to touch)

- Map generation: `apps/api/src/bible/graphWalker.ts`
- Pericope bundle generation: `apps/api/src/bible/pericopeGraphWalker.ts`
- Exegesis pipeline: `apps/api/src/bible/expandingRingExegesis.ts`
- Trace endpoint: `apps/api/src/index.ts` (`/api/trace`)
- Cache infra: `apps/api/src/infrastructure/cache/*`
- DB layer: `apps/api/src/db.ts` + new migration

---

## Phase 0 — Define Versioning + Keys

Add a single source of truth for cache versioning.

- New constant: `MAP_CACHE_VERSION` (e.g., `"1.0"`).
- New key builders:
  - Visual bundle key: `map:{anchorId}:{ringConfigHash}:{flagsHash}:v{MAP_CACHE_VERSION}`
  - Pericope bundle key: `pericopeBundle:{pericopeId}:{ringConfigHash}:v{MAP_CACHE_VERSION}`

Where

- New file: `apps/api/src/bible/mapCacheKeys.ts`
- Optional: move version to `apps/api/src/env.ts` for runtime control.

---

## Phase 1 — Durable Cache Storage

Add a DB-backed cache table (Supabase).

Proposed tables

1. `map_cache`
   - `key` (text, primary key)
   - `map_version` (text)
   - `anchor_id` (int)
   - `ring_config_hash` (text)
   - `flags_hash` (text)
   - `payload_json` (jsonb)
   - `created_at`, `last_accessed_at`

2. `pericope_bundle_cache`
   - `key` (text, primary key)
   - `map_version` (text)
   - `pericope_id` (int)
   - `ring_config_hash` (text)
   - `payload_json` (jsonb)
   - `created_at`, `last_accessed_at`

Where

- New migration in `apps/api/migrations/`
- Add helper functions in a new module: `apps/api/src/bible/mapCacheStore.ts`

---

## Phase 2 — Hot Cache (in-memory)

Add a fast cache layer for hot maps.

- Use existing `ICache` (`getCache()`).
- Store full JSON payloads with TTL.

Where

- `apps/api/src/bible/mapCacheStore.ts`
- Add `getFromHotCache` / `setHotCache` wrappers.

---

## Phase 3 — Wire into pipelines (read-through cache)

### 3.1 Visual bundle cache

Add file: `apps/api/src/bible/mapCache.ts`
Implement:

- `getOrBuildVisualBundle(anchorId, ringConfig, flags): ReferenceVisualBundle`
  1. Try hot cache
  2. Try DB cache
  3. Build via `buildVisualBundle`
  4. Persist + warm hot cache

Call sites

- `apps/api/src/bible/expandingRingExegesis.ts` (single anchor path)
- `apps/api/src/index.ts` `/api/trace`

### 3.2 Pericope bundle cache

Add file: `apps/api/src/bible/pericopeBundleCache.ts`
Implement:

- `getOrBuildPericopeBundle(pericopeId, ringConfig?)`
  1. Try hot cache
  2. Try DB cache
  3. Build via `buildPericopeBundle`
  4. Persist + warm hot cache

Call sites

- `apps/api/src/bible/expandingRingExegesis.ts`
- `apps/api/src/index.ts` `/api/trace`
- `apps/api/src/routes/pericope.ts` `/api/pericope/genealogy`

---

## Phase 4 — Precompute + Warm Strategy

Use scripts to precompute top-N maps.

Script: `apps/api/scripts/precomputeMaps.ts`

- Inputs:
  - list of anchor IDs
  - ringConfig set(s)
  - flags set(s)
- Outputs:
  - writes to DB cache

Data source for top-N:

- Use request logs or analytics table (if available).
- Fallback: popular anchor list.

---

## Phase 5 — Cache Version Management

Safe algorithm upgrades.

- Bump `MAP_CACHE_VERSION` on logic changes.
- Keep old data for rollback, or purge with a cleanup job.

Cleanup job (optional)

- Delete caches where `map_version != current`.
- Or keep last 2 versions.

---

## Phase 6 — Observability

Add visibility into cache effectiveness.

- Log cache hit/miss with correlation IDs.
- Add a `cache_hit` boolean in profiler spans.
- Track hit rate per endpoint in `apps/api/src/utils/telemetry.ts`.

---

## Phase 7 — Validation & Rollout

1. Unit test cache key builders for stability.
2. Run a single map request twice, verify second is a cache hit.
3. Rerun profiling to quantify latency drop.

---

## Risks / Mitigations

- Large payloads in DB: use object storage for payload, store URL in table.
- Stale maps after algorithm change: versioned keys + map_version.
- Cache growth: LRU for hot cache, TTL + cleanup for DB.

---

## Minimal MVP Checklist (fastest path)

1. Add `MAP_CACHE_VERSION` + key builders.
2. Add DB cache tables.
3. Wrap `buildVisualBundle` + `buildPericopeBundle` with read-through caching.
4. Measure hit rate + latency reduction.
