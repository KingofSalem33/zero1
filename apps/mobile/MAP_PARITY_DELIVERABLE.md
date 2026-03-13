# Map Web-to-Mobile Parity Deliverable

Last updated: 2026-03-12

## Outcome

This backlog defines the implementation path to make mobile maps intentionally align with the current web experience while preserving native fit.

## Prioritized backlog

| Priority | Workstream                               | Primary owner                               | Supporting owner                            | Acceptance criteria                                                                                                                                                                                   |
| -------- | ---------------------------------------- | ------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Shared visualization contract parity     | Web Logic & Pipeline Source-of-Truth Expert | Mobile UI Expert                            | Mobile accepts the full web bundle shape, including display labels, parent/visibility metadata, parallel passages, pericope context, and optional sub-bundles without lossy transforms.               |
| P0       | Native map surface refactor              | Mobile UI Expert                            | Mobile UX Expert                            | The live map screen is graph-first, keeps anchor context visible, uses floating controls, and removes the current top-card/bottom-card layout as the primary interaction model.                       |
| P0       | Node detail parity                       | Mobile UX Expert                            | Mobile UI Expert                            | Tapping a node opens a native detail sheet with verse text, available metadata, open-in-reader, and continue-in-chat continuity actions.                                                              |
| P0       | Semantic connection modal content parity | Mobile UX Expert                            | Web Logic & Pipeline Source-of-Truth Expert | Mobile semantic drill-in matches web content and state branches: verse chips, topic navigation, progressive reveal, cluster-aware synopsis, save state, and library metadata editing when applicable. |
| P0       | Parallel passages modal content parity   | Mobile UI Expert                            | Web UI/UX Source-of-Truth Expert            | Mobile parallel-passages drill-in matches the web modal's `Primary` plus `Also Found In` framing and preserves the same reading hierarchy in a native sheet form.                                     |
| P1       | Discovery flow parity                    | Web Logic & Pipeline Source-of-Truth Expert | Mobile UI Expert                            | Mobile can trigger Discover More, show progress overlay states, and merge discovered connections into the active map session.                                                                         |
| P1       | Chat map lifecycle parity                | Mobile UX Expert                            | Web Logic & Pipeline Source-of-Truth Expert | Chat preserves map-ready status, full-map pending states, session continuation, and SSE-driven tool/verse-search/map events in a way that matches web intent.                                         |
| P1       | Library map continuity parity            | Mobile UX Expert                            | Mobile UI Expert                            | Opening a saved map from Library launches the same rich viewer used by live traces, not a reduced alternate flow.                                                                                     |
| P1       | Onboarding, legend, and help             | Mobile UI Expert                            | Web UI/UX Source-of-Truth Expert            | First-use map onboarding exists on mobile, completion is persisted, and help/legend remain accessible after onboarding.                                                                               |
| P2       | Large-screen layout parity               | Mobile UI Expert                            | Mobile UX Expert                            | Tablets and landscape layouts move toward simultaneous context visibility instead of treating map as an isolated artifact.                                                                            |
| P2       | Regression coverage and polish           | Web Logic & Pipeline Source-of-Truth Expert | Mobile UX Expert                            | Type coverage, runtime tests, and parity checklist coverage exist for trace, chat map events, library map reopen, discovery, and connection save flows.                                               |

## Component mapping

