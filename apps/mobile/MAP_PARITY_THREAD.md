# Map Web-to-Mobile Parity Thread

Last updated: 2026-03-12

## Thread Purpose

Continuous reconciliation between:

- Mobile UX Expert
- Mobile UI Expert
- Web UI/UX Source-of-Truth Expert
- Web Logic & Pipeline Source-of-Truth Expert

## Thread Log

### Round 1 - Baseline extraction

- Web UI/UX Expert:
  - Web map is a first-class study mode with a dedicated interaction system, not just a saved graph viewer.
  - The source-of-truth surfaces are `UnifiedWorkspace` and `NarrativeMap`, with Reader and Library acting as entry points.
- Web Logic Expert:
  - `/api/trace` and `/api/chat/stream` are both canonical map producers.
  - Bundle fidelity matters because the web UI depends on fields mobile does not currently model.
- Mobile UX Expert:
  - Mobile already has the right entry points from Reader, Chat, and Library.
  - The native map route is missing most of the in-map journeys that make the web experience valuable.
- Mobile UI Expert:
  - Current map screen is functional but visually generic.
  - The map does not yet carry the same product identity as web.

Consensus:

1. This is not just a styling pass.
2. Mobile needs both contract parity and interaction-surface parity.

### Round 2 - Web standards ratified

- Web UI/UX Expert:
  - Required web-defining elements:
    - immediate anchor context
    - experiential loading
    - graph-first presentation
    - node and edge drill-ins
    - Discover More
    - continuity into Reader/Chat/Library
- Web Logic Expert:
  - Required technical invariants:
    - full `VisualContextBundle` fidelity
    - SSE lifecycle parity
    - canonical `mapSession` semantics
    - protected shared persistence

Consensus:

1. Mobile may adapt layout mechanics.
2. Mobile may not invent a reduced map model.

### Round 3 - Mobile gap reconciliation

- Mobile UX Expert:
  - The current full-screen native route is acceptable, but it needs to preserve origin context and next actions.
  - Edge-driven "why are these verses connected?" learning is missing today.
- Mobile UI Expert:
  - Rebuilding around a floating-control map surface is necessary.
  - A bottom sheet system can carry semantic connection details, node details, and help content cleanly.
- Web UI/UX Expert:
  - Full-screen phone route is accepted as the main native concession.
  - Hover-only desktop behavior can become tap/focus, but information depth must remain.
- Web Logic Expert:
  - Discovery and semantic connection surfaces depend on metadata that mobile currently drops.

Consensus:

1. `apps/mobile/src/types/visualization.ts` must be fixed before deeper parity work.
2. `MapViewerScreen` must be replaced or heavily refactored, not lightly patched.

### Round 4 - Implementation order agreed

- Web Logic Expert:
  - Start with shared contract parity and session/runtime fidelity.
- Mobile UI Expert:
  - Then rebuild the viewer shell and controls so later features have the right home.
- Mobile UX Expert:
  - Then add node and edge drill-ins before library polish.
- Web UI/UX Expert:
  - Discover More and onboarding should land before final polish because they shape the product's mental model.

Consensus:

1. Phase 1
   - contract parity
   - map surface refactor
   - node and edge detail parity
2. Phase 2
   - discovery
   - chat continuity
   - library continuity
3. Phase 3
   - onboarding/help
   - tablet layout
   - polish and coverage

## Open Questions

1. Should the richer visualization types move into `packages/shared`, or should mobile import the web definition directly first and refactor later?
2. Should tablet/landscape get split view in the first implementation wave or after phone parity is stable?
3. How much of the web focus/spotlight behavior should be recreated with explicit tap states versus transient gesture states on mobile?

## Decision Register

1. Web is authoritative for map behavior and bundle semantics.
2. Full-screen map route on phone is an approved native concession.
3. Bottom sheets are the approved replacement for desktop map modals.
4. Discovery is part of parity scope.
5. Rich edge inspection is part of parity scope.

### Round 5 - First implementation slice landed

- Web Logic Expert:
  - The mobile bundle contract now matches the richer shared/web shape instead of the older narrowed local type.
  - This removes the main blocker for pericope, parallel-passage, and richer node metadata parity.
