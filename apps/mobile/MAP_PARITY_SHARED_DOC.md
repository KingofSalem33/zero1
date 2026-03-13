# Map Web-to-Mobile Parity Shared Doc

Last updated: 2026-03-12

## Mission

Align the native mobile map experience to the web map experience as closely as possible while making explicit, intentional native concessions.

This document is maintained jointly by 4 coordinated agents:

- Mobile UX Expert
- Mobile UI Expert
- Web UI/UX Source-of-Truth Expert
- Web Logic & Pipeline Source-of-Truth Expert

## Source-of-Truth Scope

### Web UI/UX source files

- `apps/web/src/layouts/RootLayout.tsx`
- `apps/web/src/components/BibleReader.tsx`
- `apps/web/src/components/UnifiedWorkspace.tsx`
- `apps/web/src/components/LibraryView.tsx`
- `apps/web/src/components/golden-thread/NarrativeMap.tsx`
- `apps/web/src/components/golden-thread/VerseNode.tsx`
- `apps/web/src/components/golden-thread/SemanticConnectionModal.tsx`
- `apps/web/src/components/golden-thread/ParallelPassagesModal.tsx`
- `apps/web/src/components/golden-thread/DiscoveryOverlay.tsx`
- `apps/web/src/components/golden-thread/MapControls.tsx`
- `apps/web/src/components/golden-thread/MapOnboarding.tsx`
- `apps/web/src/components/VerseSearchIndicator.tsx`

### Web logic and data-flow source files

- `apps/web/src/hooks/useChatStream.ts`
- `apps/web/src/layouts/RootLayout.tsx`
- `apps/api/src/index.ts`
- `apps/api/src/routes/library.ts`
- `packages/shared/src/contracts/contentContracts.ts`
- `packages/shared-client/src/api/createProtectedApiClient.ts`

### Current mobile implementation files

- `apps/mobile/src/screens/ReaderScreen.tsx`
- `apps/mobile/src/screens/ChatMapScreens.tsx`
- `apps/mobile/src/screens/DataListScreens.tsx`
- `apps/mobile/src/navigation/MobileRootNavigator.tsx`
- `apps/mobile/src/hooks/useMobileAppController.ts`
- `apps/mobile/src/lib/api.ts`
- `apps/mobile/src/types/visualization.ts`

---

## Agent 1 - Web UI/UX Source-of-Truth Expert

### Screen and component inventory

1. Reader trace entry

- `BibleReader` hands selected text to the canonical trace handler.
- Map intent is visible directly from reading and verse exploration, not hidden behind Library.

2. Chat workspace

- `UnifiedWorkspace` is the primary map-producing chat surface.
- Messages can show map-ready actions, map-loading states, tool activity, chain-of-thought, and verse-search progress.

3. Map canvas system

- `NarrativeMap` is a dedicated graph interaction environment, not just a static viewer.
- `VerseNode` encodes anchor state, depth, hub weight, highlight state, parallels, and focus behavior.
- `MapControls` supplies save, zoom, fit, discover, and legend/help actions as floating chrome.
- `DiscoveryOverlay` and `VerseSearchIndicator` make map preparation feel deliberate and alive.
- `MapOnboarding` teaches first-use mental models.

4. Map drill-in surfaces

- `SemanticConnectionModal` is the canonical edge-inspection experience.
- `ParallelPassagesModal` is the canonical parallel-passage drill-in from a verse node.

5. Library re-entry

- `LibraryView` maps tab is a saved-artifact launcher into the same map system.

### Interaction and flow documentation

1. Reader -> trace

- User selects passage or verse-related context.
- Canonical trace handler opens map space immediately.
- Loading overlay shows traced anchor/context before bundle hydration completes.
- Completed bundle lands in the full Narrative Map surface.

2. Chat -> trace

- Trace mode changes composer intent.
- During streaming, the UI exposes verse search, tool progress, and map prep.
- `map_data` can attach to a message before the response fully settles.
- The user can open the map from the message or keep working in split view.

3. In-map exploration

- User pans/zooms a graph-first surface with minimal chrome.
- Tapping/clicking a node spotlights local relationships and opens verse-level exploration affordances.
- Tapping/clicking a colored edge opens semantic connection detail with save and Go Deeper pathways.
- Discover More expands the map instead of forcing a brand-new trace.

4. Library -> saved map

- User opens an already-saved bundle into the same interactive map environment.

### Gap list versus intended mobile experience

1. Mobile has no equivalent for the full map interaction system.

- No onboarding.
- No legend/help.
- No Discover More.
- No semantic edge detail surface.
- No parallel-passages surface.

2. Mobile map presentation is generic rather than product-defining.

- Current native viewer is a card stack around a canvas.
- Web keeps the map as the dominant surface and floats controls around it.

3. Mobile does not yet preserve the same sense of continuity.

- Web keeps map, message, and trace context visibly connected.
- Mobile opens a separate route with less context and fewer continuation actions.

