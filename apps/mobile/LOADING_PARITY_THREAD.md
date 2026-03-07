# Loading Parity Coordination Thread

Last updated: 2026-03-07
Participants: Mobile UX Expert, Mobile UI Expert, Web UI/UX Source-of-Truth Expert, Web Logic and Pipeline Source-of-Truth Expert.

## Purpose

Track reconciled decisions for web-to-mobile loading parity and prevent drift between UX, UI, and pipeline behavior.

## Sync 1 - Baseline findings

Web UI/UX Expert:

- Web loading is not spinner-only. It uses context-shaped skeletons, subtle gold accent motion, and progressive states.
- Chat has a distinct pre-content "thinking" stage.

Web Logic Expert:

- Stream lifecycle is event-driven and should remain so on mobile.
- Reader and root translation loading behavior depends on explicit state transitions and request safety.

Mobile UX Expert:

- Mobile loading patterns are functional but inconsistent.
- Reader/chat/library need a single loading language and better continuity during async transitions.

Mobile UI Expert:

- Most mobile loading uses generic `ActivityIndicator`.
- Missing a shared loading component family and skeleton types.

Consensus:

1. Define a native loading design system first.
2. Prioritize reader and chat loading parity before library polish.

## Sync 2 - Standards reconciliation

Web UI/UX Expert confirmed authoritative constraints:

1. Loading should preserve the final layout silhouette.
2. Motion must be subtle and premium.
3. Fast responses should avoid flicker.

Web Logic Expert confirmed canonical constraints:

1. Streaming states must map directly to SSE events.
2. Root/synopsis must stay race-safe.
3. Abort/cancel flows must not leave stale loaders.

Mobile experts accepted native concessions:

1. RN-native components for shimmer/dots.
2. iOS-safe layouts and touch sizes.
3. No web CSS porting directly.

Consensus:

1. Mobile can be better than web if behavior matches and readability improves.
2. No gamified loading motion.

## Sync 3 - Unified implementation plan

Agreed P0 sequence:

1. Shared loading primitives.
2. Reader chapter skeleton and modal loader parity.
3. Chat thinking->stream transition parity.
4. Web parity sign-off checklist.

Agreed P1 sequence:

1. Library tab-specific skeletons.
2. Min-dwell anti-flicker for quick loaders.
3. Motion polish pass.

Open technical checks:

1. Ensure skeleton rendering cost is bounded in long lists.
2. Validate chat state switch does not regress keyboard/composer behavior.
3. Confirm reduce-motion handling on iOS accessibility settings.

## Sync 4 - Implementation pass shipped

Mobile UI Expert:

1. Added shared loading primitives:

- `LoadingDotsNative`
- `SkeletonNative` (`SkeletonBlock`, `SkeletonLine`, `SkeletonCircle`, `SkeletonTextLines`)
- reduced-motion hook (`useReducedMotion`).

2. Added screen-level loading components:

- `ReaderChapterSkeleton`
- `ChatThinkingState`
- library skeleton cards (`Connection`, `Map`, `Highlight`, `Bookmark`).

Mobile UX Expert:

1. Reader now shows a chapter-shaped skeleton while chapter data is loading.
2. Selection modal and root translation now use branded loading dots instead of generic spinner.
3. Chat now uses explicit pre-content thinking UI before stream text appears.

Web UI/UX Source-of-Truth Expert:

1. Confirmed visual direction is aligned to web loading language:

- gold-dot indicators
- content-shaped placeholders
- restrained motion.

Web Logic and Pipeline Source-of-Truth Expert:

1. Confirmed no stream pipeline change/regression:

- only rendering layer changed for busy + empty assistant content.

2. Request lifecycle remains unchanged for reader/root/library.

Validation:

1. Mobile typecheck passed (`npm --prefix apps/mobile run typecheck`).

Follow-up:

1. Added min-dwell anti-flicker timings for fast modal loads:

- synopsis loader (Reader)
- root translation loader
- verse preview loader (Chat).

2. Implemented chat status chip motion and map-prep parity:

- active search/tool chips now have subtle pulse
- trace-mode requests now surface "Preparing map..." with verse count.

3. Next: add targeted tests for chat thinking-state transition and map-prep state transitions.

## Sync 5 - Loader style correction (web parity request)

Mobile UX/UI Experts:

1. Replaced skeleton thinking card with native graph-construction loader for every chat prompt pre-content phase.
2. Loader now emulates web VerseSearchIndicator structure:

- seeking header with traced prompt
- contextual copy + gold dots
- animated node/edge constellation
- verse count and latest verse
- animated gold progress track.

Web UI/UX Source-of-Truth Expert:

1. Confirmed this is the correct parity direction versus generic skeleton.
2. Confirmed removal of skeleton for this phase aligns with request.

Web Logic Expert:

1. Trigger behavior unchanged: loader shows only while streaming and before first assistant content.
2. Exit behavior unchanged: first content delta hides the pre-content loader.

## Decision Register

1. Web remains source-of-truth for loading semantics and journey order.
2. Mobile is source-of-truth for native rendering mechanics.
3. Every loading change must identify:

- user-visible phase
- trigger event/state
- exit condition
- fallback/error behavior.

## Next Sync Checklist

1. Review first implementation PR for P0 items.
2. Compare side-by-side clips for:

- Reader chapter load
- Reader selection modal loading
- Chat pre-content loading state
- Library initial load.

3. Approve or adjust motion timings and min-dwell values.
