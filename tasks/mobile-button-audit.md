# Mobile Button Audit

Date: 2026-03-11
Scope: `apps/mobile/src` UI surfaces, shared native components, navigation chrome, and active modal sheets.

## Audit Method

- Inventory button instances by screen/component.
- Trace each instance back to either a shared primitive or a local one-off style.
- Compare size, shape, color, typography, icon treatment, spacing, and state handling.
- Flag drift from the mobile token system in `apps/mobile/src/theme/mobileStyles.ts` and `apps/mobile/src/theme/tokens.ts`.

## Shared Button Primitives

### `ActionButton`

Reference: `apps/mobile/src/components/native/ActionButton.tsx`

- Base interaction: wraps `PressableScale`, so every action button gets scale/opacity press motion and disabled accessibility state.
- Variants:
  - `primary`: accent fill, 44 min height, 12px vertical padding, 12 radius, bold 16 label.
  - `secondary`: surface fill, 44 min height, 12px vertical padding, 12 radius, bold 16 label.
  - `ghost`: raised surface, 44 min height, 10px vertical padding, 12 radius, semibold 16 label.
  - `danger`: red-tinted surface, 44 min height, 12px vertical padding, 12 radius, bold 16 label.
- Disabled state: `opacity: 0.5`.
- Pressed state: motion only unless caller adds an explicit pressed style.
- Icon support: left icon slot exists, but the component does not inject spacing rules itself.

### `PressableScale`

Reference: `apps/mobile/src/components/native/PressableScale.tsx`

- Shared pressed motion only: scale and opacity, controlled by token presets.
- No default visual pressed treatment beyond animation.
- Disabled state: `opacity: 0.5` and no press motion.

### Token Baseline

Reference: `apps/mobile/src/theme/tokens.ts`

- Touch target minimum: 44.
- Standard radius: 12.
- Pill radius: 999.
- Primary body text size: 16.
- Caption size used by pills/chips: 12.

## Inventory By Screen / Component

### Auth

References:

- `apps/mobile/src/screens/AuthHomeAccountScreens.tsx:68`
- `apps/mobile/src/screens/AuthHomeAccountScreens.tsx:135`
- `apps/mobile/src/screens/AuthHomeAccountScreens.tsx:217`
- `apps/mobile/src/screens/AuthHomeAccountScreens.tsx:262`
- `apps/mobile/src/theme/mobileStyles.ts:149`
- `apps/mobile/src/theme/mobileStyles.ts:174`

Buttons found:

- OAuth provider buttons: `Continue with Google`, `Continue with Apple`
- Email auth CTAs: `Sign in with email`, `Send magic link`
- Account actions: `Run protected check`, `Sign out`
- Highlight color selection chips

Attributes:

- Provider buttons: 44 min height, 12 radius, text-only, no icons, 16/700 typography.
- `ActionButton` CTAs: 44 min height, 12 radius, text-only, 16/700 typography.
- Color chips: 44x44 pill circles, color-only, active state uses accent border.

### Navigation Shell

References:

- `apps/mobile/src/navigation/MobileRootNavigator.tsx:179`
- `apps/mobile/src/navigation/MobileRootNavigator.tsx:272`
- `apps/mobile/src/navigation/MobileRootNavigator.tsx:290`
- `apps/mobile/src/navigation/MobileRootNavigator.tsx:472`
- `apps/mobile/src/navigation/MobileRootNavigator.tsx:536`
- `apps/mobile/src/navigation/MobileRootNavigator.tsx:549`

Buttons found:

- Top bar icon button
- Drawer close button
- Drawer destination buttons
- Account destination row

Attributes:

- Top bar icon button: 44x44 pill icon-only.
- Drawer close button: 34x34 circular icon-only.
- Drawer destination buttons: 44 min height, 12 radius, icon + label, 16/700 label.

### Reader

References:

- `apps/mobile/src/screens/ReaderScreen.tsx:1758`
- `apps/mobile/src/screens/ReaderScreen.tsx:2047`
- `apps/mobile/src/screens/ReaderScreen.tsx:2134`
- `apps/mobile/src/screens/ReaderScreen.tsx:2229`
- `apps/mobile/src/screens/ReaderScreen.tsx:2403`
- `apps/mobile/src/screens/ReaderScreen.tsx:2547`
- `apps/mobile/src/screens/ReaderScreen.tsx:2764`
- `apps/mobile/src/screens/ReaderScreen.tsx:2885`
- `apps/mobile/src/screens/ReaderScreen.tsx:2931`
- `apps/mobile/src/screens/ReaderScreen.tsx:3106`
- `apps/mobile/src/screens/ReaderScreen.tsx:3264`
- `apps/mobile/src/screens/ReaderScreen.tsx:3465`
- `apps/mobile/src/screens/ReaderScreen.tsx:3500`
- `apps/mobile/src/screens/ReaderScreen.tsx:3573`
- `apps/mobile/src/components/native/RootTranslationPanel.tsx:54`
- `apps/mobile/src/components/native/RootTranslationPanel.tsx:159`

Buttons found:

- Header controls: menu, previous chapter, book picker, next chapter, bookmark
- Footer controls: previous/next chapter, lens cards
- Verse actions modal: action buttons, disclosure pills, reference rows
- Selector sheets: book rows, chapter chips, bookmark rows
- Synopsis modal: action buttons, root translation back button, Strong�s word chips, pager arrows, highlight color circles

Attributes:

- Header icon buttons: 38x38, pill, icon-only.
- Book picker button: 38 min height, pill, text + chevron.
- Compact modal action buttons: 32 min height, 7 radius, 10.5/700 labels.
- Selector rows: 40 min height, 12 radius, text-only, 14/600 labels.
- Chapter chips: 56x40, 12 radius, centered numeric labels.
- Footer lens cards: 238x78 cards acting as buttons, multi-line label plus metadata.
- Root translation back button: small pill, 5 vertical padding, 12/600 label.
- Root translation pager arrows: 30x30 circular icon-only.

### Chat

References:

- `apps/mobile/src/screens/ChatMapScreens.tsx:2515`
- `apps/mobile/src/screens/ChatMapScreens.tsx:2560`
- `apps/mobile/src/screens/ChatMapScreens.tsx:2592`
- `apps/mobile/src/screens/ChatMapScreens.tsx:2618`
- `apps/mobile/src/screens/ChatMapScreens.tsx:2727`
- `apps/mobile/src/screens/ChatMapScreens.tsx:2830`
- `apps/mobile/src/screens/ChatMapScreens.tsx:3024`
- `apps/mobile/src/screens/ChatMapScreens.tsx:3566`
- `apps/mobile/src/screens/ChatMapScreens.tsx:3589`
- `apps/mobile/src/screens/ChatMapScreens.tsx:3631`
- `apps/mobile/src/screens/ChatMapScreens.tsx:3691`

Buttons found:

- Quick prompt cards
- Trace toggle icon button
- Send button
- New session pill
- Modal sheet actions via `ActionButton`
- Inline reference chips and map-related buttons

Attributes:

- Trace toggle: 32x32 icon-only square with 8 radius.
- Send button: 32x32 icon-only square with 8 radius.
- Quick prompt cards: 164x42 card-buttons, 10 radius, two-line text, category color treatment.
- New session button: 30 min height pill, 11/600 label.
- Sheet actions: standard `ActionButton`.

### Library

References:

- `apps/mobile/src/screens/DataListScreens.tsx:247`
- `apps/mobile/src/screens/DataListScreens.tsx:378`
- `apps/mobile/src/screens/DataListScreens.tsx:503`
- `apps/mobile/src/screens/DataListScreens.tsx:612`
- `apps/mobile/src/screens/DataListScreens.tsx:1206`
- `apps/mobile/src/screens/DataListScreens.tsx:1393`
- `apps/mobile/src/screens/DataListScreens.tsx:1492`
- `apps/mobile/src/screens/common/EntityCards.tsx:91`
- `apps/mobile/src/screens/common/EntityCards.tsx:189`
- `apps/mobile/src/screens/common/EntityCards.tsx:263`
- `apps/mobile/src/screens/common/EntityCards.tsx:361`
- `apps/mobile/src/theme/mobileStyles.ts:363`
- `apps/mobile/src/theme/mobileStyles.ts:792`