---

## Agent 2 - Web Logic & Pipeline Source-of-Truth Expert

### System inventory

1. Trace pipeline

- `POST /api/trace` is the canonical direct map endpoint.
- Server resolves single or multiple anchors, builds a richer visual bundle, ranks verses, deduplicates parallels, and can include pericope context/bundle data.

2. Chat map pipeline

- `POST /api/chat/stream` is the canonical conversational map pipeline.
- Request semantics include `history`, `promptMode`, `visualBundle`, `mapSession`, and `mapMode`.
- SSE lifecycle includes content deltas plus non-text events used by the UI.

3. Persistence pipeline

- Maps save as `bundle` then `map`.
- Connections save as `bundle` then `connection`.
- Shared protected client and shared contracts already normalize bundle metadata and library records.

4. Session/continuity pipeline

- `buildLibraryMapSession` defines canonical cluster/current-connection/visited-edge semantics.
- Web uses map sessions to continue on-map conversations instead of reanchoring blindly.

5. Discovery and semantic enrichment pipeline

- Web map supports `/api/discover-connections`.
- Web semantic detail supports `/api/semantic-connection/topic-titles` and related synopsis behavior.

### Canonical behavior and invariants

1. The UI must accept the full bundle shape produced by web/backend.

- Web `ThreadNode` includes display labels, parentage, visibility, parallels, centrality, mass, and pericope metadata.
- Mobile currently drops most of that richness.

2. Map preparation is event-driven, not a single final-response parse.

- Clients react to `verse_search`, tool lifecycle events, `map_data`, `chain_data`, and `done`.

3. `map_data` may arrive before the final assistant message is complete.

- The client must support map-ready UI while text is still streaming or pending.

4. Reanchor versus continue-on-map logic is part of product behavior.

- Existing bundle + explicit/off-map references + contextual follow-up all influence whether the system continues the current map session or starts a new one.

5. Library persistence is not a mobile-specific workflow.

- Mobile should keep the same bundle save semantics and shared contracts rather than introducing bespoke map storage.

### Gap list versus current mobile implementation

1. Mobile visualization contract is too narrow.

- `apps/mobile/src/types/visualization.ts` only models `id/book/chapter/verse/text/depth`.
- Web uses many more node fields and optional bundle branches.

2. Mobile map runtime cannot currently express discovery or rich node/edge state cleanly.

- Missing fields prevent parity for topic chips, parallel passages, focus/highlight logic, and pericope cues.

3. Mobile chat does stream, but map lifecycle parity is still partial.

- It handles several SSE events already.
- It does not yet expose the same map-ready/full-map/continuation semantics as the web workspace.

---

## Agent 3 - Mobile UX Expert

### Screen and component inventory

1. Reader map entry

- `ReaderScreen` supports trace from selection and trace from verse reference detail.

2. Chat map entry

- `ChatMapScreens` supports trace mode toggle in composer.
- Assistant messages expose `Open map` / `View map` and `Chain`.

3. Map viewing

- `MapViewerScreen` is a standalone stack route launched from Reader, Chat, or Library.

4. Library map re-entry

- `DataListScreens` has saved maps list items and a map detail sheet.

### Current interaction and flow documentation

1. Reader -> trace

- Selection or verse reference traces directly with `fetchTraceBundle`.
- Success opens `MapViewer`.
- Failure returns a small inline error in the originating modal.

2. Chat -> trace

- Trace toggle routes requests through `/api/chat/stream`.
- Non-trace asks can still use `/api/bible-study`.
- When a message has a bundle, user opens a separate map screen from the message action row.

3. Library -> map

- User opens a saved map from list or detail sheet.
- Map detail sheet supports note/title/tag editing and delete.

4. Map screen

- User can pan, zoom, reset, save map, tap a node, and open that verse in Reader.

### Gap list versus intended experience

1. The map is treated like a detached artifact instead of an active study workspace.

2. There is no native equivalent for:

- Discover More
- semantic edge drill-in
- saved connection creation from the map itself
- parallel passage drill-in
- onboarding/help/legend
- pericope or topic context

3. Conversation continuity is weaker than web.

- Map route does not visibly preserve originating prompt, trace state, or suggested next action.
- There is no equivalent of staying in-context with chat while the map is visible.

4. Saved-map behavior is flatter than web intent.

- Library can reopen a map, but the reopened experience still lacks the deeper in-map workflows.

### Required native concessions

1. Phone can use a full-screen route instead of permanent split view.
2. Hover interactions must become tap-to-focus or sheet-based interactions.
3. Edge and node detail should use native bottom sheets rather than anchored floating modals.

---

## Agent 4 - Mobile UI Expert

### Current visual inventory

1. `MapViewerScreen`

- top summary card
- row of text buttons for zoom/reset/save
- raw canvas with identical edge styling
- detail card beneath the map

2. Chat map affordances

- message action row provides map access
- trace prep is visible in chat but not carried into the map surface

