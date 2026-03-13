# Multi-Agent Web-to-Mobile Parity Discussion Thread

Last updated: 2026-03-06

## Thread Purpose

Continuous reconciliation between:

- Mobile UX Expert
- Mobile UI Expert
- Web UI/UX Source-of-Truth Expert
- Web Logic & Pipeline Source-of-Truth Expert

## Thread Log

### Round 1 - Baseline extraction

- Web UI/UX Expert:
  - Sidebar-first navigation and selection-driven reader experience are primary identity elements.
  - Reader must prioritize reading surface and text selection modal over card interactions.
- Web Logic Expert:
  - Canonical reader flow is selection -> synopsis/root/trace/highlight actions from the same state.
  - Canonical chat flow is SSE streaming (`/api/chat/stream`) with tool/map events.
- Mobile UX Expert:
  - Bottom tab shell and verse-card interaction currently break journey parity.
  - Native drawer + native selection modal is required for parity with platform fit.
- Mobile UI Expert:
  - UI is visually consistent in palette but interaction hierarchy is not web-aligned.
  - Reader and chat need cleaner, lower-friction surfaces.

Consensus:

- P0 must be sidebar shell + reader highlight/trace modal parity.

### Round 2 - Plan reconciliation

- Web UI/UX Expert accepted native concessions:
  - Full-screen map route is acceptable on mobile.
  - Native selection mechanics are acceptable if actions and sequence remain web-equivalent.
- Web Logic Expert conditions:
  - Keep endpoints and payload semantics aligned (`/api/trace`, `/api/synopsis`, `/api/root-translation`, shared highlight schema).
- Mobile experts commitment:
  - Remove bottom tabs as primary mode switch.
  - Implement selection action model with loading states and continuation into chat/map.

Consensus:

- Begin implementation in this order:
  1. Shell refactor
  2. Reader flow parity
  3. Chat streaming parity
  4. Library parity pass

### Round 3 - Implementation pass completed

- Mobile UX/UI Experts:
  - Replaced bottom-tab shell with sidebar-first mode shell.
  - Added account entry at drawer bottom as requested.
  - Rebuilt reader interaction around native selection workflow and modal tools.
- Web Logic Expert:
  - Mobile now includes direct `/api/synopsis` and `/api/root-translation` calls.
  - Trace remains canonical via `/api/trace`.
  - Chat flow improved toward streaming by consuming SSE chunk stream when available, with fallback.
- Web UI/UX Expert:
  - Reader now prioritizes reading surface and selection tools over card-only actions.
  - Remaining gap: true drag text-selection parity; current native concession is verse-range selection via long-press + tap range.

Consensus:

- P0 delivered with one documented concession (selection granularity).
- Next pass should focus on deeper chat event parity and library visual refinements.

## Open Questions (to resolve during implementation)

1. Selection granularity on native:

- Target word-level first if stable, fallback to verse-range with explicit UX note.

2. Map handoff behavior:

- Keep full-screen native route, with direct return to prior context and "open in reader" continuity.

3. Chat event parity depth:

- Minimum: streaming deltas + done + map_data.
- Preferred: include tool lifecycle and verse_search indicators.

## Decision Register

1. Web is source-of-truth for behavior and pipelines.
2. Mobile remains native-first for layout and interactions.
3. Any behavioral deviation requires explicit entry here and in shared doc.

### Round 4 - Root function parity (deep dive)

- Web UI/UX Expert:
  - Root is a dedicated modal view state entered via `ROOT` action from Synopsis, not a static secondary tab.
  - Required interactions: Strong's word taps, definition card, lost-context pager, explicit back to Synopsis.
- Web Logic Expert:
  - Root client should mirror web hook lifecycle:
    - reset on close/context change
    - loading and fallback states
    - stale-request protection
  - Root payload must keep contextual `book/chapter/verse(s)` semantics.
- Mobile UX Expert:
  - Native sheet/modal pattern is acceptable if sequence remains `Synopsis -> ROOT -> Back`.
  - Root actions should not crowd Synopsis; keep compact action row and dedicate root view surface once entered.
- Mobile UI Expert:
  - Replace previous static root chips with web-like semantic hierarchy:
    - interactive words
    - selected definition card
    - low-noise pager controls

Consensus:

1. Ship Root P0 as:

- new mobile root hook
- new native Root panel
- Reader modal refactor to dedicated root view

2. Keep native concessions only for layout and gesture implementation.
3. Preserve web action order and pipeline behavior.

### Round 5 - Reader header + selector parity

- Web UI/UX Expert:
  - Reader shell should not waste vertical space on redundant mode title text.
  - Book/chapter controls should be immediate dropdown interactions.
- Web Logic Expert:
  - Book dropdown selection should resume last chapter for that book when known, else chapter 1.
  - Chapter selection should commit instantly without confirmation CTA.
- Mobile UX Expert:
  - Keep header collapsible behavior.
  - Keep Prev/Next alongside selectors for fast linear navigation.
- Mobile UI Expert:
  - Replace input fields + Go with compact selector chips and sheet-based pickers.
  - Prioritize readability by reducing chrome height and keeping controls dense.

Consensus:

1. Remove Reader mode "Bible" shell title footprint.
2. Replace reader Book/Chapter text inputs with dropdown selectors.
3. Remove `Go`, apply immediate navigation on selection.
4. Implement mobile per-book chapter memory to match web reading-progress behavior.

### Round 6 - Library parity deep dive

