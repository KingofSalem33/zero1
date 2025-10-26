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

## Shadows

```tsx
className = "shadow-soft-sm"; // Subtle shadow
className = "shadow-soft-md"; // Medium shadow
className = "shadow-soft-lg"; // Large shadow
className = "shadow-glow"; // Blue glow effect
className = "shadow-glow-purple"; // Purple glow effect
```

## Common Patterns

### Buttons

Primary action button:

```tsx
<button className="px-6 py-3 rounded-xl bg-gradient-to-r from-brand-primary-600 to-brand-secondary-600 hover:from-brand-primary-500 hover:to-brand-secondary-500 text-white font-medium transition-all shadow-lg hover:shadow-xl">
  Click Me
</button>
```

Secondary button:

```tsx
<button className="px-4 py-2 rounded-lg bg-neutral-700/30 border border-neutral-600/50 text-neutral-300 hover:bg-neutral-700/50 hover:border-neutral-500/70 transition-all">
  Cancel
</button>
```

### Cards

Standard card:

```tsx
<div className="bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6">
  {/* Card content */}
</div>
```

Elevated card with glow:

```tsx
<div className="bg-gradient-to-br from-brand-primary-600/20 to-brand-secondary-600/20 border border-brand-primary-500/50 rounded-xl shadow-lg shadow-glow p-4">
  {/* Card content */}
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
  <div className="bg-neutral-800 border border-neutral-700 rounded-2xl shadow-2xl max-w-2xl w-full p-6">
    {/* Modal content */}
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
