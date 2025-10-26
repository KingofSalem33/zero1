# Gradient Migration Guide

This guide helps you migrate from old gradient patterns to the new standardized gradient system.

## Migration Status

### ✅ Completed

- RoadmapSidebar.tsx - All gradients standardized
- UnifiedWorkspace.tsx - All gradients standardized
- Tailwind config - Gradient palette defined
- Design tokens documentation - Updated with new system

### 🔄 In Progress

- App.tsx - Needs systematic update (40+ instances)
- CheckpointsModal.tsx - Multiple gradient instances
- ArtifactDiffModal.tsx - Multiple gradient instances
- Other modal components

## Find & Replace Patterns

Use these patterns to systematically update gradients throughout the codebase.

### Brand Gradients (Blue → Purple)

Old pattern → New pattern:

```tsx
// Primary button gradients
"bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500"
→ "bg-gradient-brand hover:bg-gradient-brand-hover"

// Subtle background gradients
"bg-gradient-to-br from-blue-600/20 to-purple-600/20"
→ "bg-gradient-brand-subtle"

"bg-gradient-to-br from-purple-600/20 to-indigo-600/20"
→ "bg-gradient-brand-subtle"

// Header/footer gradients
"bg-gradient-to-r from-blue-950/30 to-purple-950/30"
→ "bg-gradient-brand-muted"

"bg-gradient-to-r from-blue-950/50 to-purple-950/50"
→ "bg-gradient-brand-muted"

"bg-gradient-to-r from-purple-950/50 to-indigo-950/50"
→ "bg-gradient-brand-muted"

// Icon backgrounds
"bg-gradient-to-br from-blue-500 to-purple-600"
→ "bg-gradient-brand"

"bg-gradient-to-br from-purple-500 to-indigo-600"
→ "bg-gradient-brand"
```

### Neutral/Surface Gradients

Old pattern → New pattern:

```tsx
// Modal backgrounds
"bg-gradient-to-br from-gray-900 to-black"
→ "bg-gradient-surface"

"bg-gradient-to-br from-gray-900/98 to-black/95"
→ "bg-gradient-surface backdrop-blur-xl"

// Card backgrounds
"bg-gradient-to-br from-gray-900/60 to-gray-800/40"
→ "bg-gradient-surface-subtle"

"bg-gradient-to-br from-gray-900/50 to-black/50"
→ "bg-gradient-surface-subtle"

"bg-gradient-to-br from-gray-900/40 to-gray-800/40"
→ "bg-gradient-surface-subtle"
```

### Success Gradients

Old pattern → New pattern:

```tsx
// Mixed green-blue gradients (NOT ALLOWED - use pure green)
"bg-gradient-to-r from-emerald-600 to-blue-600"
→ "bg-gradient-success"

"bg-gradient-to-r from-emerald-500 to-blue-500"
→ "bg-gradient-success"

"bg-gradient-to-r from-green-600 to-emerald-600"
→ "bg-gradient-success"

// Subtle backgrounds
"bg-gradient-to-br from-green-950/20 to-emerald-950/20"
→ "bg-gradient-success-subtle"

"bg-gradient-to-br from-emerald-950/30 to-green-950/30"
→ "bg-gradient-success-subtle"

"bg-gradient-to-r from-emerald-950/50 to-green-950/50"
→ "bg-gradient-success-subtle"

// Icon backgrounds
"bg-gradient-to-br from-emerald-500 to-green-600"
→ "bg-gradient-success"
```

### Warning Gradients

Old pattern → New pattern:

```tsx
// Mixed yellow-orange gradients (NOT ALLOWED - use pure amber)
"bg-gradient-to-r from-yellow-600 to-orange-600"
→ "bg-gradient-warning"

// Subtle backgrounds
"bg-gradient-to-br from-yellow-950/20 to-orange-950/20"
→ "bg-gradient-warning-subtle"

"bg-gradient-to-r from-amber-900/40 to-yellow-900/40"
→ "bg-gradient-warning-subtle"
```

### Error/Destructive Gradients

Old pattern → New pattern:

```tsx
// Mixed red-orange gradients (NOT ALLOWED - use pure red)
"bg-gradient-to-r from-red-600 to-orange-600"
→ "bg-gradient-error"
```

### Progress Bars

Old pattern → New pattern:

```tsx
// Active progress bar
"bg-gradient-to-r from-blue-500 to-purple-500"
→ "bg-gradient-brand"
```

## Special Cases

### Disabled States

For disabled button gradients, use neutral background instead:

```tsx
// Old
"disabled:from-gray-600 disabled:to-gray-600"
→ "disabled:bg-neutral-600"

"disabled:from-gray-700 disabled:to-gray-600"
→ "disabled:bg-neutral-700"
```

### Hover States for Neutral Buttons

```tsx
// Old
"bg-gradient-to-br from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600"
→ "bg-neutral-600 hover:bg-neutral-500"
```

### "Inspire Me" Button (Special Purple-Pink)

The "Inspire Me" button has a unique purple-to-pink gradient. This is intentional to differentiate it from primary actions. Keep as-is or standardize to brand gradient:

```tsx
// Option 1: Keep unique (acceptable for special feature)
"bg-gradient-to-r from-purple-600 to-pink-600";

// Option 2: Standardize to brand (recommended)
"bg-gradient-brand hover:bg-gradient-brand-hover";
```

## Update Strategy

### For Large Files (like App.tsx)

1. **Search and replace systematically**: Use your editor's find & replace with the patterns above
2. **Focus on high-impact areas first**:
   - Modal headers (most visible)
   - Primary buttons (most used)
   - Progress indicators
3. **Test incrementally**: Check the UI after each batch of changes

### For Smaller Components

1. Read the file
2. Replace all gradients in one pass
3. Verify with type-check

## Validation Checklist

After migration, verify:

- [ ] No `from-*-* to-*-*` patterns exist (except in standardized gradient definitions)
- [ ] All brand interactions use `bg-gradient-brand` family
- [ ] All success states use `bg-gradient-success` family
- [ ] All modals use `bg-gradient-surface` for backgrounds
- [ ] All modal headers use `bg-gradient-brand-muted`
- [ ] No mixed-color semantic gradients (e.g., emerald-to-blue, red-to-orange)
- [ ] Type-check passes: `npx tsc --noEmit`

## Search Commands

To find remaining gradient instances:

```bash
# Find all old-style gradients
grep -r "bg-gradient-to-[rblt]" apps/web/src --include="*.tsx"

# Find specific problem patterns
grep -r "from-.*to-" apps/web/src --include="*.tsx"

# Find mixed semantic gradients (not allowed)
grep -r "emerald.*blue\|green.*blue\|red.*orange\|yellow.*orange" apps/web/src --include="*.tsx"
```

## Benefits of Standardization

1. **Consistency**: Same visual language across all surfaces
2. **Maintainability**: Change brand colors in one place
3. **Intentionality**: Every gradient has a clear semantic purpose
4. **Performance**: Fewer unique gradient definitions
5. **Accessibility**: Consistent contrast ratios

## Notes

- The old gradient system had 40+ unique gradient combinations
- The new system has 15 standardized gradients
- This reduces cognitive load and improves design consistency
- All gradients are defined in `tailwind.config.js` backgroundImage section
