# Multi-Agent Web-to-Mobile Parity Shared Doc

Last updated: 2026-03-06

## Mission

Align mobile to web as the product source-of-truth while keeping native ergonomics. This document is maintained jointly by 4 agents:

- Mobile UX Expert
- Mobile UI Expert
- Web UI/UX Source-of-Truth Expert
- Web Logic & Pipeline Source-of-Truth Expert

## Source-of-Truth Scope

Web UI/UX source files:

- `apps/web/src/layouts/RootLayout.tsx`
- `apps/web/src/components/RoadmapSidebarV2.tsx`
- `apps/web/src/components/BibleReader.tsx`
- `apps/web/src/components/TextHighlightTooltip.tsx`
- `apps/web/src/components/LibraryView.tsx`
- `apps/web/src/components/UnifiedWorkspace.tsx`

Web logic/pipeline source files:

- `apps/web/src/hooks/useChatStream.ts`
- `apps/web/src/layouts/RootLayout.tsx`
- `apps/web/src/components/TextHighlightTooltip.tsx`
- `packages/shared-client/src/api/createProtectedApiClient.ts`

Mobile implementation files mapped:

- `apps/mobile/src/navigation/MobileRootNavigator.tsx`
- `apps/mobile/src/screens/ReaderScreen.tsx`
- `apps/mobile/src/screens/ChatMapScreens.tsx`
- `apps/mobile/src/screens/DataListScreens.tsx`
- `apps/mobile/src/hooks/useMobileAppController.ts`
- `apps/mobile/src/lib/api.ts`

---

## Agent A - Web UI/UX Source-of-Truth Findings

### Authoritative UI rules

1. Shell/navigation is sidebar-first, mode-driven (Bible, Chat, Library), with mobile header + sidebar overlay pattern from same architecture.
2. Reader is continuous reading surface (not card stack), with verse-number interactions and inline text-selection tooltip.
3. Selection UX is core: select text -> synopsis appears -> actions include Trace, Copy, Share, Root, highlight colors, verse-link drill-ins.
4. Chat is clean single workspace with message stream + optional map panel, not heavy dashboard cards.
5. Library is tabbed content (Connections/Maps/Highlights/Bookmarks/Notes) with dense but clean reusable cards and direct journey back into Reader/Chat/Map.
6. Loading states are part of product feel: skeletons, stream indicators, map prep, and non-blocking transitions.

### Authoritative key journeys

1. Sidebar -> Bible -> read -> select text -> tooltip synopsis -> Trace -> map -> Go Deeper.
2. Sidebar -> Chat -> stream response -> citations/map trace actions -> open Reader/Map.
3. Sidebar -> Library -> inspect saved artifacts -> jump to Reader/Map/Chat continuation.

---

## Agent B - Web Logic & Pipeline Source-of-Truth Findings

### Canonical pipelines

1. Trace pipeline:

- Trigger: selected text or chat action.
- API: `POST /api/trace` (`RootLayout.handleTrace`, `UnifiedWorkspace` trace paths).
- Behavior: open visualization container early, then hydrate map bundle when returned.

2. Reader selection pipeline:

- Trigger: DOM text selection in `TextHighlightTooltip`.
- API: `POST /api/synopsis` with contextual book/chapter/verse(s).
- Actions from same selection state:
  - Highlight write via highlight context sync flow.
  - Root translation via `POST /api/root-translation`.
  - Trace via canonical `onGoDeeper(selectedText, anchorRef)`.

3. Chat pipeline:

- API: `POST /api/chat/stream` SSE (`useChatStream`).
- Streaming events: content deltas, tool lifecycle, verse_search, map_data, done.
- Message UI is event-driven with real-time progressive rendering.

4. Persistence pipeline:

- Protected data flows use shared API client (`createProtectedApiClient`) for bookmarks, highlights sync/update/delete, library connections/maps CRUD.
- Highlights are synchronized as canonical arrays via `syncHighlights`.

### Behavioral invariants to preserve on mobile

1. Trace uses same endpoint and resulting bundle semantics.
2. Synopsis/root are generated from the exact selected text context.
3. Highlights remain sync-compatible with shared schema and APIs.
4. Chat should honor streaming semantics and event lifecycle, not deferred full-text-only parsing.

---

## Agent C - Mobile UX Expert Findings (gap vs web)

### Current mobile flow observations

