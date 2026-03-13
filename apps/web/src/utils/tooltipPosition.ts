/**
 * Calculate popover position relative to a scroll container.
 *
 * Converts viewport-relative coordinates (from getBoundingClientRect)
 * into scroll-container-relative coordinates suitable for `position: absolute`.
 */
export function calcPopoverPosition(
  targetRect: { bottom: number; left: number; width: number },
  scrollContainer: HTMLElement,
  options?: { spacing?: number },
): { top: number; left: number } {
  const spacing = options?.spacing ?? 12;
  const containerRect = scrollContainer.getBoundingClientRect();

  const top =
    targetRect.bottom - containerRect.top + scrollContainer.scrollTop + spacing;

  const left =
    targetRect.left -
    containerRect.left +
    scrollContainer.scrollLeft +
    targetRect.width / 2;

  return { top, left };
}
