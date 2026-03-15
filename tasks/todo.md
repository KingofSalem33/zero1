# Todo

- [x] Inventory every mobile button-driven flow that produces a user-visible or network-backed output
- [x] Trace each flow from click to final result, including dependencies, state transitions, and completion conditions
- [x] Record per-flow findings with exact click paths, outputs, and improvement opportunities

- [x] Add a shared map visualization contract that matches the web bundle shape
- [x] Migrate mobile map types and consumers to the richer visualization contract
- [x] Refactor the native map viewer into a map-first layout with floating controls
- [x] Add native onboarding/help and richer node/edge inspection surfaces
- [x] Add mobile discovery flow parity with working-bundle edge merging
- [x] Add semantic connection synopsis loading and save-connection parity from edge inspection
- [x] Add native parallel-passage drill-in from node inspection
- [x] Tighten chat map-prep and map-ready status affordances
- [x] Add web-style chat full-map pending and live session continuity states
- [x] Fix native map viewport centering, pan, and pinch exploration
- [x] Port web-style map node layout and curved connection rendering into mobile
- [x] Fix the native map runtime regression and restore mobile-safe graph interaction
- [x] Move mobile map derivation onto the web graph logic foundation
- [x] Run a focused four-agent audit on remaining node-click and edge-color UX parity gaps
- [x] Implement web-style node-tap topic routing, spotlight focus state, and semantic connection sheet parity on mobile
- [x] Run a focused four-agent audit on remaining map-modal content and logic parity gaps
- [x] Rebuild the mobile node-press semantic connection card around the web modal content model
- [x] Rebuild the mobile parallel-passages sheet around the web modal hierarchy
- [x] Remove obsolete hidden semantic-sheet branches after the modal parity rebuild
- [x] Add adaptive large-screen map composition with a persistent inspector rail
- [x] Remove the remaining disabled legacy map inspector sheets after the rail migration
- [x] Run mobile typecheck and targeted tests, then update the review notes

## Current Review

- Scope: mobile app button-click flows that produce an output, reviewed for logical consistency, dependency order, state changes, and completion behavior.
- Validation: `npm test` in `apps/mobile` on 2026-03-14. Result: 5 suites passed, 51 tests passed.

## Fix Queue 2026-03-14

- [x] Fix invalid highlight creation and reader-handoff consistency
- [x] Fix library note editor close-on-failure behavior
- [x] Fix bookmark and highlight detail delete dead ends
- [x] Fix reader selection note save attaching to overlapping instead of exact highlights
- [x] Fix chat verse preview reader handoff to preserve verse focus
- [x] Fix silent sign-out failure handling
- [x] Fix map verse preview stale-response overwrite race
- [x] Fix repeated web-shell external open no-op behavior
- [x] Fix Reader roots sheet sizing, scroll reachability, and root-unavailable fallback behavior
- [x] Run mobile tests and update review notes
- [x] Fix API ROOT translation 500s by degrading model failures to lexical fallback responses

## Flow Audit 2026-03-14

