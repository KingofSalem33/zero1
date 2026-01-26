export const VERSE_NAV_EVENT = "bible:navigate-verse";

type VerseNavigationDetail = {
  reference: string;
};

export const dispatchVerseNavigation = (reference: string) => {
  if (typeof window === "undefined") return;
  const event = new window.CustomEvent(VERSE_NAV_EVENT, {
    detail: { reference } as VerseNavigationDetail,
  });
  window.dispatchEvent(event);
};

export const addVerseNavigationListener = (
  handler: (reference: string) => void,
) => {
  if (typeof window === "undefined") return () => undefined;

  const listener = (event: Event) => {
    const customEvent = event as { detail?: VerseNavigationDetail };
    const reference = customEvent.detail?.reference;
    if (!reference) return;
    handler(reference);
  };

  window.addEventListener(VERSE_NAV_EVENT, listener);

  return () => window.removeEventListener(VERSE_NAV_EVENT, listener);
};