3. Library map affordances

- functional list/detail treatments
- saved-map metadata is stronger than the live-map surface itself

### Gap list versus web

1. Map hierarchy is inverted.

- Web is graph-first with floating chrome.
- Mobile is control-card-first with the graph in the middle.

2. Relationship language is largely absent.

- Web nodes and edges communicate anchor/root/discovery/branch meaning.
- Mobile uses uniform node pills and single-style edges.

3. There is no first-use teaching layer.

4. Map detail surfaces are too thin.

- Web provides semantic inspection, topic switching, and follow-on actions.
- Mobile provides only verse text plus open-in-reader.

### Exact UI changes required

1. Replace the stacked control card with floating map controls.
2. Move node detail into a native sheet with stronger continuity actions.
3. Introduce edge color/type language and an edge detail sheet.
4. Add overlay-based loading and discovery states so the map never feels blank or incidental.

---

## Step 2 - Web Standards Definition

### Authoritative web UI/UX spec

1. Map is a first-class study surface.

- It is not a secondary debug canvas or a simple saved-graph viewer.

2. Context appears immediately.

- The user sees the traced passage or anchor label before the graph fully resolves.

3. Map loading is experiential.

- Overlay, verse search, and tool lifecycle states are part of the product feel.

4. The graph is richly interactive.

- Node interaction, edge interaction, discovery, and save/share/continue actions are all core, not optional polish.

5. Map should deepen study, not interrupt it.

- Every map surface must offer a path back into Reader, Chat continuation, or Library persistence.

### Canonical web logic and pipeline spec

1. Use canonical endpoints and payloads.

- `/api/trace`
- `/api/chat/stream`
- `/api/discover-connections`
- `/api/semantic-connection/*`
- protected `/api/library/*`

2. Preserve full bundle fidelity end-to-end.

- Do not re-model the bundle into a smaller mobile-only shape.

3. Preserve map-session semantics.

- Continue an existing map when appropriate.
- Reanchor only when the prompt truly leaves the active map context.

4. Preserve SSE event semantics.

- `content`
- `verse_search`
- `tool_call`
- `tool_result`
- `tool_error`
- `map_data`
- `chain_data`
- `done`
- `error`

5. Preserve shared persistence semantics.

- Save bundle first, then map/connection records through the shared protected client.

---

## Step 3 - Mobile Mapping

### Required implementation changes

#### P0 foundation

1. Bring mobile map contract to web parity.

- Replace `apps/mobile/src/types/visualization.ts` with the richer web/shared bundle shape or move the type into a shared package.

2. Rebuild native map surface around the graph, not around cards.

- Floating controls
- overlay loading
- persistent anchor context
- sheet-based node and edge drill-ins

3. Add node detail parity.

- focus state
- open in reader
- continue in chat
- show related metadata already present in bundle

4. Add edge detail parity.

- semantic connection sheet
- connection type display
- connected verse previews
- Go Deeper
- Save connection

5. Add discovery parity.

- Discover More CTA
- progress overlay
- discovered-edge merge behavior

#### P1 continuity

6. Tighten chat -> map lifecycle.

- keep message-level map readiness
- preserve current map session across follow-ups
- expose full-map pending and map-ready states more explicitly

7. Tighten library -> map continuity.

- saved maps must open the same richer map surface
- edits in Library must not branch into a weaker viewer

8. Add onboarding and help persistence.

- native first-use walkthrough
- persisted completion flag
- legend/help access

#### P2 larger-screen polish

9. Introduce large-screen layout intent.

- full-screen route on phone remains acceptable
- tablet/landscape should move toward web's simultaneous context model

### Native concessions accepted by all agents

1. Full-screen map route on phone is acceptable.
2. Bottom sheets replace anchored desktop modals.
3. Tap/focus replaces hover, but the same information architecture must remain available.
4. Pinch/pan gestures may replace ReactFlow-style control mechanics as long as navigation and fit/reset are preserved.

---

## Step 4 - Coordination

### Reconciled cross-agent decisions

1. Web remains authoritative for map behavior, event ordering, and bundle semantics.
2. Mobile keeps native presentation only where desktop mechanics do not translate directly.
3. Contract parity is the first blocker to remove.
4. Node and edge drill-in parity is more important than cosmetic map polish.
5. Discover More is a product requirement, not optional future polish.
6. Saved maps must open into the same live map system as fresh traces.

### Daily sync protocol

1. Update this shared doc when source-of-truth changes or concessions are accepted.
2. Log decision changes and unresolved questions in `apps/mobile/MAP_PARITY_THREAD.md`.
3. Do not implement a mobile concession unless it is recorded in both docs.

---

## Unified Alignment Plan

### Phase 1

1. Shared contract parity
2. native map surface refactor
3. node detail sheet
4. edge semantic connection sheet

### Phase 2

5. discovery flow
6. chat lifecycle parity
7. library continuity parity

