# Library Uniformity Review

## Scope

Native mobile Library in `apps/mobile/src/screens/DataListScreens.tsx` and shared card primitives in `apps/mobile/src/screens/common/EntityCards.tsx`.
Tabs reviewed:

- Connections
- Maps
- Highlights
- Notes

## Agents

1. Mobile UX Agent A: navigation, gestures, mental model
2. Mobile UI Agent B: card anatomy, spacing, hierarchy
3. Mobile UX Agent C: interaction/state consistency across tabs
4. Mobile UI Agent D: detail sheet/modal consistency and metadata treatment

## Agent 1: Mobile UX Agent A

### Review method

Reviewed:

- `LibraryScreen`
- `LibraryModeTabs`
- `useScrollHideHeader`
- tab page builders for connections, maps, notes
- embedded `HighlightsScreen`

### Findings by tab

#### Connections

- Works as a Library page: search, pull-to-refresh, swipe navigation.
- Tap opens detail sheet.
- Long-press reveals quick actions.
- Still carries heavier study-specific actions than other tabs (`Go deeper`, `Open map`).

#### Maps

- Same page shell as connections.
- Tap opens edit/detail sheet.
- Long-press reveals quick actions.
- Strong parity with Library mental model.

#### Highlights

- Best current interaction model.
- Tap opens detail.
- Long-press reveals inline quick actions.
- Embedded version already feels like the reference behavior for the rest of Library.

#### Notes

- Same page shell as connections/maps.
- Tap opens detail.
- Long-press reveals quick actions.
- Semantically closer to Reader than other tabs, but behavior is acceptable inside Library.

### UX gap list

- Connections detail workflow still feels more like a utility editor than a compact Library review flow.
- Quick-action sets differ by tab more than necessary.
- Header language and empty-state language are not yet fully normalized across tabs.
- There is no single explicit rule for what tap does, what long-press does, and what belongs in detail vs quick actions.

## Agent 2: Mobile UI Agent B

### Review method

Reviewed:

- `ConnectionCard`
- `LibraryMapCard`
- `HighlightCard`
- `VerseNoteCard`
- related styles in `mobileStyles.ts`

### Findings by card

#### Connections

- Card is structurally close to the target pattern.
- Uses route, synopsis, meta pills, note, timestamp.
- Tags are present and useful.
- Visually heavier than highlight because of more simultaneous metadata.

#### Maps

- Improved from prior state.
- Raw map/bundle id is no longer primary.
- Tags now surface more cleanly.
- Card still carries both header tag summary and body tags, which is redundant.

#### Highlights

- Cleanest card in the set.
- Reference + text + note + timestamp is the strongest base template.
- Does not currently support tags in the data model.

#### Notes

- Clean and lightweight.
- Uses a `Note` pill, which is more type-labeling than useful metadata.
- No tags in data model.

### UI gap list

- Card metadata strategy is not uniform.
- Connections and maps use tags; highlights and notes do not have tags in schema.
- Some tabs show type/context pills that add little value.
- A strict �replace IDs with tags everywhere� rule is not possible without schema changes for highlights/notes.

## Agent 3: Mobile UX Agent C

### Review method

Reviewed all press, long-press, quick-action, and detail-sheet functions.

### Current interaction map

- Tap on card:
  - Connections: open connection detail sheet
  - Maps: open map detail sheet
  - Highlights: open highlight detail screen
  - Notes: open note detail sheet
- Long-press on card:
  - Connections: reveal quick actions inline
  - Maps: reveal quick actions inline
  - Highlights: reveal quick actions inline
  - Notes: reveal quick actions inline

### Consistency findings

- Inline quick actions are now mostly aligned.
- Highlights remain the strongest reference implementation.
- Detail destinations are not aligned:
  - Connections, Maps, Notes use bottom-sheet style via `LibrarySheet`
  - Highlights use a separate routed detail screen in `DetailScreens.tsx`
- This is the biggest remaining structural inconsistency in Library.

### UX gap list

- Library should have one detail pattern, not sheet for 3 tabs and routed screen for 1 tab.
- If Highlights is the reference, other tabs should either move toward a full-screen detail page or Highlights should move into the same sheet system.
- For mobile speed and parity with current implementation, one shared sheet pattern inside Library is the lower-cost path.

## Agent 4: Mobile UI Agent D

### Review method

Reviewed:

- `ConnectionDetailSheet`
- `MapDetailSheet`
- `NoteDetailSheet`
- `HighlightDetailScreen`

### Modal/detail findings

#### Connection detail

- Uses `LibrarySheet`, but content is still denser and more editor-forward than the other detail surfaces.
- Better than before, but not yet as restrained as highlight detail.

#### Map detail

- Consistent with sheet architecture.
- Clear title/note/tags model.
- Good baseline for editable Library object sheet.

#### Note detail

- Cleanest sheet implementation.
- Minimal and readable.

#### Highlight detail

- Not using `LibrarySheet`.
- Still lives as a dedicated screen.
- Color picker circles were removed from detail, which helped.
- Still structurally different from the rest of Library.

### UI gap list

- One shared detail template is missing.
- Header/subtitle/meta/action ordering differs between object types.
- Highlights cannot show tags because the data contract lacks them.

## Consolidated Decision Session

The four agents agree on these rules:

### Rule 1: One page shell

All Library tabs should keep:

- same collapsing top rail behavior
- same collapsing search/header behavior
- same list spacing
- same empty-state layout

### Rule 2: One card interaction model

All Library cards should use:

- tap = open detail
- long-press = reveal inline quick actions
- selected state = same visual treatment
- quick actions = compact pill buttons, same row styling

### Rule 3: One metadata hierarchy

Card hierarchy should be:

- line 1: primary label/reference/title
- line 2: main saved content snippet
- optional line 3: note preview
- bottom line: secondary metadata

Secondary metadata rules:

- show tags where tags exist
- do not invent tags where schema has none
- do not show raw IDs in list cards
- type pills should only remain if they add meaning

### Rule 4: One detail presentation model

Preferred path:

- move Highlights into the same `LibrarySheet` detail system used by Connections, Maps, and Notes

Reason:

- this is the lowest-cost path to true Library uniformity
- current Library already uses sheet-based detail for 3 of 4 tabs
- routed highlight detail is the largest remaining inconsistency

### Rule 5: One editing density standard

Library detail should prioritize:

- review first
- edit second
- destructive actions last

This means:

- compact metadata summary at top
- note/tags/body editing below
- primary save action
- secondary open/share action
- destructive delete action at bottom

## Uniform Backlog

### P0

1. Convert highlight detail from routed screen to Library sheet pattern.
   Owner: UI/UX joint
   Acceptance criteria:

- tapping a highlight in Library opens an in-library sheet, not a separate screen
- sheet uses same structure and spacing family as map/note/connection sheets
- quick actions remain available on long-press

2. Normalize detail sheet anatomy across Connections, Maps, Highlights, Notes.
   Owner: UI Agent D
   Acceptance criteria:

- same header structure
- same metadata block position
- same action order
- same bottom spacing and close behavior

3. Remove redundant metadata pills from list cards.
   Owner: UI Agent B
   Acceptance criteria:

- no raw ids on any Library card
- no duplicated tag summaries
- no decorative pills that do not help scanning

### P1

4. Normalize quick-action labels across tabs.
   Owner: UX Agent C
   Acceptance criteria:

- `Edit`, `Open`, `Share`, `Delete` naming is consistent where applicable
- tab-specific actions like `Go deeper` stay only where functionally required

5. Normalize empty-state and search result copy.
   Owner: UX Agent A
   Acceptance criteria:

- each tab uses the same sentence pattern
- same search-empty wording structure
- same saved-empty wording structure

### P2

6. Decide whether highlights need real tags in the shared schema.
   Owner: Product + data model
   Acceptance criteria:

- either add `tags` to highlight contracts and sync
- or keep highlights tagless and avoid implying tag parity in UI

7. Decide whether notes need tags.
   Owner: Product + data model
   Acceptance criteria:

- either keep notes lightweight
- or add tags intentionally, not as a visual patch

## Implementation Recommendation

Do the work in this order:

1. unify detail presentation by moving highlight detail into Library sheet
2. reduce redundant card metadata
3. normalize quick-action labels and copy
4. revisit schema only if true cross-tab tag parity is still required

## Bottom Line

Current state:

- page shell is mostly aligned
- card interaction model is mostly aligned
- detail presentation is not aligned
- metadata model is not aligned because the underlying data is not aligned

Best next move:

- do not keep patching each tab independently
- standardize on one `LibrarySheet`-based detail template and one card metadata strategy