1. Navigation is bottom-tab-first (`createBottomTabNavigator`) with Account as tab; this conflicts with sidebar-first web journey model.
2. Reader interaction is verse-card tap model; text selection tooltip journey is missing.
3. Highlight flow is single-verse quick action (`handleReaderHighlightVerse`) with fixed color; no synopsis-root-trace modal pipeline.
4. Chat send path currently reads full response payload then applies output, rather than rich incremental event lifecycle parity.
5. Library is functional but interaction depth and re-entry journeys are flatter than web (fewer contextual continuation actions).

### Required native concessions

1. Sidebar should be a full-screen slide-over drawer on phone.
2. Reader selection may use native gesture/selection mechanics, but must preserve same action model and outcomes.
3. Map can open as full-screen native route instead of desktop split panel.

---

## Agent D - Mobile UI Expert Findings (gap vs web)

### Current visual mismatches

1. Reader is block/card-heavy versus web’s reading-surface typography-first composition.
2. Primary interaction emphasis is on chips/buttons instead of text/selection.
3. Bottom tab visual weight competes with content; web mode-switching is contextually lighter.
4. Chat and Library screens are serviceable but not yet matching web hierarchy rhythm and density.

### Required design alignment

1. Keep shared dark palette/accent language and type hierarchy.
2. Shift reader from cards to page-like text surface with lightweight verse affordances.
3. Use modal/sheet presentation for selection actions with web-consistent labels and sequence.
4. Unify loading visuals across reader trace, chat, and library fetches.

---

## Reconciled Cross-Agent Decisions

1. Web remains authority for behavior, sequencing, and action model.
2. Mobile will be native-first for layout and interaction mechanics.
3. Sidebar-first shell is mandatory (remove bottom tabs as primary mode switch).
4. Reader highlight/trace flow is P0 and must land before secondary polish.
5. Chat and Library should be simplified into cleaner web-like layouts after shell + reader parity slice.

---

## Unified Prioritized Plan

### P0 - Architecture and core journey parity

1. Replace bottom tabs with sidebar shell:

- Build mode shell with slide-over sidebar.
- Modes: Bible, Chat, Library.
- Account action anchored at drawer bottom.

2. Rebuild Reader around web journey:

- Continuous reading layout (not verse cards).
- Native selection/selection-mode to produce selected passage context.
- Selection modal replicating web actions/order:
  - Synopsis (loading -> resolved)
  - Trace
  - Go Deeper
  - Copy
  - Share
  - Root translation
  - Highlight color choices

3. Enforce web pipeline parity in mobile reader:

- Add native calls for `/api/synopsis` and `/api/root-translation`.
- Keep `/api/trace` flow canonical and include anchor reference when available.
- Expand highlight write path to selected verse-ranges + selected color.

### P1 - Chat and library parity

4. Chat pipeline parity pass:

- Move mobile chat to true streaming/event model compatible with web semantics.
- Preserve citation chips, trace hooks, and map bundle attach behavior.

5. Library parity pass:

- Tighten hierarchy to web tab model (Connections/Maps/Highlights/Bookmarks/Notes) with native segmented control.
- Ensure every entity has continuity actions into Reader/Chat/Map.

### P2 - polish and quality

6. Loading system unification:

- Reader selection/synopsis/root skeleton states.
- Trace preparation animation parity.
- Chat stream placeholder and tool-progress affordances.

7. Quality gates:

- UX parity checklist per journey.
- Shared-contract and route tests updated for shell/reader changes.

---

## Web->Mobile Component Mapping

| Web source                          | Mobile target                               | Status                                       |
| ----------------------------------- | ------------------------------------------- | -------------------------------------------- |
| `RoadmapSidebarV2` + `MobileHeader` | Native sidebar shell + top bar              | Completed                                    |
| `BibleReader` reading surface       | Native reader continuous text surface       | Completed (range-based selection concession) |
| `TextHighlightTooltip`              | Native selection action modal/sheet         | Completed (range-based selection concession) |
| `VerseExplorationPanel`             | Native verse detail sheet                   | Partial                                      |
| `UnifiedWorkspace`                  | Native chat workspace with streaming events | Partial (chunk streaming fallback added)     |
| `LibraryView` tabbed sections       | Native library segmented sections           | Partial                                      |

---

## Work Queue (Implementation-Ready)

1. `apps/mobile/src/navigation/MobileRootNavigator.tsx`

- Status: Completed.

2. `apps/mobile/src/screens/ReaderScreen.tsx`

- Status: Completed with range-based native selection concession.

3. `apps/mobile/src/lib/api.ts`

- Status: Completed.

4. `apps/mobile/src/hooks/useMobileAppController.ts`

- Status: Completed.

5. `apps/mobile/src/screens/ChatMapScreens.tsx`

- Status: In progress (chunk stream parsing fallback added).

