# Modal & Toast System

## Overview

Cohesive modal and toast system with focus trapping, timing controls, and OS-like transitions.

## Components

### Modal Component

**Features:**

- ✅ Focus trapping (Tab navigation cycles within modal)
- ✅ Escape key to close (configurable)
- ✅ Overlay click to close (configurable)
- ✅ Restores focus to previous element on close
- ✅ Prevents body scroll when open
- ✅ Smooth entrance animations (200ms fade + 300ms slide-up)
- ✅ Proper ARIA attributes for accessibility

**Usage:**

```tsx
import { Modal, ModalHeader, ModalBody, ModalFooter } from "./components/Modal";

<Modal isOpen={isOpen} onClose={handleClose} size="lg">
  <ModalHeader
    title="Modal Title"
    subtitle="Optional subtitle"
    onClose={handleClose}
  />
  <ModalBody>{/* Your content here */}</ModalBody>
  <ModalFooter>
    <button className="btn-ghost" onClick={handleClose}>
      Cancel
    </button>
    <button className="btn-primary" onClick={handleSubmit}>
      Confirm
    </button>
  </ModalFooter>
</Modal>;
```

**Sizes:**

- `sm`: 448px max width
- `md`: 672px max width
- `lg`: 768px max width (default)
- `xl`: 1024px max width

**Animations:**

- **Backdrop:** 200ms fade-in
- **Modal:** 300ms slide-up with scale (cubic-bezier easing)
- **Exit:** Smooth 200ms fade-out

### Toast Component

**Features:**

- ✅ Auto-dismiss with configurable duration
- ✅ Manual dismiss option (duration=0)
- ✅ Entrance/exit animations
- ✅ Multiple toast types (info, success, warning, error)
- ✅ Stackable toasts with positioning

**Usage:**

```tsx
import { Toast } from "./components/Toast";

// Auto-dismiss after 4 seconds (default)
<Toast message="Project created successfully!" type="success" />

// Permanent toast (requires manual dismiss)
<Toast
  message="Processing..."
  type="info"
  duration={0}
  onClose={handleClose}
/>

// Custom duration
<Toast message="Quick message" duration={2000} />
```

**Toast Types:**

- `info`: Blue gradient (default)
- `success`: Green gradient
- `warning`: Amber gradient
- `error`: Red gradient

**Timing:**

- Default duration: 4000ms (4 seconds)
- duration=0: Permanent (shows close button)
- Entrance animation: 200ms
- Exit animation: 200ms

## Design Philosophy

### OS-like Feel

1. **Consistent Transitions** - All modals/toasts use the same timing
2. **Focus Management** - Keyboard users can navigate naturally
3. **Escape Hatch** - Escape key always works
4. **Visual Hierarchy** - Backdrop blur creates clear foreground/background separation

### Timing Standards

- **Quick:** 200ms (fades, micro-interactions)
- **Standard:** 300ms (modal entrance, slide-ups)
- **Toast Duration:** 4000ms (readable without rush)

### Accessibility

- Focus trapped within modals
- ARIA roles and attributes
- Keyboard navigation (Tab, Shift+Tab, Escape)
- Focus restoration on close
- Proper z-index stacking

## Migration Guide

### Before (Old Modal)

```tsx
<div className="fixed inset-0 bg-black/50 ...">
  <div className="bg-gray-900 ...">{/* Content */}</div>
</div>
```

### After (New Modal)

```tsx
<Modal isOpen={isOpen} onClose={onClose}>
  <ModalHeader title="Title" onClose={onClose} />
  <ModalBody>{/* Content */}</ModalBody>
</Modal>
```

### Benefits

- ✅ Focus trapping built-in
- ✅ Consistent animations
- ✅ Keyboard navigation
- ✅ Less boilerplate
- ✅ Responsive sizing
- ✅ Accessibility by default

## Implementation Details

### Focus Trap Algorithm

1. On mount: Store currently focused element
2. Focus modal container
3. Listen for Tab key
4. Cycle focus within focusable elements
5. On unmount: Restore previous focus

### Body Scroll Prevention

```tsx
useEffect(() => {
  if (isOpen) {
    document.body.style.overflow = "hidden";
  }
  return () => {
    document.body.style.overflow = "";
  };
}, [isOpen]);
```

### Animation Keyframes

```css
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
```

## Best Practices

### Do

- ✅ Use Modal component for all dialogs
- ✅ Set appropriate size prop
- ✅ Use semantic toast types
- ✅ Keep toast messages concise
- ✅ Use permanent toasts for actions requiring acknowledgment

### Don't

- ❌ Don't nest modals (use separate states)
- ❌ Don't disable focus trapping unless necessary
- ❌ Don't use overly long toast durations
- ❌ Don't create custom modal animations
- ❌ Don't skip ModalHeader (for consistency)

## Examples

### Confirmation Dialog

```tsx
<Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)} size="sm">
  <ModalHeader title="Confirm Delete" onClose={() => setShowConfirm(false)} />
  <ModalBody>
    <p>
      Are you sure you want to delete this item? This action cannot be undone.
    </p>
  </ModalBody>
  <ModalFooter>
    <button className="btn-ghost" onClick={() => setShowConfirm(false)}>
      Cancel
    </button>
    <button className="btn-error" onClick={handleDelete}>
      Delete
    </button>
  </ModalFooter>
</Modal>
```

### Success Toast

```tsx
{
  showSuccess && (
    <Toast
      message="✅ Project created successfully!"
      type="success"
      duration={3000}
      onClose={() => setShowSuccess(false)}
    />
  );
}
```

### Loading Toast (Permanent)

```tsx
{
  isLoading && (
    <Toast
      message="⏳ Processing your request..."
      type="info"
      duration={0}
      onClose={() => {}}
    />
  );
}
```