### Phase 3

8. onboarding/help
9. tablet/large-screen behavior
10. polish, motion, accessibility, and regression coverage

## Main blocker register

1. `apps/mobile/src/types/visualization.ts` is currently the highest-risk mismatch.
2. `MapViewerScreen` is too simplified to host web-equivalent interaction states.
3. Mobile has no preference state for first-use map onboarding.

---

## Implementation status update (2026-03-12)

Completed in this slice:

1. Shared visualization contract parity landed.

- Added `packages/shared/src/contracts/visualizationContracts.ts`.
- Mobile now re-exports the richer shared bundle types instead of maintaining a lossy local type.

2. Native map viewer was refactored toward web intent.

- The live map surface is now graph-first instead of card-first.
- Floating controls replaced the old stacked control card.
- Anchor/context summary now stays visible over the map.

3. Native teaching and inspection surfaces landed.

- First-use onboarding is now persisted with `AsyncStorage`.
- Help/legend sheet now exists on mobile.
- Node detail sheet now exposes passage text, map metadata, Reader handoff, and Chat continuation.
- Edge detail sheet now exposes connection type, verse endpoints, and Chat continuation.

Remaining gaps after this slice:

1. No mobile parallel-passages drill-in yet.
2. Tablet/landscape still uses the same single-route viewer model.
3. Chat-origin map readiness and in-context continuation still lag the web workspace.

## Implementation status update (2026-03-12, slice 2)

Completed in this slice:

1. Discover More parity landed on mobile.

- `MapViewerScreen` now keeps a mutable working bundle instead of treating the incoming bundle as immutable.
- Mobile now calls `/api/discover-connections`, merges newly discovered edges into the active map, and preserves that richer bundle for save and continuation flows.
- Discovery now follows the same high-level web selection priority: anchor, spine, then centrality.

2. Native discovery feedback now exists.

- Mobile now exposes a `Discover More` affordance directly on the map surface.
- A native progress overlay communicates discovery state instead of making discovery feel silent or incidental.
- The summary card now shows remaining unexplored verses.

3. Edge semantic-connection parity deepened.

- Edge inspection now requests synopsis data from `/api/semantic-connection/synopsis`.
- The edge sheet now shows semantic synopsis content, richer verse context, and source-note metadata when present.
- Users can now save a connection directly from the edge sheet into Library using the shared bundle/session persistence path.

Remaining gaps after slice 2:

1. Tablet/landscape split-context behavior is still deferred.
2. Chat-origin map readiness and full workspace continuity still need a dedicated parity pass.

## Implementation status update (2026-03-12, slice 3)

Completed in this slice:

1. Parallel-passage drill-in landed on mobile.

- Node inspection now exposes a dedicated parallel-passage affordance instead of only showing a passive count chip.
- Mobile now opens a native sheet that mirrors the web modal’s structure: primary passage context plus deduped parallel rows with similarity cues.
- Reader handoff from both map nodes and parallel passages now queues exact verse focus rather than dropping the user at chapter level only.

2. Chat-side map readiness is now more explicit.

- Streaming map-producing responses now show `Preparing map` status while verse search is active.
- Completed assistant messages now show explicit `Map ready`, verse-count, and connection-count status cues instead of relying on the map button label alone.
- Full-map fetches from message actions now surface `Loading full map` state more intentionally.

Remaining gaps after slice 3:

1. Tablet/landscape split-context behavior is still deferred.
2. Chat-origin full workspace continuity still lags the web model:

- richer full-map pending semantics
- stronger message-to-map continuity state
- more explicit continuation behavior when a live map session already exists

## Implementation status update (2026-03-12, slice 4)

Completed in this slice:

1. Chat full-map pending parity deepened.

- Mobile trace requests that reanchor now start a background full `/api/trace` fetch while the streamed fast map remains available.
- Assistant messages now carry message-scoped `Loading full map` and `Richer connections loading` states instead of collapsing everything into a generic busy label.
- `Preparing map` now carries the richer verse count whenever bundle data is already known.

2. Live session continuity is stronger.

- Follow-up requests no longer cancel an in-flight richer map fetch unless the conversation truly reanchors or the user resets/stops the owning request.
- The active mobile bundle now prefers the richer result when streamed `map_data` and full-trace responses race, preventing late partial data from downgrading the live session.
- Richer full-trace completion now updates the current active bundle and keeps existing map-session state aligned when possible.

Remaining gaps after slice 4:

1. Tablet/landscape split-context behavior is still deferred.
2. Large-screen workspace continuity still needs a dedicated layout pass beyond phone parity.

## Implementation status update (2026-03-12, viewport UX fix)

Completed in this slice:

1. Native viewport centering now matches web intent more closely.

- Mobile now computes graph bounds from the laid-out nodes and fits the map into the measured viewport on open instead of dropping a raw 1200px canvas at `pan=0`, `scale=1`.
- Reset now behaves like a fit-to-map action, which keeps the anchor/graph centered in the user's view similarly to the web `fitView` pattern.