6. `apps/mobile/src/screens/DataListScreens.tsx`

- Restructure library sections toward web tab parity with continuation actions.

---

## Ongoing Coordination Protocol

1. Each change PR must update this doc and the thread doc.
2. Any web behavior discovered in conflict supersedes mobile assumptions.
3. Native concessions require explicit note in both docs before implementation.

---

## Root Function Deep Dive (2026-03-05)

### Scope

Goal: make mobile Root modal behavior, sequencing, and interaction model align with web source-of-truth while preserving native layout.

### Web UI/UX Source-of-Truth (authoritative)

Primary files:

- `apps/web/src/components/TextHighlightTooltip.tsx`
- `apps/web/src/components/tooltip/RootTranslationPanel.tsx`
- `apps/web/src/hooks/useRootTranslation.ts`

Authoritative behavior:

1. Selection modal opens in Synopsis view by default.
2. `ROOT` action transitions to a dedicated Root view.
3. Root view supports:

- per-word original-language mapping
- Strong's definition reveal on selected token
- lost-context pager ("Lost in translation")
- explicit back action to return to Synopsis

4. Root view is not a second tab with independent lifecycle; it is a modal view-mode transition.

### Web Logic & Pipeline Source-of-Truth (authoritative)

Primary files:

- `apps/api/src/routes/root-translation.ts`
- `apps/web/src/hooks/useRootTranslation.ts`

Canonical pipeline:

1. Trigger: selected text from current passage context.
2. API: `POST /api/root-translation`.
3. Context payload includes `book`, `chapter`, and `verse` or `verses`.
4. Client state machine enforces reset, loading, stale-request protection, and fallback rendering.

### Mobile UX/UI Findings (gap vs web)

1. Mobile Root previously existed as a simple tab with static text/chips, not a dedicated view transition.
2. No per-word Strong's selection card.
3. No lost-context chunking/paging behavior.
4. Root lifecycle was local and shallow (no isolated state machine, stale-response guard, or reset parity).

### Reconciled Root Plan

P0 (must ship first):

1. Add mobile Root state hook that mirrors web behavior (`generate`, `reset`, selected-word state, stale-request guard).
2. Add native `RootTranslationPanel` with:

- Back-to-synopsis
- Word interaction + definition card
- Lost-context pager and swipe

3. Refactor `ReaderScreen` selection modal:

- default Synopsis
- `ROOT` action button in Synopsis actions row
- Root rendered as dedicated panel view
- reset Root state on close/chapter change/back

P1 (after P0 validation): 4. Visual polish parity with web tooltip motion and spacing rhythm. 5. Add route-level tests for Synopsis -> ROOT -> Back transitions.

### Root Work Status

1. `apps/mobile/src/hooks/useRootTranslationMobile.ts` - Completed.
2. `apps/mobile/src/components/native/RootTranslationPanel.tsx` - Completed.
3. `apps/mobile/src/screens/ReaderScreen.tsx` Root flow integration - Completed.
4. Typecheck and key mobile tests - Passing.

---

## Header Selector Parity Pass (2026-03-06)

### Coordinated 4-Agent Alignment

1. Web UI/UX source-of-truth:

- Reader header prioritizes navigation controls over decorative mode labeling.
- Book selection is dropdown-first with searchable discovery and immediate navigation.
- Chapter selection is direct, compact, and immediate (no extra submit action).

2. Web logic source-of-truth:

- Book navigation uses per-book reading-progress memory (`getLastChapter(book)`), falling back to chapter 1.
- Chapter change applies immediately after selection.

3. Mobile UX/UI reconciliation:

- Remove redundant "Bible" shell title footprint in Reader mode.
- Move compact Book + Chapter selectors to top control row.
- Remove `Go` button; use immediate selection behavior.
- Keep `Prev` / `Next` controls.
- Preserve collapsible header behavior.

### Implemented Changes

1. Reader shell top bar:

- Suppressed Reader mode title text and reduced top bar vertical weight.

2. Reader header controls:

- Replaced text inputs with native selector buttons for Book and Chapter.
- Removed `Go` button.
- Retained `Prev` and `Next`.

3. Book selector behavior:

- Added searchable modal dropdown with OT/NT grouping.
- Selection navigates instantly.
- Added per-book last chapter memory on mobile to mirror web `getLastChapter` behavior.

4. Chapter selector behavior:

- Added chapter grid modal with immediate chapter navigation on tap.

### Native concessions

1. Web popover dropdowns are implemented as mobile bottom-sheet style modals.
2. Web hover/focus affordances are replaced by touch-first active states and subtle motion presets.