- Web UI/UX Expert:
  - Web Library is a single workspace with compact shell, tab counts, export actions, connection detail modal, highlight analysis CTA, and first-class notes.
  - Mobile Library still reads like separate utility lists instead of one coherent workspace.
- Web Logic Expert:
  - Mobile already has wrappers for `updateLibraryConnection`, `deleteLibraryConnection`, and `updateLibraryMap`, but the controller and UI do not use them.
  - Notes parity does not need backend work because web notes are local-only today.
- Mobile UX Expert:
  - Biggest journey break is Connections: cards cannot open into a real review and edit state.
  - Notes placeholder is a false affordance because reader note data already exists on device.
- Mobile UI Expert:
  - Current chip row and stacked cards consume too much vertical space before content.
  - Shell cleanup and action consistency should happen before smaller polish work.

Consensus:

1. Library parity becomes the next P0 mobile slice.
2. Implementation order:
   - Library shell cleanup
   - Connection detail parity
   - Notes tab parity
   - Cross-entity continuity actions
   - Export and loading polish
3. Existing mobile API wrappers must be used before introducing any new library backend work.

### Round 7 - Backlog ratified

- Shared document updated:
  - `apps/mobile/LIBRARY_PARITY_DELIVERABLE.md`
- Accepted native concessions:
  - bottom sheet or full-screen detail route for connection review
  - native share sheet instead of browser-style export dropdown
  - long-press or overflow actions instead of hover delete affordances
- Explicit non-concessions:
  - Notes cannot remain a placeholder
  - Connections cannot remain read-only cards
  - Highlight analysis entry cannot stay web-only

Consensus:

1. The deliverable file is now the implementation source of truth for Library parity.
2. Any deviation from the web Library action model must be logged in this thread and the deliverable before implementation.

### Round 8 - Native Library parity implementation landed

- Mobile UX Expert:
  - Library is now a single native workspace with compact mode tabs, first-class notes, and stronger continuation into Reader, Chat, and Map.
  - Exact verse-focus handoff now exists for Library note opens and Library-related bookmark/highlight detail opens.
- Mobile UI Expert:
  - The old chip-heavy shell was replaced by a cleaner header plus segmented tab rail.
  - Detail actions moved into native sheets for connections, maps, notes, and export.
- Web UI/UX Expert:
  - Core web Library behaviors now present on mobile:
    - connection review and edit
    - notes as a first-class tab
    - highlight analysis entry
    - export options
- Web Logic Expert:
  - Implementation reused existing mobile protected API wrappers for connection and map mutation.
  - Full mobile typecheck and Jest suite passed after the parity pass.

Consensus:

1. Library P0 is functionally delivered on native mobile.
2. Remaining work is now primarily follow-on polish:
   - any additional export refinements

### Round 9 - Contextual save and Library polish closed

- Mobile UX Expert:
  - Manual Library map creation is gone; map save now happens from the native map surface where the user has context.
  - Library now surfaces one status banner per active tab so sync and failure states are easier to scan on mobile.
- Mobile UI Expert:
  - Export sheet copy now explains the plain-text vs JSON choice instead of presenting unlabeled technical actions.
  - Empty states now point to the actual native entry points, especially for maps.
- Web UI/UX Expert:
  - The mobile Library action model now matches web intent more closely: save from workflow context, manage from Library.
- Web Logic Expert:
  - Obsolete `LibraryMapCreate` navigation/runtime path was removed.
  - Full native typecheck and Jest suite passed after cleanup and polish.

Consensus:

1. The old manual map-create parity gap is closed.
2. Native Library is aligned on the intended contextual-save workflow, with only minor future polish remaining.

### Round 10 - Bookmarks relocated to Reader

- Mobile UX Expert:
  - Bookmarks no longer compete with highlights inside Library.
  - Reader now owns the bookmark return-to-place workflow, which better matches user intent.
- Mobile UI Expert:
  - Added a header bookmark control beside chapter navigation.
  - Long-press opens a compact bookmark list modal using the same visual pattern as chapter selection.
- Web UI/UX Expert:
  - This is an intentional native concession rather than strict web parity: bookmarks are being treated as navigation state, not study artifacts.
- Web Logic Expert:
  - Bookmark routes were removed from the active mobile app stack.
  - Library primary tabs no longer include bookmarks.
  - Full native typecheck and Jest suite passed after the move.

Consensus:

1. Bookmarks are now a Reader-first feature on mobile.
2. Library cleanup can proceed next with a narrower scope: Connections, Maps, Highlights, and Notes.

### Round 11 - Library shell rebuilt for native paging

- Mobile UX Expert:
  - Library no longer opens with a large summary card competing with content.
  - The top of Library is now a slim rail, and sections behave more like separate pages.
  - Users can move across Library sections by tapping tabs or swiping left/right.
- Mobile UI Expert:
  - Removed the oversized fixed shell that was visually broken on iPhone.
  - Reduced top chrome and moved highlight export down into item-level actions.
- Web UI/UX Expert:
  - Mobile still diverges from web in presentation, but the new model better matches the web intent of section-based navigation.
- Web Logic Expert:
  - Pull-to-refresh is now the only visible refresh path inside Library pages.
  - Full native typecheck and Jest suite passed after the Library shell rebuild.

Consensus:

1. The old top-level Library card is no longer the navigation primitive on mobile.
2. Highlight export belongs with highlight content, not with global Library chrome.
