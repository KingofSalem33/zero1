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