- `Navigation > top-bar menu > Reader / Chat / Library / Settings`: no material issues found. Each click only mutates local `activeMode`, dismisses the keyboard, and closes the drawer in one step (`apps/mobile/src/navigation/MobileRootNavigator.tsx`).
- `Auth > Continue with Google / Apple`, `Sign in with email`, `Send magic link`, `Run protected check`: no major ordering issues found. These flows set busy/error state up front and only surface success state after the async auth/probe branch completes (`apps/mobile/src/hooks/useMobileAppController.ts`).
- `Account > Sign out`: issue. Click path `Settings > Sign out` calls `supabase.auth.signOut()` but ignores the returned `error`, so a failed sign-out can leave the session active with no user-facing failure output. Exact path: `apps/mobile/src/screens/AuthHomeAccountScreens.tsx:223-227` -> `apps/mobile/src/hooks/useMobileAppController.ts:913-921`.
- `Bookmarks > New bookmark > suggestion chip > Save bookmark`: no material issues found. This flow resolves canonical book names, bounds-checks chapter input, and keeps the selected suggestion aligned with the eventual saved reference (`apps/mobile/src/screens/DetailScreens.tsx:121-170`, `apps/mobile/src/hooks/useMobileAppController.ts:628-644`, `apps/mobile/src/hooks/useMobileAppController.ts:1925-2004`).
- `Bookmarks > list Refresh / New bookmark / card tap / quick delete`: no material issues found. Refresh, create, open-detail, and delete all point to the expected controller mutations and list refresh state (`apps/mobile/src/screens/DataListScreens.tsx:1186-1261`).
- `Bookmarks > detail > Delete`: issue. After confirm, the bookmark is deleted but the route never pops back to the list, so the completion state is a dead-end `Bookmark not found` screen instead of returning to a valid post-delete destination. Exact path: `Bookmarks list > Bookmark detail > Delete > Confirm`. Code: `apps/mobile/src/screens/DetailScreens.tsx:179-193`, `apps/mobile/src/screens/DetailScreens.tsx:234-252`.
- `Highlights > New highlight > Create highlight`: issue. The create flow only checks for non-empty book/chapter/text and never canonicalizes the book or bounds-checks the chapter, unlike bookmarks. That lets invalid highlights be saved and later breaks downstream outputs like `Open in reader`. Exact path: `Library > Highlights > New highlight > Create highlight`. Code: `apps/mobile/src/screens/DetailScreens.tsx:419-427` -> `apps/mobile/src/hooks/useMobileAppController.ts:2035-2105`.
- `Highlights > detail > Delete`: issue. This mirrors bookmark detail deletion: the mutation succeeds, but the screen is left in the `Highlight not found` fallback instead of navigating back to the list. Exact path: `Highlights list > Highlight detail > Delete > Confirm`. Code: `apps/mobile/src/screens/DetailScreens.tsx:447-467`, `apps/mobile/src/screens/DetailScreens.tsx:538-565`.
- `Library > Connection detail > Note > Save`: issue. The editor always closes after `await onSave(noteDraft)`, but the controller save path catches errors instead of throwing. On failure, the modal and sheet still dismiss, so the user loses context and retry state even though the save did not complete. Exact path: `Library > Connections > Connection card > Note > Save`. Code: `apps/mobile/src/screens/DataListScreens.tsx:393-412`, `apps/mobile/src/screens/DataListScreens.tsx:1076-1087`, `apps/mobile/src/hooks/useMobileAppController.ts:1765-1804`.
- `Library > Map detail > Note > Save`: issue. Same broken handoff as connections: the modal closes unconditionally after the awaited save call even when the controller records a mutation error. Exact path: `Library > Maps > Map card > Note > Save`. Code: `apps/mobile/src/screens/DataListScreens.tsx:510-548`, `apps/mobile/src/screens/DataListScreens.tsx:1090-1110`, `apps/mobile/src/hooks/useMobileAppController.ts:1694-1735`.
- `Library > Highlight sheet > Note > Save`: issue. Same failure pattern again: save errors are swallowed by the controller, but the note editor still closes and clears the only in-context recovery surface. Exact path: `Library > Highlights > Highlight card > Note > Save`. Code: `apps/mobile/src/screens/DataListScreens.tsx:622-641`, `apps/mobile/src/screens/DataListScreens.tsx:1113-1126`, `apps/mobile/src/hooks/useMobileAppController.ts:2108-2144`.
- `Reader > verse selection modal > Note > Save`: issue. If the selected verses overlap any existing highlight, the flow updates the first overlapping highlight's note without reconciling the selected verse range. The click input and saved output can diverge, for example selecting verse 2 but updating a saved highlight for verses 1-3. Exact path: `Reader > long-press verse / select range > Note > Save`. Code: `apps/mobile/src/screens/ReaderScreen.tsx:1341-1356`, `apps/mobile/src/hooks/useMobileAppController.ts:1568-1692`.
- `Reader > chapter nav`, `book selector`, `chapter selector`, `bookmark selector`, `Trace`, `Go Deeper`, `ROOT`, and reference drill-in buttons: no material flow issues found in the code path. State resets and handoffs are ordered coherently across these flows (`apps/mobile/src/screens/ReaderScreen.tsx`).
- `Chat > quick prompts`, `send / stop`, `New Session`, `View map`, `Chain`, `next-branch chips`, `Trace` from verse preview: no major logic breaks found. The send path clears transient tool state before the request, ties streaming output to a message id, and resets map continuity state coherently when a request truly reanchors (`apps/mobile/src/screens/ChatMapScreens.tsx:2256-2527`, `apps/mobile/src/screens/ChatMapScreens.tsx:2821-2857`).
- `Chat > inline reference / citation / chain resource > verse preview > View`: issue. This flow opens Reader without queueing a verse focus target, so the output is only chapter navigation, not verse-level handoff like the bookmark and map flows provide. Exact path: `Chat message > citation/reference > verse preview sheet > View`. Code: `apps/mobile/src/screens/ChatMapScreens.tsx:2867-2873`.
- `Map > node > Reader`, `Map > node > Chat`, `Map > edge > Go deeper`, `Map menu > Discover More / Save Map / Help`, `Map onboarding > Next / Done / Skip`: no major ordering issues found. These flows clear conflicting inspector state before handoff and generally keep bundle/session dependencies aligned (`apps/mobile/src/screens/ChatMapScreens.tsx`).
- `Map > connection verse chip > verse preview`: issue. The preview fetch path is not keyed or cancelled, so tapping verse chips quickly can let an older response overwrite the text for the newer reference. Exact path: `Map edge inspector > verse chip > verse preview sheet`. Code: `apps/mobile/src/screens/ChatMapScreens.tsx:5328-5349`.
- `Map > saved connection metadata > Save notes`: risk. `saveSelectedConnectionMeta()` assumes the awaited controller call succeeded and sets a local success flag immediately afterward. An error effect later tries to correct this, but success state is still derived indirectly from error state rather than from an explicit mutation result. Exact path: `Map edge inspector for saved connection > Save notes`. Code: `apps/mobile/src/screens/ChatMapScreens.tsx:5627-5638`, `apps/mobile/src/hooks/useMobileAppController.ts:1765-1804`.
- `Web shell load error > Retry / Open in Browser / Use Native Shell`: mostly coherent, but one low-severity issue exists. `Open in Browser` suppresses repeated taps for the same URL because `lastExternalUrlRef` is never reset, so a second click can produce no output. Exact path: `Web shell error state > Open in Browser`. Code: `apps/mobile/src/screens/WebAppShellScreen.tsx:167-181`, `apps/mobile/src/screens/WebAppShellScreen.tsx:253-256`.
- Coverage gap: the current mobile tests cover bookmark creation, controller mutations, and route registration, but they do not exercise sign-out failure handling, invalid highlight creation, the library note-editor failure path, chat verse-preview handoff, or the map verse-preview race. The reviewed failures are all in currently uncovered flows.