- Mobile UI Expert:
  - The native viewer is now map-first with floating controls and persistent context instead of stacked cards above and below the canvas.
- Mobile UX Expert:
  - Users can now inspect nodes and edges in native sheets and continue the thread into Chat or Reader from the map itself.
- Web UI/UX Expert:
  - Onboarding/help now exists on mobile, but discovery and full semantic-connection depth still remain to close.

Consensus:

1. The foundation is now correct enough to build discovery and deeper edge parity on top.
2. The next implementation slice should focus on Discover More and semantic-connection save depth.

### Round 6 - Discovery and edge-save parity landed

- Web Logic Expert:
  - Mobile now uses the canonical `/api/discover-connections` and `/api/semantic-connection/synopsis` endpoints instead of inventing local-only edge behavior.
  - Discovered connections merge into the active working bundle and therefore persist through downstream save flows.
- Mobile UI Expert:
  - Discovery now has a dedicated floating CTA plus an experiential progress overlay, which keeps the map surface feeling active instead of static.
  - The edge sheet now carries enough structure to support semantic inspection rather than acting like a thin transport panel.
- Mobile UX Expert:
  - Users can now inspect a connection, get a synopsis, save it directly to Library, or continue studying it in Chat from the same sheet.
  - The map now behaves more like an active study workspace than a detached artifact.
- Web UI/UX Expert:
  - This closes the biggest missing web-to-mobile parity gap after the first slice.
  - The remaining missing user-facing flow is parallel-passage drill-in plus stronger chat/workspace continuity.

Consensus:

1. Discovery is no longer a planning item; it is now an implemented mobile capability.
2. The next parity slice should move to parallel passages and chat/workspace continuity rather than revisiting map chrome.

### Round 7 - Parallel passages and chat status continuity landed

- Mobile UX Expert:
  - Node inspection now has a real next step for parallel accounts instead of exposing only metadata.
  - Reader handoff from map content is more exact because verse focus is now preserved.
- Mobile UI Expert:
  - The native parallel-passage sheet now mirrors the web information hierarchy cleanly: source passage first, then deduped passage rows with confidence cues.
  - Chat answers now show clearer map lifecycle affordances instead of burying state inside a button label.
- Web UI/UX Expert:
  - This closes the main node-side drill-in gap versus the web `ParallelPassagesModal`.
  - Chat still needs a stronger equivalent of the web workspace’s full-map pending and session-continuation model.
- Web Logic Expert:
  - No new mobile-only data model was introduced; this slice stays inside the shared bundle contract and existing reader/navigation pipeline.

Consensus:

1. Parallel-passage parity is now substantially closed on phone.
2. The next high-value slice is chat/workspace continuity, not more map-surface chrome.

### Round 8 - Chat full-map pending continuity landed

- Mobile UX Expert:
  - Chat now keeps the partial map usable while a richer full trace continues in the background, which is much closer to the web workspace model.
  - Follow-up questions stay in the same session without accidentally tearing down an in-flight richer map fetch.
- Mobile UI Expert:
  - Assistant messages now distinguish `Preparing map`, `Loading full map`, `Richer connections loading`, and `Map ready - N verses` as separate native states.
  - The message row communicates continuity more clearly without forcing users into the map route to understand what is happening.
- Web UI/UX Expert:
  - This closes most of the remaining phone-side gap against `UnifiedWorkspace` message affordances.
  - The main parity gap left is simultaneous context on larger screens rather than phone message-state semantics.
- Web Logic Expert:
  - Mobile now mirrors the web pattern of fast map first, richer full trace second, while guarding against race conditions that would otherwise downgrade the active bundle.
  - No new mobile-only contract or persistence path was introduced.

Consensus:

1. Phone chat/workspace continuity is now substantially aligned with the web source of truth.
2. The next meaningful slice is large-screen split-context behavior, not more chat-state patching.

### Round 9 - Native viewport interaction fix landed

- Mobile UX Expert:
  - The mobile map now opens centered on the graph instead of forcing the user to recover from an off-center canvas.
  - Drag and pinch now make map exploration feel native rather than requiring repeated zoom/reset button taps.