2. Native exploration gestures are now fluid and bounded.

- One-finger drag now pans the map directly.
- Pinch now scales around the user's touch focal point instead of relying only on zoom buttons.
- Pan is clamped against graph bounds so the map cannot drift irretrievably off-screen during exploration.
- Non-interactive overlay cards now pass touches through, which reduces friction while navigating the graph.

## Implementation status update (2026-03-12, layout and edge parity fix)

Completed in this slice:

1. Native map layout now follows the web model more closely.

- Mobile now derives a renderable graph from visible nodes plus structural parent-child links, matching the web map's distinction between explicit theological edges and synthetic helper edges.
- Node placement now follows an anchor-centered BFS ring layout instead of the earlier depth-bucket placeholder layout.
- Depth rings now render behind the graph, which restores the web map's spatial hierarchy cues.

2. Native connection rendering now matches web intent more closely.

- Mobile now renders connection paths with `react-native-svg` instead of rotated rectangular bars.
- Edges now attach to node boundaries rather than node centers.
- Connections now use curved paths and family-based styling so the graph reads as a connected system rather than a set of disconnected straight segments.

Remaining gaps after this slice:

1. Tablet/landscape split-context behavior is still deferred.
2. Large-screen workspace continuity still needs a dedicated layout pass beyond phone parity.

## Implementation status update (2026-03-12, runtime stabilization after edge-port regression)

Completed in this slice:

1. Native runtime compatibility is restored.

- Mobile no longer assumes `react-native-svg` is available in every currently running native shell.
- If the SVG native view manager is unavailable, the map now falls back to a built-in native edge/ring renderer instead of red-screening the entire screen.

2. Mobile graph visibility and interaction are restored.

- The native map now renders the full node set again instead of over-applying web `isVisible` hints without the web's expansion model.
- The transformed graph layers now pass touches through in the correct places so map drag/pan can work again.

Remaining gaps after this stabilization slice:

1. Device-level visual tuning is still needed for the fallback renderer versus the full SVG renderer.
2. Tablet/landscape split-context behavior remains deferred.

## Implementation status update (2026-03-12, shared graph logic replication)

Completed in this slice:

1. Mobile graph derivation now follows the web foundation more directly.

- The web map's node-dimension, visibility, synthetic-edge, connection-family, and force-layout derivation now lives in shared code instead of being re-guessed inside the mobile screen.
- Mobile now consumes that shared graph model before rendering the native surface.

2. Current-runtime rendering now stays aligned to that shared graph.

- When SVG is available, mobile renders the derived graph with curved path geometry.
- When SVG is unavailable, the fallback renderer now approximates curved bezier motion from the same control points instead of dropping back to a single straight line.

Remaining gaps after this slice:

1. Device-level tuning is still needed to compare the SVG renderer and fallback renderer against the live web graph on the same bundle.
2. Tablet/landscape split-context behavior remains deferred.

## Focused four-agent audit (2026-03-12, node-click and edge-semantics parity)

### Mobile UX Expert

Findings:

1. Mobile node tap is still too literal.

- Current behavior opens a node detail sheet directly.
- Web click behavior is more interpretive: it tries to resolve the strongest connection-topic group for that node and opens semantic relationship study when appropriate.

2. Mobile selection does not yet reframe the graph.

- Web focus/hover changes surrounding node and edge emphasis.
- Mobile selection currently feels like inspecting a detached object rather than entering a focused graph-reading mode.

Gap list:

1. Missing graph spotlight state on mobile.
2. Missing topic-first semantic connection entry from node tap.
3. Missing graph-wide state shift when a node becomes the user's attention target.

### Mobile UI Expert

Findings:

1. Edge color semantics are still too locally styled.

- Web is visually strict: gold anchor rays, electric white semantic edges, muted grey structure.
- Mobile currently uses type-family colors across many edges, which reads differently than the web graph even when the layout improves.

2. Node selection chrome is too thin.

- Web nodes carry semantic border tint, hub prominence, dimming, and branch/focus affordances.
- Mobile still reads more like selected pills on a canvas.

Gap list:

1. Anchor-ray gold treatment is not yet authoritative on mobile.
2. Non-anchor semantic edges are not yet unified into the web's electric-white reading.
3. Node focus styling does not yet recompose the whole scene the way web does.

### Web UI/UX Source-of-Truth Expert

Authoritative behaviors:

1. Node click is modeful.

- Shift-click toggles focus mode explicitly.
- Standard click first resolves connection topics for the clicked verse.
- If a topic group exists, the semantic connection modal opens at the click position.
- If no topic group exists, focus mode toggles on the node instead.

2. The graph reacts to attention.

- `focusedNodeId` / `hoveredNodeId` drive spotlight dimming.
- Branch highlighting can override default spotlight behavior.
- Attention is therefore a graph-state change, not just a local card selection.