## Fix Results 2026-03-14

- Resolved invalid highlight creation by canonicalizing the saved book name and rejecting out-of-range chapters before highlight creation.
- Resolved library note-editor close-on-failure behavior by returning explicit success flags from note-save mutations and only dismissing the editor after a successful save.
- Resolved bookmark and highlight detail delete dead ends by navigating back to the previous route only after a successful delete result.
- Resolved reader selection note mismatches by updating notes only for exact verse-range matches and using the split-and-create path for overlap-only selections.
- Resolved chat verse preview reader handoff drift by queueing verse focus before switching to Reader.
- Resolved silent sign-out failures by surfacing Supabase sign-out errors through `authError`.
- Resolved the map verse-preview race by invalidating stale fetch responses when the user taps a newer verse or dismisses the sheet.
- Resolved repeated web-shell external-open no-op behavior by releasing the in-flight URL guard after each handoff attempt.
- Resolved Reader ROOT sheet clunkiness by switching the Reader reference and selection sheets onto bottom-sheet-native scrolling, locking the ROOT view to stable heights, and adding bottom spacing so the lower controls remain reachable.
- Resolved intermittent ROOT request failures by retrying one transient root-translation error before surfacing the unavailable state.
- Resolved API ROOT 500s for recoverable model failures by returning Strong's-backed lexical fallback summaries instead of failing the entire request; the same fallback now covers missing AI configuration.
- Resolved model drift between ROOT and synopsis by moving ROOT onto the same smart-model selection path the synopsis route uses.
- Tuned ROOT sheet spacing again by moving the extra bottom breathing room to the ROOT-specific scroll container instead of padding the panel body, which keeps the lower controls aligned with other sheets while preserving reachability.
- Tightened the Reader header control row so the chapter picker can shrink and truncate cleanly, keeping the bookmark button fully on-screen on narrower devices.
- Updated the ROOT panel to use a selection-style skeleton loader and removed the lost-context swipe capture so long ROOT analysis can scroll normally inside the sheet.
- Added regression coverage in `apps/mobile/src/hooks/__tests__/useMobileAppController.test.tsx` and `apps/mobile/src/screens/__tests__/DetailScreens.test.tsx`.
- Added regression coverage in `apps/mobile/src/hooks/__tests__/useRootTranslationMobile.test.tsx` for transient retry and final failure behavior.
- Validation:
  - `npm test` in `apps/mobile`: 7 suites passed, 60 tests passed.
  - `npm run typecheck` in `apps/mobile`: passed.
  - `npm run build` in `apps/api`: passed.
  - direct fallback helper execution via `npx ts-node --transpile-only`: passed.

