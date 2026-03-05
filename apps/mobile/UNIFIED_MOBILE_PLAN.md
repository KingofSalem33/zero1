# Unified Mobile Plan

## Objective

Deliver a native mobile experience that matches the web app's core function set and interaction quality, while staying optimized for iOS/Android usability and accessibility.

## Priority 0 (Must Fix Before Next TestFlight)

| #   | Issue                                    | Root Cause                                                                |
| --- | ---------------------------------------- | ------------------------------------------------------------------------- |
| 1   | No press feedback on any `Pressable`     | Tappable elements show no visual state change on press                    |
| 2   | Global busy overlay blocks app           | `runProbe()` after mutations triggers full-screen blocking                |
| 3   | No mutation success feedback             | No toast/banner confirmation after create/delete                          |
| 4   | 6 bottom tabs                            | Exceeds platform guidance and creates cramped targets                     |
| 5   | Reader verse text too small              | Body text is 14px; needs 16+ with serif treatment                         |
| 6   | Touch targets too small                  | Quick actions and chips below 44pt touch target minimum                   |
| 7   | OAuth callback URL visible in production | Debug callback text is not gated by environment                           |
| 8   | Missing accessibility attributes         | No `accessibilityLabel`/`accessibilityRole`/`accessibilityState` coverage |

## Priority 1 (Same Sprint)

1. No toast system.
2. `formatRelativeDate` behavior is broken.
3. Library screen is overloaded.
4. Bookmark detail is a dead end.
5. Shadows are too aggressive.
6. Glassmorphism treatment is missing.
7. Font tokens are incomplete.
8. `WebAppShellScreen` is still light-theme.
9. No chapter-scroll reset on navigation.
10. Reader uses text-input book picker.
11. "Selected" stat provides no value.
12. Highlight delete behavior is inconsistent.

## Execution Order

### Phase 1 - Foundation (No Screen Behavior Changes)

1. Update tokens: typography scale, shadows, touch targets, font families, animation.
2. Update `apps/mobile/src/theme/mobileStyles.ts` to consume revised tokens.
3. Create primitives: `PressableScale`, `Toast`/`ToastContext`, `SearchInput`, `EmptyState`, `StatCard`.
4. Update `ActionButton` to use `PressableScale`.
5. Fix `formatRelativeDate`.

### Phase 2 - Controller Fixes

6. Remove `runProbe()` from all mutation handlers.
7. Remove global busy overlay from `apps/mobile/src/AppRuntime.tsx`.
8. Add `ToastProvider` and fire success/error toasts after mutations.

### Phase 3 - Navigation Restructure

9. Create `SavedScreen` (segmented control: Bookmarks / Highlights).
10. Consolidate tabs to four: Reader, Saved, Library, Account.
11. Move map fallback entry into Library (remove map tab).
12. Extract map creation into stack route.

### Phase 4 - Screen Upgrades (Parallelizable)

13. Auth: hide callback URL in production, add press states, add accessibility attributes.
14. Reader: serif font, chapter scroll reset, picker nav, press states, toasts.
15. Bookmarks/Highlights: remove "Selected" stat, add press states, unify feedback, fix delete consistency.
16. Detail screens: increase chip/action hit areas, add "Go to verse", ensure explicit confirmations.
17. Library: split sections and apply shared primitives.
18. Account: add press states and accessibility coverage.

### Phase 5+ - Polish Backlog

1. Haptics pass.
2. Running-text verse presentation options.
3. Dismissible contextual hints.
4. Style dedup and component cleanup.

## Key Design Decision - Tab Consolidation

| Current (6 tabs) | Proposed (4 tabs)                                |
| ---------------- | ------------------------------------------------ |
| Reader           | Reader                                           |
| Library          | Library (connections + maps + map fallback link) |
| Bookmarks        | Saved (Bookmarks / Highlights segmented)         |
| Highlights       | Account                                          |
| Account          | -                                                |
| Map (Beta)       | -                                                |

## Acceptance Gate for Next TestFlight

1. All P0 items completed and QA-verified.
2. No full-screen blocking overlay during routine mutations.
3. Press states, touch targets, and accessibility attributes applied across primary flows.
4. Navigation reduced to 4-tab structure with map fallback relocated.