Buttons found:

- Library mode tabs
- Saved screen outline chips
- Card surfaces themselves (tap/long press)
- Inline quick-action pills on cards
- Modal sheet actions via `ActionButton`

Attributes:

- Library mode tabs: 44 min height pill, 12px horizontal padding, 12/700 label plus count.
- Saved screen chips: outline pill toggle buttons.
- Quick-action pills: 44 min height pill, 8 vertical padding, 12/700 label, no icons.
- Detail sheet actions: standard `ActionButton`.

### Detail Flows

References:

- `apps/mobile/src/screens/DetailScreens.tsx:116`
- `apps/mobile/src/screens/DetailScreens.tsx:149`
- `apps/mobile/src/screens/DetailScreens.tsx:206`
- `apps/mobile/src/screens/DetailScreens.tsx:415`
- `apps/mobile/src/screens/DetailScreens.tsx:496`

Buttons found:

- Bookmark suggestion chips
- Bookmark/highlight create and detail CTAs
- Share/open/delete/save actions

Attributes:

- Suggestion chips: pill chips, caption-sized labels.
- Form CTAs: standard `ActionButton` rows.

### Web Fallback Shell

References:

- `apps/mobile/src/screens/WebAppShellScreen.tsx:247`
- `apps/mobile/src/screens/WebAppShellScreen.tsx:485`

Buttons found:

- `Retry`
- `Open in Browser`
- `Use Native Shell`

Attributes:

- Custom one-off buttons, 44 min height, 10 radius, 18 horizontal padding.
- No shared primitive usage.

### Shared Auxiliary Components

References:

- `apps/mobile/src/components/native/NoteEditorModal.tsx:101`
- `apps/mobile/src/components/native/ToastViewport.tsx:15`

Buttons found:

- Note editor save button in modal header
- Toast cards function as dismiss buttons

Attributes:

- Note editor save button: standard `ActionButton` but visually compressed into modal header.
- Toast cards: large tappable cards, no explicit pressed variant.

## Inconsistencies

### 1. Critical icon buttons fall below the 44pt target

References:

- `apps/mobile/src/screens/ReaderScreen.tsx:2885`
- `apps/mobile/src/screens/ReaderScreen.tsx:2895`
- `apps/mobile/src/screens/ReaderScreen.tsx:3106`
- `apps/mobile/src/screens/ChatMapScreens.tsx:3566`
- `apps/mobile/src/screens/ChatMapScreens.tsx:3589`
- `apps/mobile/src/components/native/RootTranslationPanel.tsx:327`
- `apps/mobile/src/navigation/MobileRootNavigator.tsx:536`

Issue:

- Reader header and footer nav buttons are 38x38.
- Chat trace toggle and send are 32x32.
- Root translation pager arrows are 30x30.
- Drawer close is 34x34.
- These all undercut the 44pt token baseline and feel less premium because touch confidence varies by screen.

Recommendation:

- Standardize icon buttons to a 44x44 frame or keep the visual size smaller with `hitSlop` and a 44x44 invisible touch target.
- Use one shared `IconButton` primitive instead of local one-off circles and rounded squares.

### 2. Button corner radius is fragmented

References:

- `apps/mobile/src/theme/mobileStyles.ts:174`
- `apps/mobile/src/screens/ReaderScreen.tsx:2931`
- `apps/mobile/src/screens/ChatMapScreens.tsx:3566`
- `apps/mobile/src/screens/ChatMapScreens.tsx:3631`
- `apps/mobile/src/screens/WebAppShellScreen.tsx:485`

Issue:

- Shared CTAs use 12 radius.
- Reader compact buttons use 7 radius.
- Chat send/trace use 8 radius.
- Quick prompts and Web fallback buttons use 10 radius.
- Pills are used correctly for chips, but the non-pill button shapes drift across screens.

Recommendation:

- Limit button corner radii to three families:
  - 12 for all standard CTAs
  - 999 for pills/chips
  - 44 circular only for icon buttons
- Remove ad hoc 7, 8, and 10 radius buttons unless there is a strong platform reason.

### 3. Label typography is inconsistent enough to look product-by-product

References:

- `apps/mobile/src/theme/mobileStyles.ts:186`
- `apps/mobile/src/theme/mobileStyles.ts:806`
- `apps/mobile/src/screens/ReaderScreen.tsx:2942`
- `apps/mobile/src/screens/ChatMapScreens.tsx:3611`
- `apps/mobile/src/screens/ChatMapScreens.tsx:3664`
- `apps/mobile/src/screens/ChatMapScreens.tsx:3701`

Issue:

- Primary buttons use 16/700.
- Quick actions use 12/700.
- Reader compact buttons use 10.5/700.
- Chat send uses 11/700.
- Quick prompt labels use 9 and topic lines use 10.5/500.
- New Session uses 11/600.
- This makes Chat and Reader feel like different design systems instead of a single premium product.

Recommendation:

- Standardize button text into three tiers:
  - CTA: 16/700
  - Secondary compact: 13/700
  - Chip/micro: 12/700
- Remove 9 and 10.5 font sizes from actionable controls.

### 4. Disabled and pressed states are not visually consistent

References:

- `apps/mobile/src/theme/mobileStyles.ts:224`
- `apps/mobile/src/screens/ReaderScreen.tsx:2938`
- `apps/mobile/src/screens/ReaderScreen.tsx:3352`
- `apps/mobile/src/screens/ChatMapScreens.tsx:3604`
- `apps/mobile/src/screens/ChatMapScreens.tsx:3656`

Issue:

- Shared buttons use a simple 0.5 opacity disabled state.
- Chat send uses 0.42 opacity.
- Some buttons rely on scale-only pressed motion with no color response.
- Other buttons add their own explicit pressed fill/border styles.
- Users get different feedback strength depending on the screen.

Recommendation:

- Define pressed and disabled behavior centrally for each button family.
- Default pressed state should combine motion with a subtle fill/border change.
- Disabled state should keep one opacity value and optionally desaturate border/fill.

### 5. Icon usage is inconsistent and often lacks spacing rules

References:

- `apps/mobile/src/navigation/MobileRootNavigator.tsx:290`
- `apps/mobile/src/screens/ReaderScreen.tsx:1758`
- `apps/mobile/src/screens/ChatMapScreens.tsx:2592`
- `apps/mobile/src/components/native/ActionButton.tsx:28`

Issue:

- Some buttons are icon-only.
- Some are icon + label.
- `ActionButton` accepts `leftIcon` but has no built-in gap/alignment system.
- Icon buttons across Reader, Navigation, and Chat use different visual frames.

Recommendation:

- Introduce two shared primitives:
  - `IconButton`
  - `Button` with optional `leftIcon` and guaranteed 8px gap/alignment
- Keep icons optically centered and use one icon size scale per density tier.

### 6. Chat uses several undersized bespoke controls that weaken perceived quality

References:

- `apps/mobile/src/screens/ChatMapScreens.tsx:3566`
- `apps/mobile/src/screens/ChatMapScreens.tsx:3589`
- `apps/mobile/src/screens/ChatMapScreens.tsx:3631`
- `apps/mobile/src/screens/ChatMapScreens.tsx:3691`

Issue:

- Trace toggle and send are 32x32.
- New Session is 30 high.
- Quick prompt cards are only 42 high but carry two lines of copy.
- The result is a dense but slightly cramped toolbar language compared with the rest of the app.

Recommendation:

- Raise chat controls to the same density scale as Reader/Library:
  - icon buttons: 40-44 touch target
  - quick prompts: at least 44 height, cleaner 12/700 label and 13/600 body
  - new session pill: 36-40 height minimum

### 7. Reader has too many bespoke button classes for one screen

References:

- `apps/mobile/src/screens/ReaderScreen.tsx:2885`
- `apps/mobile/src/screens/ReaderScreen.tsx:2931`
- `apps/mobile/src/screens/ReaderScreen.tsx:3183`
- `apps/mobile/src/screens/ReaderScreen.tsx:3264`
- `apps/mobile/src/screens/ReaderScreen.tsx:3344`
- `apps/mobile/src/screens/ReaderScreen.tsx:3465`

Issue:

- Reader uses header icon buttons, compact primary buttons, footer card buttons, disclosure pills, selector rows, chapter chips, and highlight color circles.
- Several are valid interaction patterns, but the styling rules are independent rather than tiered from a single system.

Recommendation:

- Refactor Reader into a small button scale:
  - `IconButton`
  - `Button` / `CompactButton`
  - `FilterChip`
  - `ListRowButton`
  - `CardButton`
- Each should inherit shared state handling and typography.

### 8. Web fallback shell bypasses the shared button system

References:

- `apps/mobile/src/screens/WebAppShellScreen.tsx:247`
- `apps/mobile/src/screens/WebAppShellScreen.tsx:485`

Issue:

- `Retry`, `Open in Browser`, and `Use Native Shell` duplicate the shared button styles with hard-coded values.
- That creates another visual dialect and increases maintenance cost.

Recommendation:

- Replace these with `ActionButton` variants or a single screen-specific wrapper around `ActionButton`.

### 9. Note editor save placement is inconsistent with the rest of modal actions

References:

- `apps/mobile/src/components/native/NoteEditorModal.tsx:101`

Issue:

- The save action lives alone in the header, unlike Library and Reader modal actions that live in content rows.
- The button itself is standard, but its placement makes the modal feel like a separate product pattern.

Recommendation:

- Keep the separate note modal, but move actions into a consistent footer or action row shared by all modal editors.

## Standardization Plan

### P0: Establish button primitives

1. Add `Button`, `CompactButton`, `IconButton`, `ChipButton`, and `CardButton` primitives under `apps/mobile/src/components/native`.
2. Move pressed and disabled visuals into those primitives instead of scattered local styles.
3. Make `ActionButton` the base for `Button` and `CompactButton` rather than the only shared primitive.

### P1: Normalize touch targets and shape

1. Make all critical icon buttons 44x44 touch targets.
2. Use 12 radius for all non-pill CTAs.
3. Reserve pill shapes for filters, tabs, chips, and segmented controls.

### P2: Normalize typography and spacing

1. CTA labels: 16/700.
2. Compact labels: 13/700.
3. Chip labels: 12/700.
4. Remove 9 and 10.5 text sizes from action controls.
5. Standardize horizontal padding to 12 or 16 depending on button family.

### P3: Normalize state behavior

1. Use one disabled opacity scale.
2. Add consistent pressed fill/border adjustments for every family.
3. Standardize selected state treatment for tabs, chips, and row buttons.

### P4: Remove one-off button styles from screens

Priority order:

1. Reader
2. Chat
3. Navigation shell
4. Web fallback shell
5. Root translation panel

## Premium Quality Recommendations

- Reduce the number of visual button dialects. Premium quality comes more from disciplined repetition than from extra decoration.
- Raise undersized controls to reliable touch targets. Small controls feel cheaper even when they technically work.
- Keep visual density intentional: if a button is compact, its typography and spacing still need to look deliberate, not merely shrunk.
- Unify icon framing. The product should have one answer for how an icon-only action looks.
- Use stronger pressed-state feedback. Scale alone feels lightweight; a subtle fill change reads as more deliberate and polished.
- Reserve special colors for semantic meaning. Chat category colors are useful, but the structural button system should remain consistent underneath them.