## Review

- Added shared visualization contracts in `packages/shared/src/contracts/visualizationContracts.ts` and exported them through `@zero1/shared`.
- Replaced the narrow mobile-only map bundle typing with shared contract re-exports in `apps/mobile/src/types/visualization.ts`.
- Rebuilt `MapViewerScreen` into a map-first native surface with:
  - floating save/help/zoom/reset controls
  - persistent anchor/context summary
  - first-use onboarding overlay persisted in `AsyncStorage`
  - native help/legend sheet
  - richer node detail sheet
  - edge inspection sheet with continuation into Chat
- Extended `MapViewerScreen` with the next parity slice:
  - mutable in-session working bundle so discovered edges merge into the active native map
  - auto/manual `Discover More` pipeline against `/api/discover-connections`
  - discovery progress overlay and unexplored-verse status
  - semantic connection synopsis loading from `/api/semantic-connection/synopsis`
  - save-connection flow from edge inspection into Library using the shared map session contract
- Added the next continuity and node-detail slice:
  - native parallel-passage sheet from node inspection, aligned to the web modal's information model
  - Reader handoff from map nodes/parallels now queues direct verse focus instead of opening only the chapter
  - chat assistant messages now expose explicit `Preparing map`, `Map ready`, verse-count, and connection-count status affordances
- Added the next chat continuity slice:
  - mobile chat now runs a background full `/api/trace` fetch for re-anchor trace requests while keeping the streamed fast map viewable
  - assistant messages now distinguish `Preparing map`, `Loading full map`, `Richer connections loading`, and `Map ready - N verses` states using message-scoped continuity state
  - follow-up requests no longer tear down an in-flight richer map fetch unless the conversation truly reanchors or resets
  - mobile prefers the richer bundle when fast-stream and full-trace responses race, preventing late partial map data from downgrading the active session
- Added the next map viewport UX slice:
  - native map now computes graph bounds and fits the graph into the measured viewport instead of opening with a raw `pan=0` / `scale=1` canvas
  - reset now behaves like a true fit-to-map action that recenters the anchor/graph in view
  - one-finger drag and pinch-to-zoom now drive bounded native viewport transforms so users can explore the full graph without the map getting lost off-screen
  - non-interactive overlays now pass touches through so map exploration stays fluid across more of the screen
- Added the next map layout/rendering parity slice:
  - mobile map now derives a renderable graph model closer to web by using visible nodes, explicit theological edges, and synthetic structural parent-child edges when needed
  - native node placement now follows the web's anchor-centered BFS ring layout instead of the older depth-only placeholder layout
  - connection lines now render as curved SVG paths anchored to node boundaries instead of rotated center-to-center bars
  - mobile now uses family-based edge styling and depth rings so connection structure reads more like the web map
- Added the regression stabilization slice:
  - mobile no longer hard-crashes when the current native runtime lacks `RNSVGSvgView`; the map now falls back to a mobile-safe native edge renderer instead of red-screening
  - mobile map once again renders the full node set instead of over-filtering to `isVisible` hints that do not match the current native expansion model
  - the transformed map layers now explicitly pass pointer events through in the right places so pan/drag can work against the graph surface again
