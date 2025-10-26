# Button System Reference

## Overview

Unified button treatments to reduce cognitive load and maintain visual consistency across the application.

## Button Classes

### Primary CTA (`.btn-primary`)

**Use for:** Main call-to-action, most important action on screen
**Style:** Blue-to-purple gradient with shadow
**Examples:**

- "Start Building" (initial project creation)
- "Ask AI" (main workshop action)
- Send message button

```tsx
<button className="btn-primary">Start Building</button>
```

### Secondary (`.btn-secondary`)

**Use for:** Standard actions, secondary importance
**Style:** Neutral with border
**Examples:**

- "Inspire Me"
- "New Workspace"
- Form submit buttons

```tsx
<button className="btn-secondary">New Workspace</button>
```

### Ghost (`.btn-ghost`)

**Use for:** Tertiary actions, minimal emphasis
**Style:** Transparent background, subtle hover
**Examples:**

- Quick action suggestions
- "Keep Working" (dismiss actions)
- Navigation items
- Icon-only utility buttons

```tsx
<button className="btn-ghost">Keep Working</button>
```

### Success (`.btn-success`)

**Use for:** Completion confirmations, positive actions
**Style:** Green with border
**Examples:**

- "Mark Complete & Continue"
- Approval actions

```tsx
<button className="btn-success">Mark Complete & Continue</button>
```

### Error/Danger (`.btn-error`)

**Use for:** Destructive actions, warnings
**Style:** Red with border
**Examples:**

- Delete actions
- Cancel/abort operations

```tsx
<button className="btn-error">Delete Project</button>
```

## Icon Buttons

### Primary Icon (`.btn-icon-primary`)

**Use for:** Main action icons

```tsx
<button className="btn-icon-primary">
  <SendIcon />
</button>
```

### Secondary Icon (`.btn-icon-secondary`)

**Use for:** Standard icon actions

```tsx
<button className="btn-icon-secondary">
  <CopyIcon />
</button>
```

### Ghost Icon (`.btn-icon-ghost`)

**Use for:** Utility icons, minimal actions

```tsx
<button className="btn-icon-ghost">
  <MoreIcon />
</button>
```

## Usage Guidelines

### Hierarchy

1. **One primary per view** - Only the most important action should use `.btn-primary`
2. **Secondary for standard actions** - Most buttons should use `.btn-secondary`
3. **Ghost for tertiary** - Low-emphasis actions use `.btn-ghost`
4. **Semantic colors sparingly** - Reserve `.btn-success` and `.btn-error` for clear success/error states

### Consistency Rules

- **Loading states:** Use spinner with `border-current` for secondary, `border-white` for primary
- **Disabled states:** Automatically handled by button classes
- **Icon spacing:** Use `gap-2` for icon + text combinations
- **Full width:** Add `w-full` when needed
- **Flex layouts:** Add `flex-1` for flex-based sizing

### Examples

#### Primary action with loading state

```tsx
<button className="btn-primary" disabled={loading}>
  {loading ? (
    <>
      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
      <span>Processing...</span>
    </>
  ) : (
    "Submit"
  )}
</button>
```

#### Icon button with conditional state

```tsx
<button
  className={`btn-icon ${completed ? "bg-green-600" : ""}`}
  disabled={completed}
>
  {completed ? <CheckIcon /> : null}
</button>
```

#### Ghost button with left alignment

```tsx
<button className="btn-ghost text-left justify-start">
  <span>💡</span>
  <span>Suggestion text</span>
</button>
```

## Migration Checklist

When updating existing buttons:

1. ✅ Replace gradient classes with `.btn-primary`
2. ✅ Replace neutral backgrounds with `.btn-secondary` or `.btn-ghost`
3. ✅ Replace green/success with `.btn-success`
4. ✅ Replace red/error with `.btn-error`
5. ✅ Replace icon button classes with `.btn-icon-*`
6. ✅ Remove redundant transition/hover classes (handled by button class)
7. ✅ Keep custom sizing modifiers (w-full, flex-1, etc.)

## Don'ts

- ❌ Don't mix gradient styles - use `.btn-primary` exclusively
- ❌ Don't create custom button variants - use existing classes
- ❌ Don't use `.btn-success` for general CTAs - reserve for confirmations
- ❌ Don't use multiple primary buttons in same view
- ❌ Don't remove focus states - they're built into classes
