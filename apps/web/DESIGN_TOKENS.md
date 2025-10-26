# Design Tokens Guide

This document explains the design token system for the Zero-to-One Builder application.

## Overview

Our design system uses a combination of:

- **Tailwind CSS** configuration for utility classes
- **CSS variables** for runtime theming and consistent values

## Color Palette

### Brand Colors

Use these for primary actions, highlights, and brand elements:

```tsx
// Tailwind classes
className="bg-brand-primary-500"  // Blue
className="bg-brand-secondary-500" // Purple
className="bg-gradient-to-r from-brand-primary-500 to-brand-secondary-500"

// CSS variables
style={{ color: 'var(--color-brand-primary)' }}
```

### Neutral Colors

Use these for backgrounds, text, and borders:

```tsx
// Backgrounds
className = "bg-neutral-900"; // Main background
className = "bg-neutral-800"; // Elevated surfaces
className = "bg-neutral-700"; // Cards/panels

// Text
className = "text-white"; // Primary text
className = "text-neutral-300"; // Secondary text
className = "text-neutral-400"; // Subtle text
className = "text-neutral-500"; // Muted text

// Borders
className = "border-neutral-600/50"; // Semi-transparent borders
```

### Semantic Colors

Use these for feedback and status indicators:

```tsx
// Success (green)
className = "bg-success-500 text-white";
className = "bg-success-500/20 border border-success-500/50";

// Warning (amber)
className = "bg-warning-500 text-white";

// Error (red)
className = "bg-error-500 text-white";
```

## Typography

### Font Families

```tsx
className = "font-sans"; // Inter - Main UI font
className = "font-mono"; // JetBrains Mono - Code and technical content
```

### Font Sizes

```tsx
className = "text-xs"; // 12px - Labels, captions
className = "text-sm"; // 14px - Secondary text
className = "text-base"; // 16px - Body text
className = "text-lg"; // 18px - Emphasized text
className = "text-xl"; // 20px - Subheadings
className = "text-2xl"; // 24px - Section titles
className = "text-3xl"; // 30px - Page titles
className = "text-4xl"; // 36px - Hero text
```

### Font Weights

```tsx
className = "font-normal"; // 400
className = "font-medium"; // 500
className = "font-semibold"; // 600
className = "font-bold"; // 700
className = "font-extrabold"; // 800
className = "font-black"; // 900
```

## Spacing

Use consistent spacing values from the Tailwind spacing scale:

```tsx
className = "p-2"; // 8px
className = "p-4"; // 16px
className = "p-6"; // 24px
className = "p-8"; // 32px

className = "gap-2"; // 8px gap in flex/grid
className = "gap-4"; // 16px gap
```

CSS variables are also available:

```css
padding: var(--space-sm); /* 8px */
padding: var(--space-md); /* 16px */
padding: var(--space-lg); /* 24px */
```

## Border Radius

```tsx
className = "rounded-lg"; // 12px - Default for buttons, inputs
className = "rounded-xl"; // 16px - Cards, panels
className = "rounded-2xl"; // 24px - Large cards, modals
className = "rounded-full"; // Circular elements
```

## Gradients

Our design system uses a **limited, intentional gradient palette** to maintain consistency:

### Brand Gradients (Blue → Purple)

Primary brand gradients for buttons, badges, and brand elements:

```tsx
className = "bg-gradient-brand"; // Standard: blue to purple
className = "bg-gradient-brand hover:bg-gradient-brand-hover"; // With hover state
className = "bg-gradient-brand-subtle"; // 20% opacity for subtle backgrounds
className = "bg-gradient-brand-muted"; // 30% opacity for headers/footers
```

**Use for**: Primary buttons, brand badges, active state indicators, hero elements

### Neutral Gradients (Dark Surfaces)

Neutral gradients for backgrounds and surfaces:

```tsx
className = "bg-gradient-surface"; // Deep black gradient for modals
className = "bg-gradient-surface-elevated"; // Slightly lighter for cards
className = "bg-gradient-surface-subtle"; // Semi-transparent for overlays
```

**Use for**: Modal backgrounds, card surfaces, elevated panels

### Semantic Gradients

Success (Green only - no mixing):

```tsx
className = "bg-gradient-success"; // Standard green gradient
className = "bg-gradient-success-hover"; // Hover state
className = "bg-gradient-success-subtle"; // 20% opacity background
```

Warning (Amber only - no mixing):

```tsx
className = "bg-gradient-warning"; // Standard amber gradient
className = "bg-gradient-warning-hover"; // Hover state
className = "bg-gradient-warning-subtle"; // 20% opacity background
```

Error (Red only - no mixing):

```tsx
className = "bg-gradient-error"; // Standard red gradient
className = "bg-gradient-error-hover"; // Hover state
className = "bg-gradient-error-subtle"; // 20% opacity background
```

**Use for**: Status indicators, alerts, notifications, feedback messages

### ❌ What NOT to Do

Avoid creating one-off gradient combinations:

```tsx
// ❌ DON'T: Random color combinations
className = "bg-gradient-to-br from-purple-600/20 to-indigo-600/20";
className = "bg-gradient-to-r from-emerald-900/20 to-blue-900/20";
className = "bg-gradient-to-r from-red-600 to-orange-600";

// ✅ DO: Use standardized gradients
className = "bg-gradient-brand-subtle";
className = "bg-gradient-success-subtle";
className = "bg-gradient-error";
```

## Shadows

```tsx
className = "shadow-soft-sm"; // Subtle shadow
className = "shadow-soft-md"; // Medium shadow
className = "shadow-soft-lg"; // Large shadow
className = "shadow-glow"; // Blue glow effect (pairs with brand gradients)
className = "shadow-glow-purple"; // Purple glow effect
className = "shadow-glow-green"; // Green glow effect (pairs with success)
```

## Common Patterns

### Buttons

Primary action button:

```tsx
<button className="px-6 py-3 rounded-xl bg-gradient-brand hover:bg-gradient-brand-hover text-white font-medium transition-all shadow-lg hover:shadow-xl">
  Click Me
</button>
```

Secondary button:

```tsx
<button className="px-4 py-2 rounded-lg bg-neutral-700/30 border border-neutral-600/50 text-neutral-300 hover:bg-neutral-700/50 hover:border-neutral-500/70 transition-all">
  Cancel
</button>
```

Success button:

```tsx
<button className="px-4 py-2 rounded-lg bg-gradient-success hover:bg-gradient-success-hover text-white font-medium transition-all">
  Complete
</button>
```

Destructive button:

```tsx
<button className="px-4 py-2 rounded-lg bg-gradient-error hover:bg-gradient-error-hover text-white font-medium transition-all">
  Delete
</button>
```

### Cards

Standard card:

```tsx
<div className="bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6">
  {/* Card content */}
</div>
```

Elevated card with brand gradient:

```tsx
<div className="bg-gradient-brand-subtle border border-brand-primary-500/50 rounded-xl shadow-lg shadow-glow p-4">
  {/* Card content */}
</div>
```

Success notification card:

```tsx
<div className="bg-gradient-success-subtle border border-success-500/50 rounded-xl p-4">
  {/* Success message */}
</div>
```

Warning alert card:

```tsx
<div className="bg-gradient-warning-subtle border border-warning-500/50 rounded-xl p-4">
  {/* Warning message */}
</div>
```

### Inputs

Text input:

```tsx
<input
  className="w-full bg-neutral-900/50 border border-neutral-600/50 rounded-xl px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-primary-500/50"
  placeholder="Enter text..."
/>
```

Textarea:

```tsx
<textarea
  className="w-full bg-neutral-900/50 border border-neutral-600/50 rounded-xl px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-primary-500/50 resize-none"
  rows={4}
/>
```

### Modals

Modal overlay:

```tsx
<div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
```

Modal content:

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div className="bg-gradient-surface border border-neutral-700 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden">
    {/* Modal header with brand gradient */}
    <div className="p-6 border-b border-neutral-700/50 bg-gradient-brand-muted">
      <h2>Modal Title</h2>
    </div>
    {/* Modal body */}
    <div className="p-6">{/* Content */}</div>
  </div>
</div>
```

### Navigation

```tsx
<nav className="bg-neutral-900/95 backdrop-blur-xl border-b border-neutral-700/50">
  {/* Nav content */}
</nav>
```

## Transitions

Use consistent transition durations:

```tsx
className = "transition-all"; // Default (300ms)
className = "transition-colors"; // Color changes only
className = "transition-transform"; // Transform changes only
```

CSS variables:

```css
transition: all var(--transition-fast); /* 150ms */
transition: all var(--transition-base); /* 300ms */
transition: all var(--transition-slow); /* 500ms */
```

## Animations

```tsx
className = "animate-spin"; // Spinning loader
className = "animate-pulse"; // Pulsing effect
className = "animate-bounce"; // Bounce effect
className = "animate-fadeIn"; // Fade in (custom)
className = "animate-slideIn"; // Slide in (custom)
```

## Best Practices

1. **Always use design tokens** instead of arbitrary values
   - ✅ `className="text-neutral-400"`
   - ❌ `className="text-[#a1a1aa]"`

2. **Use opacity modifiers** for subtle variations
   - ✅ `className="bg-neutral-800/50"`
   - ❌ Creating new color values

3. **Leverage Tailwind's color scales**
   - Use `-400`, `-500`, `-600` for most UI elements
   - Use `-700`, `-800`, `-900` for darker backgrounds

4. **Maintain consistency**
   - Cards: `rounded-xl` or `rounded-2xl`
   - Buttons: `rounded-lg` or `rounded-xl`
   - Inputs: `rounded-xl`

5. **Use semantic colors appropriately**
   - Green for success states
   - Amber for warnings
   - Red for errors
   - Blue/Purple for brand and primary actions