| Web source                                       | Mobile target                                                        | Required action                                                                                   | Status   |
| ------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------- |
| `UnifiedWorkspace` map-ready message affordances | `ChatMapScreens.tsx`                                                 | Tighten map-ready/full-map/session continuity states                                              | Partial  |
| `NarrativeMap`                                   | new native narrative map surface replacing current `MapViewerScreen` | Rebuild core viewer architecture                                                                  | Partial  |
| `VerseNode`                                      | native node render + node detail sheet                               | Add node hierarchy, metadata, drill-in behavior, spotlight state, and topic-first click semantics | Complete |
| `SemanticConnectionModal`                        | native semantic connection sheet                                     | Port full web content model and logic branches, not just actions                                  | Partial  |
| `ParallelPassagesModal`                          | native parallel passages sheet                                       | Port exact section hierarchy and supporting copy into native sheet form                           | Partial  |
| `DiscoveryOverlay`                               | native map/discovery overlay                                         | Add experiential map-loading and discovery feedback                                               | Partial  |
| `MapControls`                                    | floating native control cluster                                      | Add discover/help/save/fit controls without card-heavy chrome                                     | Partial  |
| `MapOnboarding`                                  | native onboarding overlay                                            | Add first-use instruction flow with persistence                                                   | Partial  |
| `LibraryView` maps tab -> open map               | `DataListScreens.tsx` -> rich map viewer                             | Preserve continuity into the same viewer                                                          | Partial  |
| full web `VisualContextBundle` type              | `apps/mobile/src/types/visualization.ts` or shared contract import   | Remove lossy mobile-only narrowing                                                                | Complete |

## UX flow diagrams

### Reader-origin map flow

```text
Reader
  -> Selection or verse detail
  -> Trace
  -> native map route opens immediately with anchor/loading overlay
  -> bundle hydrates
  -> node or edge drill-in
  -> Open in Reader / Go Deeper / Save
```

### Chat-origin map flow

```text
Chat
  -> Trace mode ask or map-capable answer
  -> SSE content + verse search + tool events + map_data
  -> message shows map-ready state
  -> Open Map
  -> native map route with active session context
  -> Discover More or edge drill-in
  -> continue on-map conversation
```

### Library-origin map flow

```text
Library Maps
  -> select saved map
  -> open same rich native map viewer
  -> inspect node or edge
  -> Open in Reader / Go Deeper / edit metadata / delete
```

## Exact mobile changes by area

### Runtime and contracts

1. Replace the simplified mobile visualization types with the full web contract.
2. Reuse shared/session helpers instead of duplicating a mobile-specific map model.
3. Preserve canonical save flows:
   - create bundle
   - create map or connection

### Native map surface

1. Replace the current `MapViewerScreen` layout with:
   - immersive canvas
   - floating controls
   - overlay-based loading and discovery
   - sheet-based drill-in surfaces
2. Add native fit/reset/zoom affordances that do not compete with the canvas.

### Chat continuity

1. Keep trace prep and map readiness visible from the originating assistant message.
2. Preserve current active map session when follow-ups stay on-map.
3. Distinguish:
   - preparing map
   - map ready
   - richer/full map pending
4. Keep the fast streamed map usable while a richer background full trace continues for the same message.

### Node and edge interaction parity

1. Node tap must first resolve web-style connection-topic behavior before falling back to plain node details.
2. Focusing a node must dim unrelated nodes and edges so the graph enters a readable spotlight state.
3. Edge stroke hierarchy must match web intent:
   - gold from the anchor
   - electric white for non-anchor semantic edges
   - grey only for structural helpers
4. Semantic connection drill-in must preserve the active topic family, connected verse cluster, and topic-switching affordance rather than flattening everything into one raw edge.
5. Semantic connection drill-in must also preserve the web modal's content/state branches:
   - verse-chip drill-in
   - `Show all` / `Show fewer`
   - topic navigator affordance
   - saved-library notes/tags editing

### Library continuity

1. Saved maps must open into the same viewer as fresh traces.
2. Metadata editing in Library stays, but map exploration happens inside the richer viewer.

## Native concessions

1. Phone uses a full-screen route instead of web split view.
2. Bottom sheets replace anchored desktop modals.
3. Tap/focus replaces hover.
4. Tablet split view is deferred until phone parity is stable.

## Approval gate

This plan should not be considered complete until implementation proves:

1. Reader, Chat, and Library all converge into one coherent native map system.
2. Mobile can consume the same bundle richness the web map depends on.
3. Discover, inspect, continue, and save all work from inside the native map experience.