- Mobile UI Expert:
  - Reset now behaves like a fit action, which is closer to the web control model.
  - Non-interactive summary/hint overlays no longer block map exploration gestures.
- Web UI/UX Expert:
  - This is the right parity direction because web always recenters/fits the map before asking the user to explore it.
  - The anchor remains visually central to the exploration model instead of feeling lost in a larger raw canvas.
- Web Logic Expert:
  - No data-flow changes were required; this was a viewport-behavior correction inside the native map renderer.

Consensus:

1. Phone map exploration now better reflects the web interaction model.
2. The remaining parity work is primarily larger-screen context layout, not core map navigation mechanics.

### Round 10 - Layout and connection rendering parity landed

- Mobile UX Expert:
  - The map now reads as a coherent network instead of isolated verse pills connected by improvised bars.
  - Structural helper edges keep the graph mentally legible without pretending they are semantic connections the user should inspect.
- Mobile UI Expert:
  - Curved SVG paths and depth rings restore the same directional and spatial cues users get from the web map.
  - Anchoring edges to node boundaries removed the visual disorder caused by center-to-center lines crossing through cards.
- Web UI/UX Expert:
  - This is materially closer to the web narrative map because the anchor-centered ring model and curved paths are part of how the graph is understood, not just cosmetic treatment.
  - Using visible nodes plus helper edges is the correct native translation of the web surface.
- Web Logic Expert:
  - Mobile now builds a renderable graph model that distinguishes explicit theological edges from synthetic structural links, which is how the web layout logic maintains coherence.
  - No bespoke mobile-only bundle contract was introduced; the parity work stays within the shared bundle shape.

Consensus:

1. Phone map connection rendering is now substantially closer to the web source of truth.
2. The remaining major parity work is larger-screen context/layout, not basic graph geometry.

### Round 11 - Runtime stabilization after edge-port regression

- Mobile UX Expert:
  - A map that red-screens is a product failure regardless of parity intent; runtime safety had to take precedence immediately.
  - Restoring the full node set was necessary because mobile does not yet share the web's expansion model for `isVisible` nodes.
- Mobile UI Expert:
  - The fallback renderer keeps the graph usable even when the current runtime lacks the SVG native component.
  - Touch passthrough on transformed graph layers was necessary to restore panning after the renderer rewrite.
- Web UI/UX Expert:
  - The fallback is an acceptable native concession because it preserves graph legibility and interaction without crashing.
  - It is better to degrade edge rendering than to ship a broken map surface.
- Web Logic Expert:
  - The regression came from assuming a native module capability that was not guaranteed in the active runtime.
  - The renderable graph model remains aligned to the web bundle semantics even though the visual renderer now has a guarded fallback path.

Consensus:

1. Runtime safety is a hard requirement for further parity work.
2. The next pass on this slice should happen on-device, comparing the SVG path renderer and fallback renderer visually.

### Round 12 - Shared graph logic replication landed

- Mobile UX Expert:
  - This is the right correction because the graph geometry should come from the same foundation as web, not from a mobile-only approximation.
  - Native interaction now sits on top of a graph model that is closer to the real product behavior.
- Mobile UI Expert:
  - The renderer now receives an already-derived graph instead of inventing layout decisions ad hoc inside the screen.
  - The fallback path still degrades, but it now degrades from the same control points and graph geometry rather than from unrelated straight bars.
- Web UI/UX Expert:
  - This moves parity to the correct layer: derive the graph first, then render it natively.
  - It is materially closer to the web narrative map than a screen-local ring algorithm.
- Web Logic Expert:
  - The force-layout and graph derivation logic is now reusable shared logic.
  - This reduces drift between web and mobile because both clients can now derive geometry from the same bundle semantics.

Consensus:

1. Graph derivation is now on the right architectural footing for further mobile parity work.
2. The next quality gate should be on-device visual comparison against the web map using the same trace bundle.

### Round 13 - Focused node-click and edge-semantics UX audit

- Mobile UX Expert:
  - Mobile still treats node tap as "open details," but web treats it as "what is the strongest relationship study action for this verse?"
  - Focus on web is graph-wide; focus on mobile is still mostly a local sheet state.