- Added the graph-logic replication slice:
  - the web force-layout and graph-derivation logic now lives in shared code instead of being approximated inside the mobile screen
  - mobile now derives visible nodes, synthetic structure edges, node dimensions, connection families, and graph positions from the same foundation as web
  - the non-SVG fallback renderer now approximates curved connections from the same bezier control points instead of collapsing back to a single straight bar
- Added the focused four-agent UX parity audit:
  - web node click is not just "open node details"; it first tries to resolve connection-topic groups and opens the semantic-connection modal when that is the stronger study affordance
  - web edge semantics are visually opinionated: anchor rays stay gold, non-anchor semantic edges read as electric white with glow, and GREY structural edges remain subdued helpers
  - web focus/hover state changes the whole graph via spotlight dimming and branch highlighting, while mobile still treats selection as a local sheet event instead of a graph-state transition
- Added the node-tap / semantic-sheet parity slice:
  - tapping a node now resolves graph-derived connection-topic groups first, matching the web modal-entry decision instead of always opening plain node details
  - mobile now applies graph-wide spotlight dimming from the focused node or selected semantic topic so the selected branch reads as a graph state, not an isolated sheet event
  - edge styling now follows the web hierarchy more closely: gold anchor rays, electric-white semantic edges, and muted grey structural helpers
  - the mobile connection sheet now behaves more like the web semantic modal by switching topic groups, preserving cluster verse IDs, showing topic cues, and using the active semantic family for synopsis/save/go-deeper flows
- Fixed the edge solidity regression in the native fallback renderer:
  - fallback curved edges are now midpoint-anchored and slightly overlapped so they render as continuous solid connections instead of dashed-looking segmented strokes
- Added the focused four-agent modal parity audit:
  - mobile still treats the semantic connection sheet as a reduced bottom-sheet summary, while web treats `SemanticConnectionModal` as a richer study surface with verse-chip drill-in, topic navigation affordances, progressive verse reveal, and library metadata editing branches
  - mobile does not yet mirror web support logic like topic-title enrichment, verse-tooltip interactions, or the saved-library branch of the semantic modal
  - mobile parallel passages content is directionally aligned but still misses the web modal's exact information model and framing copy
- Rebuilt the node-press semantic connection card closer to the web modal model:
  - mobile semantic drill-in now leads with verse chips, progressive `Show all` / `Show fewer` reveal, synopsis-first reading order, and lightweight topic navigation
  - topic-title enrichment now runs against `/api/semantic-connection/topic-titles` so topic labels can match the richer web modal behavior
  - semantic synopsis requests now use a request-key cache on mobile to avoid recomputing the same topic-cluster analysis repeatedly
  - when the selected semantic connection already exists in Library, the sheet now exposes notes/tags editing instead of only showing a save action
- Rebuilt the mobile parallel-passages sheet closer to the web modal model:
  - the sheet now uses the web modal's `Parallel Accounts` framing with explicit `Primary` and `Also Found In` sections
  - parallel passage dedupe now uses the same normalized-reference and verse-key approach as the web modal helper path
  - similarity treatment now mirrors the web modal's confidence hierarchy more closely by varying row emphasis while keeping the native bottom-sheet form factor
  - the footer now uses the same direct drill-in affordance as web: `Tap a passage to open.`
- Cleaned up the remaining hidden semantic-sheet legacy branches:
  - removed obsolete dead JSX paths from the selected-edge sheet so the file now reflects the live semantic-card implementation instead of keeping unreachable pre-parity UI branches
  - removed style definitions that were only referenced by those dead branches
- Added the large-screen composition parity slice:
  - added `useLayoutMode()` plus a thin `MapInspectorSurface` shell so mobile can switch between compact bottom sheets and an expanded right-hand inspector rail
  - `MapViewerScreen` now derives a single active inspector from node, edge, and parallels state instead of relying on separate modal surfaces for large-screen composition
  - expanded layouts now render the map and inspector as flex siblings, keeping the map visible and interactive while study content updates in place
  - viewport resize behavior no longer blindly refits the whole graph on every layout change; expanded layouts now recenter the active passage inside the actual map pane width while preserving the current zoom level