3. Edge hierarchy is intentional.

- Anchor rays use `ANCHOR_EDGE_COLOR` gold.
- Non-anchor semantic edges use `ELECTRIC_EDGE_COLOR` white.
- Structural/synthetic helpers remain GREY and visually subordinate.

### Web Logic & Pipeline Source-of-Truth Expert

Authoritative logic:

1. Web derives connection topics from the graph, not just from node metadata.

- `buildConnectionTopics`, `pickDefaultTopic`, and parent-edge override logic determine what modal opens from a node click.

2. Edge style is a layered decision.

- Connection family determines labeling/grouping.
- `getEdgeStroke` then applies the final visual rule:
  - GREY or synthetic -> gradient helper edge
  - anchor ray -> gold
  - otherwise -> electric white

3. Focus/highlight operates as a graph-state pipeline.

- Node attention determines connected nodes and edges.
- The graph then dims unrelated nodes/edges and adjusts glow/filter/opacity accordingly.

## Unified alignment update

Highest-priority remaining parity work from all four agents:

1. Recreate web node-click semantics on mobile.

- Node tap should route through connection-topic resolution before falling back to plain node detail.

2. Recreate web graph attention state on mobile.

- Focusing a node should dim unrelated nodes/edges and elevate the connected subgraph.

3. Recreate web edge visual semantics on mobile.

- Gold from the anchor.
- Electric white for non-anchor semantic edges.
- Grey only for structural helpers.

## Round 14 - Node-tap, spotlight, and semantic-sheet parity implemented

### Mobile UX Expert

Findings after implementation:

1. Node tap now behaves like a study action instead of a generic details action.

- Mobile resolves graph-derived topic groups first and opens the semantic connection sheet on the strongest topic, which matches the web product's intent more closely.
- A second tap on the same focused topic path can still fall back to passage details when the user wants local verse context instead of semantic study.

2. Focus now changes the scene, not just the sheet.

- Selecting a topic or focusing a node dims unrelated nodes and edges across the whole graph.
- This materially improves wayfinding because the chosen branch now reads as the active study surface.

### Mobile UI Expert

Findings after implementation:

1. Edge hierarchy now matches the web reading model more closely.

- Anchor rays render gold.
- Non-anchor semantic edges render electric white.
- Structural helpers stay muted grey.

2. The semantic sheet now reflects topic-group state.

- Topic chips switch the active semantic family.
- The sheet presents the connected verse cluster and topic cues rather than pretending every selection is only a single pairwise edge.

### Web UI/UX Source-of-Truth Expert

Parity status:

1. Mobile now mirrors the web decision pipeline more closely.

- `buildConnectionTopics` -> `pickDefaultTopic` -> semantic sheet open now exists on native.
- Plain node details are no longer the default response when a verse has meaningful semantic groupings.

2. Mobile now mirrors the web graph attention model more closely.

- Focused node or selected topic now drives spotlight dimming across nodes and edges.
- The selected branch remains visually dominant while the rest of the graph recedes.

### Web Logic & Pipeline Source-of-Truth Expert

Parity status:

1. Semantic-sheet requests now use the active topic family, cluster verse IDs, and topic-context hints.

- Native synopsis fetches now follow the selected semantic topic instead of always using a raw edge type.
- Save/go-deeper actions also preserve the cluster-based graph session more faithfully.

2. Remaining logic drift is narrower now.

- The main remaining parity gap is not the node-click pipeline anymore.
- The next gap is exact renderer feel and larger-screen workspace behavior.

## Round 15 - Focused map-modal content and logic audit

### Modal inventory

Mobile modal/sheet inventory:

1. Node detail bottom sheet in `ChatMapScreens.tsx`

- Header with reference/subtitle
- Meta chips
- Optional pericope callout
- Parallel preview
- Verse text
- `Open in reader` / `Continue in chat`

2. Parallel passages bottom sheet in `ChatMapScreens.tsx`

- Primary passage callout
- Scroll list of parallels
- Reader navigation on tap

3. Semantic connection bottom sheet in `ChatMapScreens.tsx`

- Topic chips
- Active verse callout
- Connected passage cards
- Topic cues
- Source note
- Semantic synopsis
- `Study connection` / `Save connection` / `Passage details`

Web source-of-truth modal inventory:

1. `SemanticConnectionModal.tsx`

- Floating modal anchored to click position
- Verse reference chips with verse tooltip drill-in
- Progressive cluster loading / `Show all` / `Show fewer`
- Synopsis loading skeleton
- Topic navigator dots + next arrow
- `Go Deeper`
- Save state
- saved-library branch with notes/tags editing
- topic-title enrichment and cluster-aware synopsis logic

2. `ParallelPassagesModal.tsx`

- Floating modal anchored to click position
- `Parallel Accounts` framing
- `Primary` section
- `Also Found In` list
- footer hint

### Mobile UX Expert

Findings:

1. Mobile semantic drill-in is still a compressed summary of the web experience.

