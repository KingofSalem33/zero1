# Loading Parity Shared Doc (Web Source -> Native Mobile)

Last updated: 2026-03-07
Scope: loading screens/states for app boot, reader, selection modal, chat, library, and map-related async actions.

## Mission

Make mobile loading feel like the same product as web (or better), while staying native-first in layout and interaction.

Agents:

1. Mobile UX Expert
2. Mobile UI Expert
3. Web UI/UX Source-of-Truth Expert
4. Web Logic and Pipeline Source-of-Truth Expert

## Source-of-Truth Files Reviewed

Web UI/UX:

- `apps/web/src/App.tsx`
- `apps/web/src/layouts/RootLayout.tsx`
- `apps/web/src/components/UnifiedWorkspace.tsx`
- `apps/web/src/components/BibleReader.tsx`
- `apps/web/src/components/LibraryView.tsx`
- `apps/web/src/components/Skeleton.tsx`
- `apps/web/src/components/tooltip/LoadingDots.tsx`
- `apps/web/src/components/VerseTooltip.tsx`
- `apps/web/src/components/TextHighlightTooltip.tsx`
- `apps/web/src/components/VerseReferencesModal.tsx`
- `apps/web/src/index.css`

Web logic/pipeline:

- `apps/web/src/hooks/useChatStream.ts`
- `apps/web/src/hooks/useRootTranslation.ts`
- `apps/web/src/components/BibleReader.tsx`
- `apps/web/src/components/LibraryView.tsx`

Mobile implementation:

- `apps/mobile/App.tsx`
- `apps/mobile/src/AppRuntime.tsx`
- `apps/mobile/src/navigation/MobileRootNavigator.tsx`
- `apps/mobile/src/screens/ReaderScreen.tsx`
- `apps/mobile/src/screens/ChatMapScreens.tsx`
- `apps/mobile/src/screens/DataListScreens.tsx`
- `apps/mobile/src/components/native/RootTranslationPanel.tsx`
- `apps/mobile/src/hooks/useMobileAppController.ts`
- `apps/mobile/src/hooks/useRootTranslationMobile.ts`
- `apps/mobile/src/theme/mobileStyles.ts`

---

## Step 1 - Codebase Review (Per Agent)

### Agent 1 - Mobile UX Expert

Current flows/screens:

1. Boot: Suspense fallback shows plain `ActivityIndicator`.
2. Reader chapter load: inline spinner + "Loading chapter...".
3. Reader selection modal: synopsis uses spinner + "Analyzing selection...".
4. Root translation panel: spinner + "Translating from original...".
5. Chat:

- Empty state focuses composer.
- Busy state shows tool/search chips only when tool/search arrays are populated.
- No dedicated "thinking" skeleton pass equivalent to web.

6. Library: each list uses spinner + "Loading X..." in empty state.

Design pattern observed:

- Most loading is spinner-first and text-label-first.
- Minimal transition smoothing (few min-duration protections).
- Few progressive placeholders that preserve final layout shape.

Gaps vs intended experience:

1. Missing web-like skeleton shapes and shimmer language.
2. Missing "Reflecting on Scripture..." transitional moment in chat.
3. Inconsistent loading semantics across reader/chat/library (different patterns per screen).
4. No unified "loading system" primitives for parity and consistency.

### Agent 2 - Mobile UI Expert

Current UI loading patterns:

1. `ActivityIndicator` appears in cards, lists, and modals with no shared visual identity.
2. Gold accent appears in places, but motion style and polish do not match web loading rhythm.
3. Empty-to-loading-to-loaded transitions can feel abrupt.

Inconsistencies:

1. Library loading uses generic empty cards, while web uses structured skeleton cards.
2. Reader loading does not preserve reading layout silhouette.
3. Chat loading does not show message-body scaffolding while model is thinking.
4. Tooltip/root loading on mobile is functionally correct but visually less branded than web dots.

### Agent 3 - Web UI/UX Source-of-Truth Expert

Authoritative loading surface inventory:

1. App auth boot and route lazy-load: centered spinner on branded dark gradient.
2. Reader chapter load: full chapter skeleton mirroring final layout (header + flowing verse lines).
3. Chat loading:

- "Thinking..." state with gold pulse dots + text-line skeleton.
- progressive stream text
- verse search indicator with animated gold shimmer bar
- map prep inline status chip while stream runs.

4. Library loading:

- tab-specific skeletons: connection card grid, map list rows, highlight cards.

5. Tooltip and modal loading:

- compact `LoadingDots` (gold pulse dots)
- minimum-visible loading duration in reference modal to avoid flash.

Authoritative design rules:

1. Keep user in context during async work (do not blank surfaces).
2. Skeleton shape must resemble final content.
3. Loading motion is subtle, premium, and brand-accented (gold, restrained pulse/shimmer).
4. State transitions should avoid flicker.

### Agent 4 - Web Logic and Pipeline Source-of-Truth Expert

Canonical loading behavior:

1. Chat (`useChatStream`):

- starts with `isStreaming=true`, empty streaming message container
- processes SSE event lifecycle (`content`, `verse_search`, `tool_call`, `tool_result`, `tool_error`, `map_data`, `done`)
- animates text release progressively
- marks completion on `done`.

2. Reader (`BibleReader`):

- sets loading true before fetch
- fetches by book with abort support
- caches verse counts for skeleton accuracy
- restores scroll intent after load.

3. Root translation (`useRootTranslation`):

- reset state -> set loading -> request -> on success/failure update fallback and loading.

4. Library (`LibraryView`):

- loading true before parallel fetch of connections and maps
- tab-specific loading UI shown while shared loading flag active.

Pipeline gaps on mobile:

1. Chat parsing supports stream transport but loading presentation is not fully mapped to web event lifecycle.
2. Reader and library use loading flags correctly, but rendering is generic spinner-based.
3. No minimum-visible protection for fast responses in modal/reference-like flows.

---

## Step 2 - Web Standards Definition (Authoritative)

### Web UI/UX Loading Spec (authoritative)

1. Boot and route load:

- full-screen branded background
- centered subtle spinner
- no raw white flash.

2. Reader chapter load:

- skeleton chapter header + body lines that preserve reading rhythm.

3. Chat load:

- phase A: "Reflecting on Scripture..." + 3 gold dots + 3 text skeleton lines
- phase B: progressive streamed content
- phase C: inline status chips for tool/verse progress and map prep.

4. Library load:

- tab-specific skeletons matching each card/list layout.

5. Selection/root/reference modal load:

- compact gold loading dots
- avoid micro-flash with minimum loader dwell.

6. Motion:

- subtle pulse/shimmer
- no aggressive bounce/game-like animations.

### Web Logic/Pipeline Spec (authoritative)

1. Async loading starts immediately on request dispatch.
2. Streaming must remain event-driven (not fake delayed full text).
3. Loading states are cancellable/abort-safe when possible.
4. Race safety for root/synopsis requests (ignore stale responses).
5. Error states should keep context visible and recoverable.

---

## Step 3 - Mobile Mapping to Web Standards

Native concessions (approved):

1. Keep native stack/modal behavior instead of web popovers.
2. Use RN-friendly shimmer/pulse implementations (no CSS class reuse).
3. Maintain mobile-safe text densities and touch targets.

### Exact mapping and required changes

1. Boot and route loading

- Current: plain overlay spinner.
- Change: branded boot surface + accent spinner + fade-in.

2. Reader chapter loading

- Current: spinner with label.
- Change: add `ReaderChapterSkeleton` with book/chapter header blocks and inline verse skeleton flow.

3. Reader selection modal loading

- Current: spinner for synopsis/root.
- Change: use shared `LoadingDotsNative` component with web-like label style; add min 220-300ms display guard.

4. Chat loading

- Current: status chips only; no dedicated thinking skeleton.
- Change:
  - show "Reflecting on Scripture..." loader block before first streamed content
  - then switch to progressive stream content
  - keep tool/search chips and add subtle pulse for active chips.

5. Library loading

- Current: spinner-only empty state.
- Change: per-tab skeletons:
  - `LibraryConnectionSkeletonCard`
  - `LibraryMapSkeletonRow`
  - `LibraryHighlightSkeletonCard`

6. Shared loading system

- Build primitives:
  - `LoadingDotsNative`
  - `SkeletonBlockNative`
  - `SkeletonTextLinesNative`
  - `ShimmerContainerNative`.

---

## Step 4 - Coordination Sync Outcome

Unified direction agreed:

1. Preserve web loading sequence and semantics.
2. Render loading with native components optimized for iOS feel.
3. Prioritize reading continuity and chat momentum over decorative effects.
4. Standardize loading across screens with one shared primitive set.

Risk register:

1. Performance risk from complex shimmer in long lists.

- Mitigation: static skeletons by default; optional shimmer only on visible items.

2. Stream/UI race conditions in chat.

- Mitigation: explicit pre-content phase + state machine guard.

3. Flicker on very fast API responses.

- Mitigation: minimum dwell for specific loaders.

---

## Step 5 - Prioritized Backlog

### P0 (must ship first)

1. Owner: Mobile UI Expert

- Item: Create shared native loading primitives (`LoadingDotsNative`, `Skeleton*`, shimmer util).
- Acceptance:
  - single source component set used by Reader/Chat/Library/Root modal
  - supports reduced motion flag.