- Removed the final disabled legacy inspector sheets:
  - deleted the old hidden node, parallels, and edge `BottomSheetSurface` blocks now that the adaptive inspector path is the only live map inspector implementation
- Remaining parity gaps:
  - semantic connection modal still lacks a native equivalent of the web verse-tooltip interaction model
  - final large-screen workspace continuity polish and device-side tuning remain
  - device-level tuning is still needed for exact edge glow/opacity feel against the web map on large live bundles
- Validation:
  - `npx tsc -p apps/mobile/tsconfig.json --noEmit`
  - `npm test -- --runInBand` in `apps/mobile`

## Graph Pipeline Speed Analysis 2026-03-14

- [x] Trace the graph pipeline from `/api/trace` and `/api/chat/stream` ingress through graph construction, SSE delivery, and client rendering
- [x] Validate the existing profiler hotspots against the current source in `graphWalker.ts`, `graphEngine.ts`, `pericopeGraphWalker.ts`, `pericopeSearch.ts`, `expandingRingExegesis.ts`, `runModelStream.ts`, `useChatStream.ts`, `forceLayout.ts`, and `narrativeMapGraph.ts`
- [x] Cross-reference confirmed findings with `SPEED_PLAN.md` and isolate additional bottlenecks visible only in the code path
- [x] Produce a phased implementation plan with sequencing, expected wins, and verification targets

## Graph Pipeline Review 2026-03-14

- Scope: end-to-end graph pipeline analysis only, covering request ingress, anchor/pericope resolution, verse graph construction, pericope graph construction, ranking, dedupe, SSE output, and client-side map/text rendering
- Primary deliverable: `tasks/graph-pipeline-implementation-plan.md`
- Validation: source audit plus `apps/api/profiling/report.md` and `SPEED_PLAN.md`; no runtime code changes or test execution were needed for this analysis task

## Graph Pipeline Safe Implementation 2026-03-14

- [x] Split cheap pericope scope resolution from optional pericope bundle construction
- [x] Batch pericope bundle hydration to remove serial `getPericopeById()` loops
- [x] Narrow hot-path verse selects to avoid overfetching unused columns
- [x] Reuse fetched verse embeddings across ranking and dedupe
- [x] Run `npm run build` in `apps/api` and update review notes

## Graph Pipeline Safe Implementation Review 2026-03-14

- Added `resolvePericopeScopeForVerse()` so `/api/trace`, `/api/chat/stream`, and multi-anchor graph setup can get pericope scope IDs without eagerly building the full narrative bundle.
- Reworked `buildPericopeBundle()` around batched pericope hydration and parallel ring-2 connection fetches, removing the serial `getPericopeById()` loop pattern from ring expansion.
- Added batched `getPericopesByIds()` hydration in `apps/api/src/bible/pericopeSearch.ts`, and moved `getPericopeById()` onto that batched path.
- Started pericope-bundle work in parallel with verse-graph construction on the single-anchor `/api/trace` and `/api/chat/stream` paths so the response payload stays the same while reducing critical-path idle time.
- Reused the ranking pass embedding map inside dedupe with a module-local `WeakMap`, removing the second verse-embedding fetch when ranking has already loaded the same rows.
- Narrowed hot-path `verses` selects in `graphWalker.ts` and `graphEngine.ts` to explicit fields, with hybrid anchor fetches only including `embedding` where needed.
- Validation:
  - `npm run build` in `apps/api`: passed on 2026-03-14.

## Graph Pipeline Throughput Follow-Up 2026-03-14

- [x] Overlap Ring 1 hydration with Ring 2 fetch in `graphWalker.ts`
- [x] Overlap bridge-verse lookup with Ring 3 hydration in `graphWalker.ts`
- [x] Overlap independent hybrid-layer fetches and scoring work in `graphEngine.ts`
- [x] Remove hot stream-loop logging from the steady-state SSE path in `runModelStream.ts`
- [x] Raise web and mobile streamed-text release throughput without changing output content
- [x] Re-run API build plus web/mobile typecheck