- The user can inspect the connection, but the mobile sheet does not yet feel like the same study surface because it lacks verse-chip navigation, progressive reveal, and the saved-connection editing branch.

2. Mobile parallel passages are functionally useful but less legible as a designed study mode.

- Web frames the modal as a focused parallel-accounts tool with primary/context/list hierarchy.
- Mobile currently reads as a generic list sheet.

Gap list:

1. Missing verse-chip interaction parity.
2. Missing progressive cluster reveal (`Show all` / `Show fewer`).
3. Missing saved-library metadata editing branch in the semantic sheet.
4. Missing stronger parallel-passages framing and guidance copy.

### Mobile UI Expert

Findings:

1. Bottom sheet is an acceptable native concession, but the content blocks still drift from web.

- The web semantic modal has a tighter visual order: title -> verse chips -> synopsis -> topic navigator -> actions -> optional notes/tags.
- Mobile currently inserts multiple card sections that make the sheet feel heavier and less focused.

2. Topic navigation affordance still differs materially.

- Web uses concise dots plus next-arrow navigation.
- Mobile uses larger chips only, which changes how users scan and switch semantic families.

Gap list:

1. Reduce card stacking in the semantic sheet.
2. Port verse-chip presentation and reveal controls.
3. Port a native equivalent of topic navigator state, not just topic chips.
4. Align parallel modal section hierarchy with web.

### Web UI/UX Source-of-Truth Expert

Authoritative behaviors:

1. `SemanticConnectionModal` is not just an explanation card.

- It is the main connection-study workspace.
- Verse references are tappable chips.
- Topic navigation is lightweight and always near the synopsis.
- Save state can expand into editable notes/tags when the connection already lives in Library.

2. `ParallelPassagesModal` is intentionally compact and framed.

- It distinguishes primary verse from parallels.
- It gives the user a clear `Also Found In` reading path.

3. Modal content order matters.

- The web ordering keeps semantic understanding ahead of raw metadata.
- Mobile currently emphasizes support cards and metadata sooner than web does.

### Web Logic & Pipeline Source-of-Truth Expert

Authoritative logic:

1. Web semantic modal has extra logic mobile does not yet replicate.

- Topic-title enrichment via `/api/semantic-connection/topic-titles`
- request-key caching for synopsis fetches
- connected-verse preview / cluster loading behavior
- library-entry metadata editing branch
- verse-tooltip interaction state

2. Web modal state is topic-family centric, not edge-card centric.

- The selected topic defines title, verse set, synopsis request context, go-deeper payload, and save behavior.
- Mobile has part of this, but not the full supporting state machine.

## Unified alignment update

Highest-priority modal parity work from all four agents:

1. Rebuild the mobile semantic connection sheet from the web modal content model, not from a generic bottom-sheet card stack.
2. Add the missing web modal logic branches:

- topic-title enrichment
- verse-chip drill-in
- progressive cluster reveal
- saved-library notes/tags editing

3. Reframe the mobile parallel passages sheet around the web modal's `Primary` / `Also Found In` hierarchy.

## Round 16 - Node-press semantic card rebuild landed

### Mobile UX Expert

Findings after implementation:

1. The node-press card now behaves more like the web study surface.

- Mobile semantic drill-in now starts with connected verse chips, then synopsis, then topic navigation, which is much closer to the web reading flow.
- The card no longer feels primarily like a stack of support cards around a connection.

2. Saved-connection behavior is materially closer to web.

- When the active semantic selection already exists in Library, the card now exposes notes/tags editing instead of only offering another save action.

### Mobile UI Expert

Findings after implementation:

1. Topic navigation is now lighter.

- Mobile now has a native dot-and-arrow topic navigator plus compact topic pills, which is closer to the web card than the previous large chip-only treatment.

2. Verse handling is now closer to web.

- The card supports `Show all` / `Show fewer` for larger clusters and presents references as chips instead of only as stacked passage cards.

### Web UI/UX Source-of-Truth Expert

Parity status:

1. The semantic card now follows the web modal's content order more closely.

- title/meta
- verse chips
- synopsis
- topic navigation
- actions
- optional saved-library editing branch

2. One UX gap remains.

- Web still has verse-tooltip interaction inside the modal.
- Mobile currently uses chip-to-reader drill-in as the native concession.

### Web Logic & Pipeline Source-of-Truth Expert

Parity status:

1. Supporting modal logic is now closer to web.

- topic-title enrichment now runs on mobile
- semantic synopsis fetches now use request-key caching
- saved-library metadata editing now exists in the semantic sheet path

2. Remaining logic drift is narrower.

- The main remaining modal gap is parallel-passages parity and the lack of a native verse-tooltip equivalent.

## Round 17 - Parallel-passages modal hierarchy landed

### Mobile UX Expert

Findings after implementation:

1. The parallel sheet now reads more like the web modal.

