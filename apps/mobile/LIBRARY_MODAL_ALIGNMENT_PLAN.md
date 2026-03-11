# Library Modal Alignment Plan

## Scope

Native mobile Library modals/sheets in `apps/mobile/src/screens/DataListScreens.tsx`.
Reviewed components:

- `LibrarySheet`
- `ConnectionDetailSheet`
- `MapDetailSheet`
- `NoteDetailSheet`
- `HighlightDetailSheet`

## Agents

1. Modal UX Agent
2. Modal UI Agent
3. Content Hierarchy Agent
4. Action Flow Agent

## Agent 1: Modal UX Agent

### Review

All Library tabs now use the same modal shell, but they do not yet feel like the same product flow.

### Findings by modal

#### Connection

- Dense and study-heavy.
- Includes relationship pills, synopsis, explanation, note edit, tag edit, and 4 actions.
- Feels like the most complex modal.

#### Map

- Clear edit modal.
- Strong separation between metadata and editable fields.
- Best current baseline for editable saved-object modal.

#### Note

- Simplest modal.
- Very readable.
- Best current baseline for low-friction Library editing.

#### Highlight

- Now uses the Library sheet, which fixed the biggest structural inconsistency.
- Still mixes content review and editing without a formal section structure.

### UX gaps

- No single rule for what appears in the summary area vs editor area.
- Action order differs by tab.
- Some sheets start with metadata pills, others start with content.

## Agent 2: Modal UI Agent

### Review

Focused on sheet anatomy and visual rhythm.

### Findings

#### Shared shell: `LibrarySheet`

- Good common base.
- Handle, close button, and scroll behavior are appropriate.
- Header is structurally sound.

#### Connection

- Uses one `libraryEditorCard`, but still visually crowded.
- Too many meta pills at the top can make the first screen feel noisy.

#### Map

- Uses a summary block plus editor card.
- Most balanced visual separation of any modal.

#### Note

- Single editor card is appropriate.
- Cleanest rhythm.

#### Highlight

- Single editor card is appropriate.
- Missing a small summary/meta section that clarifies context before editing.

### UI gaps

- Card count is inconsistent: maps use 2 blocks, others mostly use 1.
- Top-of-modal information hierarchy is not uniform.
- Summary metadata needs one standard treatment.

## Agent 3: Content Hierarchy Agent

### Review

Focused on information order inside each modal.

### Current modal content order

#### Connection

- pills
- synopsis
- explanation
- note field
- tags field
- actions

#### Map

- metadata summary card
- title field
- note field
- tags field
- actions

#### Note

- note field
- timestamp
- actions

#### Highlight

- highlight text
- timestamp
- color field
- note field
- actions

### Hierarchy gaps

- The first visible content changes too much across modals.
- Timestamp placement is inconsistent.
- Editable fields appear too early in some modals before the user is reoriented to what they opened.

### Recommended hierarchy

Every modal should follow:

1. Header: title + subtitle
2. Summary block: core context only
3. Editor block: editable fields only
4. Utility row: open/share/go deeper as secondary actions
5. Commit row: save primary, delete destructive

## Agent 4: Action Flow Agent

### Review

Focused on action grouping and decision order.

### Findings

#### Connection

- `Save metadata`, `Go deeper`, `Open map`, `Delete`
- Strong action set, but split across two rows with different logic than the others.

#### Map

- `Save changes`, `Open map`, `Delete map`
- Clean but naming differs from connection.

#### Note

- `Open in reader`, `Save note`, `Delete note`
- Good action set, but order differs from highlight/map.

#### Highlight

- `Open in reader`, `Share`, `Save changes`, `Delete`
- Best action grouping structure.

### Action gaps

- Verb labels differ unnecessarily: `Save metadata`, `Save changes`, `Save note`
- Delete labels differ unnecessarily: `Delete`, `Delete map`, `Delete note`
- Secondary actions are not always grouped the same way.

### Recommended action standard

Use this action order everywhere:

1. Secondary utility row
   - `Open`
   - `Share` or `Go deeper` or `Open map` if applicable
2. Primary commit row
   - `Save`
   - `Delete`

Label rules:

- prefer `Open`, not `Open in reader` unless ambiguity exists
- prefer `Save`, not object-specific variants
- prefer `Delete`, not object-specific variants
- keep `Go deeper` only for connections
- keep `Share` only where supported

## Unified Modal Alignment Plan

### Modal Standard

All Library modals should use this exact structure:

#### Section 1: Header

- `LibrarySheet` title
- object-specific subtitle
- no extra status text in header

#### Section 2: Summary block

Purpose: confirm object identity before editing.

Rules:

- use one compact summary block across all modals
- max 3-5 metadata pills
- show only meaningful metadata
- avoid decorative type pills

By tab:

- Connections: type, similarity, key verse refs
- Maps: anchor, verse count, edge count
- Highlights: verse reference, updated time
- Notes: verse reference, updated time

#### Section 3: Content block

Purpose: show the saved content itself.

By tab:

- Connections: synopsis + optional explanation
- Maps: optional note preview if present
- Highlights: highlight text
- Notes: current note text

Rules:

- content should be readable before edit fields begin
- timestamps belong here or in summary, not floating between editor fields

#### Section 4: Editor block

Purpose: only editable inputs.

Rules:

- all editable inputs live in one `libraryEditorCard`
- same label spacing
- same field spacing
- same multiline heights where semantically similar

By tab:

- Connections: note, tags
- Maps: title, note, tags
- Highlights: color, note
- Notes: note

#### Section 5: Actions

Purpose: consistent decision flow.

Rules:

- Row A = secondary actions
- Row B = primary/destructive actions
- same button ordering across tabs where possible

Standard rows:

- Row A: `Open` + optional contextual action (`Share`, `Open map`, `Go deeper`)
- Row B: `Save` + `Delete`

## Implementation Backlog

### P0

1. Normalize action labels across all Library modals.
   Acceptance criteria:

- `Save` everywhere
- `Delete` everywhere
- `Open` wherever Reader/Map opening is the main utility action

2. Add a formal summary block to `HighlightDetailSheet`.
   Acceptance criteria:

- highlight text no longer starts at the top without context
- summary matches other modals

3. Add a formal summary block to `NoteDetailSheet`.
   Acceptance criteria:

- reference and updated time live in a summary section above editing
- note field starts in the editor section, not as the first thing in the modal

4. Reduce top-of-sheet density in `ConnectionDetailSheet`.
   Acceptance criteria:

- no more than 5 pills in the summary block
- synopsis and explanation are visually separated from editor inputs

### P1

5. Split `MapDetailSheet` into explicit summary and editor sections using the same section naming and spacing as the other modals.

6. Create one shared helper for modal action rows.
   Acceptance criteria:

- consistent spacing and button ordering
- no custom per-sheet action layout drift

7. Create one shared helper for modal summary blocks.
   Acceptance criteria:

- same visual grammar across all tabs
- pills, timestamps, and preview text render consistently

### P2

8. Decide whether color should remain editable in highlight Library modal or move back to Reader-only editing.
   Reason:

- color editing is functionally valid, but it is the least �Library-like� edit in the set.

## Final Decision

The modals are now on one shell, but not yet on one composition system.

The alignment target is:

- one shell
- one summary section
- one editor section
- one action-row model
- one button naming standard

Best next implementation sequence:

1. normalize modal action labels
2. add summary sections to highlight and note
3. reduce connection density
4. extract shared modal section helpers
