# Tool Status Design System

## Overview

Improved tool status display with consistent iconography, minimal motion, and proper information hierarchy.

## Design Principles

### 1. Consistent Iconography

**Before:** Mixed emoji and gradient backgrounds (🔍, 📄, 🧮, 📁)
**After:** Unified SVG icon set with consistent stroke width and style

**Icon Set:**

- Search icon → Web Search
- Download icon → Fetch URL
- Calculator icon → Calculate
- File icon → File Search
- Spinner → In Progress
- Check → Completed
- Alert Triangle → Error

### 2. Minimal Motion

**Before:** Full chip pulsing with `animate-pulse`
**After:** Subtle spinner animation only on in-progress icons

**Motion Rules:**

- ✅ Use: Spinner for active/in-progress state
- ❌ Avoid: Pulsing, expanding, simultaneous animations
- 🎯 Goal: Motion indicates progress without distraction

### 3. Neutral Base Styling

**Before:** Multiple gradient schemes

- Active: yellow/orange gradient
- Completed: blue/purple gradient
- Error: red/orange gradient

**After:** Consistent neutral base with semantic icons

- All chips: `bg-neutral-800/50` with `border-neutral-700/50`
- Semantic color: Only on status icons (green check, red alert)

### 4. Dedicated Results Panel

**Before:** Inline expansion below chips
**After:** Proper panel with header and content sections

**Panel Structure:**

```
┌─────────────────────────────────┐
│ [Icon] Tool Result        [×]   │ ← Header with title & close
├─────────────────────────────────┤
│                                 │
│  Result content with            │ ← Content area
│  proper hierarchy               │   (scrollable if needed)
│                                 │
└─────────────────────────────────�┘
```

## Component States

### In Progress

```tsx
<chip>
  <Spinner /> Tool Name
</chip>
```

- Neutral background
- Subtle spinner animation
- No interaction

### Completed (with result)

```tsx
<button>
  <ToolIcon /> Tool Name <CheckIcon /> <ChevronIcon />
</button>
```

- Neutral background
- Green check indicator
- Clickable to expand
- Hover state for feedback

### Completed (no result)

```tsx
<div>
  <ToolIcon /> Tool Name <CheckIcon />
</div>
```

- Neutral background
- Green check indicator
- Non-interactive

### Error

```tsx
<button>
  <AlertIcon /> Tool Name failed <ChevronIcon />
</button>
```

- Red-tinted background (`bg-red-900/20`)
- Red border
- Clickable to view error details

## Typography Hierarchy

### In Panel Header

- **Font:** `text-sm font-semibold`
- **Color:** `text-neutral-200`
- **Context:** Panel title with icon

### In Panel Content

- **Font:** `font-mono text-xs`
- **Color:** `text-neutral-300`
- **Purpose:** Code/data display
- **Max Height:** `max-h-80` with scroll

### In Chips

- **Font:** `text-xs font-medium`
- **Color:** `text-neutral-300` (active/completed)
- **Color:** `text-red-400` (error)

## Usage Guidelines

### When to Show Tools

- Show during AI execution
- Persist after completion for context
- Allow expansion for detailed results

### Interaction Patterns

1. **No result:** Display chip only (informational)
2. **Has result:** Make clickable with chevron indicator
3. **Error:** Always make clickable to view details

### Scannability

- Left-align all chips
- Use consistent spacing (`gap-2`)
- Group by status (active → completed → errors)
- Clear visual hierarchy in expanded panel

## Implementation

### Key Components

```tsx
// Icon component with consistent styling
<Icon name="search" className="w-3.5 h-3.5" />

// Status chip wrapper
<button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ...">

// Results panel
<div className="bg-neutral-900/80 border border-neutral-700/50 rounded-xl">
  <div className="px-4 py-3 border-b ..."> {/* Header */}
  <div className="p-4"> {/* Content */}
</div>
```

### Color Tokens

- Base: `neutral-800/50` background, `neutral-700/50` border
- Success: `green-500` for check icon
- Error: `red-900/20` background, `red-500/30` border, `red-400` text
- Hover: `neutral-800` background, `neutral-600` border

## Benefits

1. **Reduced Cognitive Load** - Consistent neutral styling, semantic colors only for status
2. **Better Scannability** - Clear typography hierarchy, dedicated panel
3. **Less Distraction** - Motion only where needed (spinner for progress)
4. **Professional Polish** - SVG icons instead of emoji, proper panel structure