- Mobile now opens a compact study sheet framed as `Parallel Accounts`, with the primary verse established first and alternate witnesses listed second.

2. The drill-in affordance is clearer.

- The footer hint and tighter list rows make it obvious that the user is choosing another witness to open, not reading a second full detail card.

### Mobile UI Expert

Findings after implementation:

1. The content hierarchy is closer to web.

- The native bottom sheet now mirrors the web modal's `Primary` / `Also Found In` ordering instead of using a generic header plus list.

2. Similarity treatment is closer to web.

- Higher-confidence parallels retain stronger visual emphasis while lower-confidence rows step back slightly, matching the web modal's confidence-weighted reading order.

### Web UI/UX Source-of-Truth Expert

Parity status:

1. The main structural drift is resolved.

- The modal framing, section titles, and footer instruction now match the web source of truth much more closely.

2. Native concession remains acceptable.

- The bottom-sheet container is still mobile-native, but the content model now matches the web modal rather than a custom mobile summary card.

### Web Logic & Pipeline Source-of-Truth Expert

Parity status:

1. Parallel filtering is aligned.

- Mobile now uses the same normalized reference and verse-key dedupe pattern the web modal uses before rendering alternate passages.

2. Remaining modal drift is narrower.

- The dominant remaining modal gap is the semantic card's lack of a native equivalent to the web verse-tooltip interaction.

## Round 18 - Semantic-sheet dead-branch cleanup landed

### Mobile UX Expert

Findings after cleanup:

1. The live mobile modal path is now clearer in code.

- The selected-edge sheet no longer carries hidden legacy UI branches that described an older, pre-parity reading order.

2. This reduces future UX drift risk.

- Further modal tuning can now target the actual semantic-study surface without accidentally reviving outdated branch content.

### Mobile UI Expert

Findings after cleanup:

1. Obsolete style inventory is reduced.

- Styles that only existed for unreachable connection-card and topic-cue branches were removed.

2. The remaining modal surface is easier to tune.

- Future UI changes now operate against the current web-aligned chip/synopsis/topic flow only.

### Web UI/UX Source-of-Truth Expert

Parity status:

1. This is maintenance, not a behavior change.

- The user-facing parity result stays the same, but the code now more honestly represents the shipped web-aligned modal experience.

### Web Logic & Pipeline Source-of-Truth Expert

Parity status:

1. Dead logic drift has been reduced.

- The semantic-sheet path no longer contains unreachable alternate rendering branches that could confuse future parity work.

## Round 19 - Large-screen adaptive inspector composition landed

### Mobile UX Expert

Findings after implementation:

1. Large screens no longer feel phone-constrained.

- Tablets and foldables can keep the map visible while inspecting node, edge, or parallel content in a persistent right-side rail.

2. Exploration is freer.

- Opening inspector content on expanded layouts no longer needs to cover the map with a blocking bottom sheet, so panning and pinch exploration can continue while reading.

### Mobile UI Expert

Findings after implementation:

1. The composition is now intentionally two-mode.

- Compact layouts keep the existing bottom-sheet behavior.
- Expanded layouts switch to a sibling inspector rail rather than trying to fake a phone sheet on a wide canvas.

2. The inspector shell is thin.

- The adaptive surface only swaps container behavior; the node, edge, and parallels content models remain owned by the map screen.

### Web UI/UX Source-of-Truth Expert

Parity status:

1. The large-screen reading model is closer to web.

- Web keeps the map visible while contextual study surfaces appear alongside it.
- Mobile now follows that same composition principle on expanded layouts.

2. The highest-value centering issue is addressed.

- Active inspection on expanded layouts now recenters the target passage inside the visible map pane instead of targeting the full screen width.

### Web Logic & Pipeline Source-of-Truth Expert

Parity status:

1. State survives the layout mode switch.

- The inspector rail is derived from existing selection state, so compact-to-expanded transitions preserve the active node, edge, or parallels context.

2. Resize behavior is less destructive.

- Mobile no longer blindly refits the whole graph on every viewport size change; expanded layouts clamp or recenter using the current graph state and actual canvas width.

## Round 20 - Legacy inspector sheets removed

### Mobile UX Expert

Findings after cleanup:

1. The shipped large-screen path is now the only inspector path in the map screen.

- There are no hidden duplicate node, parallels, or edge sheet branches left beside the adaptive inspector implementation.

### Mobile UI Expert

Findings after cleanup:

1. The screen code is cleaner.

- The adaptive inspector rail/sheet composition now stands alone without disabled duplicate surfaces to maintain in parallel.

### Web UI/UX Source-of-Truth Expert

Parity status:

1. This is a maintenance cleanup.

- No user-facing behavior changed, but future parity work is now less likely to regress toward the old always-bottom-sheet structure.

### Web Logic & Pipeline Source-of-Truth Expert

Parity status:

1. Dead layout branching has been removed.

- The map screen now has one inspector state pipeline and one live rendering path for node, edge, and parallels inspection.
