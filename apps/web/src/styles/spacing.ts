/**
 * Spacing Design Tokens
 *
 * Based on 8px grid baseline for visual harmony.
 * All spacing should use these values for consistency.
 *
 * Tailwind class mappings:
 *   1  =  4px (0.25rem) - micro
 *   2  =  8px (0.5rem)  - small
 *   4  = 16px (1rem)    - base
 *   6  = 24px (1.5rem)  - medium
 *   8  = 32px (2rem)    - large
 *   12 = 48px (3rem)    - xlarge
 *   16 = 64px (4rem)    - xxlarge
 *
 * AVOID: 3, 5, 7, 9, 10, 11 (breaks 8px rhythm)
 * EXCEPTION: 1.5 (6px) for micro-adjustments only
 */

export const spacing = {
  // Micro - icon margins, tight inline spacing
  micro: "1", // 4px

  // Small - inline spacing, compact padding
  small: "2", // 8px

  // Base - standard component padding, button padding
  base: "4", // 16px

  // Medium - section gaps, card spacing
  medium: "6", // 24px

  // Large - major section spacing
  large: "8", // 32px

  // XLarge - page-level spacing
  xlarge: "12", // 48px

  // XXLarge - hero sections
  xxlarge: "16", // 64px
} as const;

/**
 * Common spacing patterns using 8px grid
 *
 * Buttons:
 *   - Small:  px-2 py-1  (8px x 4px)
 *   - Medium: px-4 py-2  (16px x 8px)
 *   - Large:  px-6 py-2  (24px x 8px)
 *
 * Cards:
 *   - Compact: p-2      (8px all sides)
 *   - Normal:  p-4      (16px all sides)
 *   - Spacious: p-6     (24px all sides)
 *
 * Gaps:
 *   - Tight:   gap-1    (4px)
 *   - Normal:  gap-2    (8px)
 *   - Relaxed: gap-4    (16px)
 *   - Wide:    gap-6    (24px)
 *
 * Sections:
 *   - space-y-2  (8px)  - list items
 *   - space-y-4  (16px) - content blocks
 *   - space-y-6  (24px) - sections
 *   - space-y-8  (32px) - major sections
 *
 * Margins (vertical rhythm):
 *   - mb-2 (8px)  - inline elements
 *   - mb-4 (16px) - paragraphs
 *   - mb-6 (24px) - sections
 *   - mb-8 (32px) - major sections
 */

// Semantic spacing for specific use cases
export const componentSpacing = {
  // Page layout
  pageInset: "p-6", // 24px
  pageSectionGap: "space-y-8", // 32px

  // Cards
  cardPadding: "p-4", // 16px
  cardGap: "gap-4", // 16px

  // Buttons
  buttonPadding: {
    sm: "px-2 py-1",
    md: "px-4 py-2",
    lg: "px-6 py-2",
  },

  // Lists
  listGap: "gap-2", // 8px
  listItemPadding: "p-2", // 8px

  // Forms
  inputPadding: "px-4 py-2", // 16px x 8px
  formGap: "space-y-4", // 16px

  // Modal/Dialog
  modalPadding: "p-6", // 24px
  modalHeaderPadding: "px-6 py-4", // 24px x 16px

  // Sidebar
  sidebarPadding: "px-4 py-2", // 16px x 8px
  sidebarItemGap: "space-y-1", // 4px

  // Section headers
  sectionTitleMargin: "mb-4", // 16px
  sectionGap: "space-y-6", // 24px
} as const;