## Graph Pipeline Throughput Follow-Up Review 2026-03-14

- Reworked `buildContextBundle()` so Ring 1 verse hydration no longer blocks Ring 2 candidate fetch, and bridge-verse lookup now runs in parallel with Ring 3 verse hydration.
- Reworked `fetchHybridLayer()` so base edge fetch and source pericope mapping start together, edge-pool embedding scoring overlaps the pericope-neighbor branch, and candidate embedding fetch now runs in parallel with centrality fetch.
- Reduced streaming overhead in `runModelStream.ts` by moving the per-event and per-delta debug path behind `STREAM_DEBUG`, while keeping the existing SSE delivery behavior and tool execution flow intact.
- Increased web and mobile text release throughput by switching from a fixed 4 chars/frame cap to an adaptive 12-48 chars/frame release window, which reduces post-model display lag without changing generated text.
- Validation:
  - `npm run build` in `apps/api`: passed on 2026-03-14.
  - `npm run typecheck` in `apps/web`: passed on 2026-03-14.
  - `npm run typecheck` in `apps/mobile`: passed on 2026-03-14.

## Graph Pipeline Reuse Slice 2026-03-14

- [x] Start pericope-validation prerequisites as soon as the final visual-node set is known
- [x] Reuse verse-to-pericope mappings inside `applyPericopeValidation()` instead of re-querying after additional edge fetch
- [x] Pre-resolve multi-anchor pericope scopes before the serial budgeted tree-build loop
- [x] Replace multi-anchor merge-time edge duplicate scans with a `Set`
- [x] Re-run `npm run build` in `apps/api`

## Graph Pipeline Reuse Slice Review 2026-03-14

- Added a shared `fetchPericopeIdsByVerse()` helper in `graphWalker.ts` and moved the verse-to-pericope mapping fetch up to the point where `buildVisualBundle()` already knows the complete node set.
- `buildVisualBundle()` now fetches additional edges and verse-to-pericope mappings together, then passes the mapping into `applyPericopeValidation()` so the validation pass no longer issues its own duplicate verse-map query.
- `buildMultiAnchorTree()` now resolves all per-anchor pericope scopes before entering the serial budget-allocation loop, preserving the existing budget behavior while removing a repeated scope-resolution stall from inside that loop.
- Multi-anchor merge now uses a `Set` for edge duplicate detection instead of repeated `allEdges.some(...)` scans.
- Validation:
  - `npm run build` in `apps/api`: passed on 2026-03-14.

## Graph Pipeline Ingress Slice 2026-03-14

- [x] Collapse SSE event delivery to a single `res.write()` per event
- [x] Batch the structured multi-anchor source/target verse-ID lookups
- [x] Batch LLM reference-range verse-ID lookups inside `resolveAnchorFromReferences()`
- [x] Replace the remaining LLM anchor candidate membership scan with a `Set`
- [x] Re-run `npm run build` in `apps/api`

## Graph Pipeline Ingress Slice Review 2026-03-14

- `runModelStream.ts` now serializes each SSE event once and writes it once, instead of splitting the same event across two `res.write()` calls.
- `resolveMultipleAnchors()` now resolves structured source/target anchor references concurrently, preserving the same fallback order while removing an avoidable serial pair of verse lookups.
- `resolveAnchorFromReferences()` now launches the bounded verse-range `getVerseId()` lookups in parallel, then rebuilds the candidate list in the same deterministic order as before.
- LLM anchor candidate hydration now uses a `Set` for membership filtering instead of repeated `Array.some(...)` scans.
- Validation:
  - `npm run build` in `apps/api`: passed on 2026-03-14.

## Deploy PR Prep 2026-03-14

- [x] Confirm the deploy workflow uses a PR branch merged back into `biblelot`
- [x] Mark `SPEED_PLAN.md` as legacy and remove it from the repo state
- [x] Include `AGENTS.md` and `CLAUDE.md` in the intended commit scope
- [x] Create a feature branch from `biblelot` for the graph-pipeline work
- [ ] Stage the deploy-relevant files and create the commit
- [ ] Push the feature branch and open a PR targeting `biblelot`