- Status: Completed (2026-03-07).

2. Owner: Mobile UX Expert

- Item: Reader chapter skeleton parity.
- Acceptance:
  - replaces spinner-only chapter loader
  - skeleton preserves chapter header + reading-flow silhouette.
- Status: Completed (2026-03-07).

3. Owner: Mobile UX Expert

- Item: Chat "Thinking -> Stream" loading sequence parity.
- Acceptance:
  - before first token: show 3-dot + "Reflecting on Scripture..." + 3 line skeleton
  - after first token: transition to streamed content without jump.
- Status: Completed (2026-03-07), then upgraded to native graph-construction loader matching web VerseSearchIndicator intent (nodes/edges/progress).

4. Owner: Web UI/UX Source-of-Truth Expert

- Item: Visual QA sign-off checklist for loading parity.
- Acceptance:
  - checklist covers boot, reader, chat, library, modal
  - each state matches web language with native concession notes.

5. Owner: Web Logic/Pipeline Source-of-Truth Expert

- Item: Loading lifecycle parity checks for stream + request race safety.
- Acceptance:
  - chat pre-content, content, done states verified
  - stale request guard retained in root/synopsis flows.

### P1 (next)

6. Owner: Mobile UI Expert

- Item: Library tab-specific skeleton cards/rows.
- Acceptance:
  - connection/maps/highlights/bookmarks each show dedicated skeleton type
  - no generic spinner-only list empty state while loading.
- Status: Completed (2026-03-07).

7. Owner: Mobile UX Expert

- Item: Minimum loading dwell for quick modal calls.
- Acceptance:
  - synopsis/root/reference preview loaders avoid flash (220-300ms min where needed).
- Status: Completed (2026-03-07) for synopsis, root translation, and verse preview loaders.

8. Owner: Mobile UI Expert

- Item: Accent motion polish pass.
- Acceptance:
  - subtle pulse/shimmer timings align to web feel
  - no aggressive or gamified motion.
- Status: In progress (2026-03-07). Chat active status chips now use subtle pulse and trace-mode map prep status is implemented.

### P2 (hardening)

9. Owner: Web Logic/Pipeline Source-of-Truth Expert

- Item: Regression tests for loading transitions.
- Acceptance:
  - tests for chat state machine and reader loading flags.

10. Owner: Mobile UX Expert

- Item: Accessibility pass (reduce motion + announcement text).
- Acceptance:
  - reduce-motion fallback disables shimmer
  - loading announcements are concise and non-spammy.

---

## Component Mapping (Web -> Mobile)

| Web component/pattern                                                   | Mobile target                                           | Status  |
| ----------------------------------------------------------------------- | ------------------------------------------------------- | ------- |
| `tooltip/LoadingDots.tsx`                                               | `LoadingDotsNative.tsx`                                 | Planned |
| `.skeleton` + shimmer CSS                                               | `SkeletonBlockNative` + optional shimmer                | Planned |
| `BibleChapterSkeleton`                                                  | `ReaderChapterSkeleton`                                 | Planned |
| Chat "Thinking..." loader block in `UnifiedWorkspace`                   | `ChatThinkingState` block in `ChatMapScreens`           | Planned |
| `LibraryGridSkeleton` / `MapListItemSkeleton` / `HighlightCardSkeleton` | `Library*Skeleton` components                           | Planned |
| Verse reference modal min-load guard                                    | same behavior in mobile selection/reference loader flow | Planned |

---

## UX Flow Diagrams (aligned to web, native optimized)

### 1) App Boot

```text
App launch
  -> suspense fallback (branded native boot loader)
  -> auth/session resolve
  -> mode shell visible
```

### 2) Reader Chapter Load

```text
Book/chapter change
  -> set readerLoading=true
  -> render ReaderChapterSkeleton
  -> chapter data resolves
  -> cross-fade to real chapter text
```

### 3) Selection Modal (Synopsis/Root)

```text
Long press verse
  -> open selection modal
  -> synopsis request starts
  -> show LoadingDotsNative("Analyzing selection...")
  -> synopsis content
  -> tap ROOT
  -> show LoadingDotsNative("Translating from original...")
  -> root content
```

### 4) Chat Stream

```text
Send prompt
  -> busy=true, stream open
  -> show Thinking state (dots + skeleton)
  -> first content delta arrives
  -> hide thinking skeleton, render progressive stream
  -> show tool/search chips while events arrive
  -> done event -> finalize message
```

### 5) Library Tab Loads

```text
Open Library (or pull-to-refresh)
  -> tab loading flag true
  -> render tab-specific skeleton list
  -> data resolves
  -> replace skeleton with real cards
```