- Mobile UI Expert:
  - Web edge color semantics are stricter than mobile's current family-colored rendering.
  - Gold belongs to anchor rays; most other semantic lines read as bright white, not per-type colored rails.
- Web UI/UX Expert:
  - Standard node click first resolves topic groups and may open `SemanticConnectionModal` directly.
  - Only when no strong topic group exists does web fall back to focus mode.
  - Hover/focus dims the rest of the graph, which changes how the user reads the selected verse.
- Web Logic Expert:
  - The missing parity is no longer primarily layout math.
  - The missing parity is the interaction/state pipeline around `buildConnectionTopics`, `pickDefaultTopic`, `focusedNodeId`, and `getEdgeStroke`.

Consensus:

1. The next implementation slice should target node-click semantics, spotlight/focus state, and edge stroke hierarchy.
2. Further renderer tuning without those state rules will still feel unlike the web product.

### Round 14 - Node-tap, spotlight, and semantic-sheet parity landed

- Mobile UX Expert:
  - Node tap now routes through semantic-topic resolution first, which is much closer to how the web map decides what the user likely wants to study next.
  - Spotlight dimming makes the selected branch readable as the active graph context rather than just an attached bottom sheet.
- Mobile UI Expert:
  - The edge hierarchy is now materially closer to web: gold anchor rays, white semantic edges, grey helpers.
  - The connection sheet now reflects topic-group state with switching chips, connected-passage previews, and semantic cues.
- Web UI/UX Expert:
  - This corrects the biggest remaining interaction drift because mobile now uses the graph to decide the next affordance instead of always privileging verse details.
  - The graph now visibly changes around the user's attention target, which is a core part of the web experience.
- Web Logic Expert:
  - Native now follows the web-style `buildConnectionTopics` / `pickDefaultTopic` pipeline and carries cluster verse IDs through synopsis, save, and go-deeper actions.
  - Remaining drift is now mostly renderer polish and larger-screen composition, not fundamental graph-state logic.

Consensus:

1. Mobile is now on the correct interaction pipeline for web map parity.
2. The next review pass should be a side-by-side device comparison for edge opacity, glow, and topic-sheet feel on large live graphs.

### Round 15 - Focused modal content and logic audit

- Mobile UX Expert:
  - Mobile semantic drill-in still feels like a detail sheet, while web semantic drill-in feels like the primary connection-study workspace.
  - Parallel passages work, but the mobile sheet is missing the web modal's clearer primary-versus-parallels framing.
- Mobile UI Expert:
  - Bottom sheets are an acceptable native form factor, but the content structure still drifts from web.
  - The semantic sheet relies on stacked cards where web uses a tighter chip/synopsis/topic/action flow.
- Web UI/UX Expert:
  - `SemanticConnectionModal` on web includes verse-chip interaction, progressive reveal, lightweight topic navigation, and a saved-library editing branch.
  - `ParallelPassagesModal` is intentionally compact and hierarchically framed as `Primary` then `Also Found In`.
- Web Logic Expert:
  - Mobile still lacks several web modal logic branches: topic-title enrichment, verse-tooltip interaction, synopsis request caching keyed by topic context, and library-entry metadata editing state.
  - The remaining drift is now strongly modal-specific rather than graph-foundation-specific.

Consensus:

1. Modal parity should be the next implementation slice.
2. `SemanticConnectionModal` should be treated as partially complete on mobile until its content model and logic branches match the web source of truth more closely.

### Round 16 - Semantic card rebuild for node press landed

- Mobile UX Expert:
  - The card from pressing a node now reads as the primary semantic-study surface rather than as a generic detail sheet with connection extras attached.
  - Progressive verse reveal and saved-connection editing make the card feel closer to the web workflow.
- Mobile UI Expert:
  - Verse chips, lighter topic navigation, and reduced card stacking materially improve parity with the web modal.
  - Keeping chip taps as a native drill-in action is an acceptable concession even though it is not a literal tooltip clone.
- Web UI/UX Expert:
  - The semantic card now follows the web modal's content order more closely and better represents the "card the user means" when clicking a node with semantic topics.
  - The main remaining experiential gap is the lack of an exact native equivalent for verse-tooltip hover/click behavior.
- Web Logic Expert:
  - Mobile now includes topic-title enrichment and request-key caching for semantic synopsis fetches, reducing modal-state drift from web.
  - The saved-library branch is no longer missing from the semantic card path.

Consensus:

1. The semantic card for node press is materially closer to the web source of truth.
2. The next modal parity slice should focus on parallel passages and any remaining verse-chip interaction polish.

### Round 17 - Parallel-passages modal hierarchy landed

- Mobile UX Expert:
  - The parallel sheet now presents the primary verse first and the alternate witnesses second, which matches the way the web modal teaches the user what they are looking at.
  - The sheet feels less like a generic detail card and more like a compact navigation surface.
- Mobile UI Expert:
  - `Parallel Accounts`, `Primary`, `Also Found In`, and the footer hint are now carried over into the native sheet instead of using custom mobile phrasing.
  - Confidence emphasis now better matches web by keeping the strongest parallels visually firmer than weaker matches.
- Web UI/UX Expert:
  - The native form factor is still a bottom sheet, but the content hierarchy now follows the web source of truth closely enough to count as the same study surface.
  - The main remaining experiential gap is no longer the parallel modal.
- Web Logic Expert:
  - Mobile parallel filtering now follows the same normalized dedupe pattern used by the web modal path.
  - Remaining modal drift is concentrated in the missing native equivalent for verse-tooltip interaction and some internal dead-branch cleanup.

Consensus:

1. Parallel-passages modal parity is materially aligned with the web source of truth.
2. The next cleanup pass should target the hidden legacy semantic-sheet branches and any residual verse-interaction polish.

### Round 18 - Semantic-sheet dead-branch cleanup landed

- Mobile UX Expert:
  - The semantic sheet code now tracks the actual node-press study flow instead of carrying hidden older branches beside it.
  - This lowers the chance of future parity regressions when tuning the modal.
- Mobile UI Expert:
  - Unused connection-card and topic-cue styles tied to dead branches are gone.
  - The remaining surface is cleaner and easier to iterate against the web modal.
- Web UI/UX Expert:
  - No user-facing behavior changed, but the implementation now represents the current parity state more faithfully.
- Web Logic Expert:
  - Dead rendering branches are removed, so the semantic modal path has less internal drift from the intended state machine.

Consensus:

1. The cleanup removes stale modal branches without changing shipped behavior.
2. The remaining modal parity gap is now primarily the missing native equivalent for verse-tooltip interaction.

### Round 19 - Large-screen adaptive inspector composition landed

- Mobile UX Expert:
  - Expanded layouts now keep the map visible while the user inspects content, which makes the experience feel much less constrained than the old always-bottom-sheet model.
  - The map remains explorable while study context updates in place.
- Mobile UI Expert:
  - The new composition uses two intentional modes: compact sheet, expanded rail.
  - The adaptive surface stays thin while the parent screen owns the actual split layout.
- Web UI/UX Expert:
  - This is materially closer to the web experience because the map no longer disappears under modal chrome on wide screens.
  - Centering the active target inside the visible map pane is the key UX correction.
- Web Logic Expert:
  - The inspector is derived from existing selection state, so orientation/layout transitions preserve context.
  - Resize handling now favors recentering/clamping over destructive full-graph refits.

Consensus:

1. Large-screen composition is now on the correct parity path.
2. Remaining work is cleanup of the hidden legacy sheet blocks plus device-side tuning of the rail and centering feel.

### Round 20 - Legacy inspector sheets removed

- Mobile UX Expert:
  - The adaptive inspector path is now the only live inspection path in the map screen.
  - This reduces the chance of future regressions back to the older all-sheet behavior.
- Mobile UI Expert:
  - Duplicate hidden node/parallels/edge sheet surfaces are gone.
  - The layout system is easier to tune because only the active rail/sheet implementation remains.
- Web UI/UX Expert:
  - No visible behavior changed, but the implementation now cleanly reflects the current large-screen composition model.
- Web Logic Expert:
  - The map screen no longer carries parallel dead rendering branches for inspection state.

Consensus:

1. The large-screen inspector migration is now structurally complete.
2. Remaining work is device-side tuning and the semantic card’s native verse-interaction concession.
