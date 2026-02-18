import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { TextHighlightTooltip } from "./TextHighlightTooltip";
import { useBibleHighlightsContext } from "../contexts/BibleHighlightsContext";
import { ChapterFooter } from "./ChapterFooter";
import { VerseExplorationPanel } from "./VerseExplorationPanel";
import { BibleChapterSkeleton } from "./Skeleton";
import { useBibleScrollMemory } from "../hooks/useScrollMemory";
import { calcPopoverPosition } from "../utils/tooltipPosition";
import { hapticTap, hapticNav, hapticBookmark } from "../utils/haptics";
import type { VisualContextBundle } from "../types/goldenThread";
import {
  getStoredMapSession,
  MAP_SESSION_UPDATED_EVENT,
  type StoredMapSession,
} from "../utils/mapSessionStorage";
import {
  useSwipeNavigation,
  useKeyboardNavigation,
} from "../hooks/useSwipeNavigation";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { ErrorState } from "./ErrorState";
import { useHighlightShortcuts } from "../hooks/useHighlightShortcuts";
import { HighlightOnboarding } from "./HighlightOnboarding";
import { BIBLE_BOOKS, parseVerseReference } from "../utils/bibleReference";
import { getBook, isBookCached } from "../hooks/useBibleBookCache";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useReadingProgress } from "../hooks/useReadingProgress";
import { useBibleBookmarks } from "../contexts/BibleBookmarksContext";
import { BibleSearchDialog } from "./BibleSearchDialog";
import { MobileBookSelector } from "./MobileBookSelector";
import { JumpToReferenceDialog } from "./JumpToReferenceDialog";
import { useBibleNotes } from "../hooks/useBibleNotes";
import {
  useUserPreferences,
  READER_FONT_SIZES,
  type ReaderFontSize,
} from "../hooks/useUserPreferences";

// Stores last known verse count per "Book:Chapter" for skeleton accuracy
const verseCountCache = new Map<string, number>();

interface Verse {
  verse: string;
  text: string;
}

interface Chapter {
  chapter: string;
  verses: Verse[];
}

interface Book {
  book: string;
  chapters: Chapter[];
}

interface BibleReaderProps {
  book?: string;
  chapter?: number;
  onNavigate?: (book: string, chapter: number) => void;
  onNavigateToChat?: (prompt: string) => void;
  onTrace?: (text: string, anchorRef?: string) => void;
  onOpenMap?: (bundle: VisualContextBundle) => void;
  pendingVerseReference?: string | null;
  onVerseNavigationComplete?: () => void;
}

const BibleReader: React.FC<BibleReaderProps> = ({
  book: bookProp,
  chapter: chapterProp,
  onNavigate,
  onNavigateToChat,
  onTrace,
  onOpenMap,
  pendingVerseReference,
  onVerseNavigationComplete,
}) => {
  // Use URL-controlled book/chapter if provided, otherwise fall back to localStorage
  const [selectedBook, setSelectedBookInternal] = useState<string>(() => {
    if (bookProp) return bookProp;
    const saved = localStorage.getItem("lastBibleBook");
    return saved || "Matthew";
  });
  const [selectedChapter, setSelectedChapterInternal] = useState<number>(() => {
    if (chapterProp) return chapterProp;
    const saved = localStorage.getItem("lastBibleChapter");
    return saved ? parseInt(saved, 10) : 1;
  });

  // Sync with URL-controlled props when they change
  useEffect(() => {
    if (bookProp && bookProp !== selectedBook) {
      setSelectedBookInternal(bookProp);
    }
  }, [bookProp]);

  useEffect(() => {
    if (chapterProp !== undefined && chapterProp !== selectedChapter) {
      setSelectedChapterInternal(chapterProp);
    }
  }, [chapterProp]);

  const [bookData, setBookData] = useState<Book | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showBookSelector, setShowBookSelector] = useState<boolean>(false);
  const [bookFilter, setBookFilter] = useState<string>("");
  const bookFilterRef = useRef<HTMLInputElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [selectedVerseForPanel, setSelectedVerseForPanel] = useState<{
    reference: string;
    position: { top: number; left: number };
  } | null>(null);
  const [lastMapSession, setLastMapSession] = useState<StoredMapSession | null>(
    () => getStoredMapSession(),
  );
  const pendingNavigationRef = useRef<{
    book: string;
    chapter: number;
    verse: number;
  } | null>(null);

  const { addHighlight, getHighlightForVerse } = useBibleHighlightsContext();
  const {
    isBookmarked: isVerseBookmarked,
    addBookmark,
    removeBookmark,
    getBookmark,
  } = useBibleBookmarks();
  const { hasNote: verseHasNote } = useBibleNotes();
  const isOnline = useOnlineStatus();
  const { updateProgress, getLastChapter } = useReadingProgress();
  const { preferences, setReaderFontSize, addRecentBook } =
    useUserPreferences();
  const fontConfig = READER_FONT_SIZES[preferences.readerFontSize];

  const cycleFontSize = useCallback(() => {
    const order: ReaderFontSize[] = ["compact", "default", "large"];
    const currentIndex = order.indexOf(preferences.readerFontSize);
    const nextIndex = (currentIndex + 1) % order.length;
    setReaderFontSize(order[nextIndex]);
  }, [preferences.readerFontSize, setReaderFontSize]);

  // Filtered book lists for the book selector search
  const filteredOTBooks = useMemo(() => {
    const f = bookFilter.toLowerCase();
    return f
      ? BIBLE_BOOKS.slice(0, 39).filter((b) => b.toLowerCase().includes(f))
      : BIBLE_BOOKS.slice(0, 39);
  }, [bookFilter]);
  const filteredNTBooks = useMemo(() => {
    const f = bookFilter.toLowerCase();
    return f
      ? BIBLE_BOOKS.slice(39).filter((b) => b.toLowerCase().includes(f))
      : BIBLE_BOOKS.slice(39);
  }, [bookFilter]);
  const contentTopRef = useRef<HTMLDivElement>(null);
  const bookSelectorRef = useRef<HTMLDivElement>(null);
  const selectedBookButtonRef = useRef<HTMLButtonElement>(null);

  // Focus trap for book selector dropdown — handles Escape + Tab trapping
  const bookSelectorFocusTrapRef = useFocusTrap<HTMLDivElement>(
    showBookSelector,
    {
      onEscape: () => setShowBookSelector(false),
      initialFocus: "input",
    },
  );

  // Scroll position memory - remembers where user was in each chapter
  const {
    scrollRef: bibleScrollRef,
    clearSavedPosition: clearBibleScroll,
    restoreNow: restoreBibleScroll,
  } = useBibleScrollMemory(selectedBook, selectedChapter);

  // Scroll intent: 'restore' = return to saved position, 'top' = explicit nav, 'verse' = jump to verse, null = already handled
  type ScrollIntent = "restore" | "top" | "verse" | null;
  const scrollIntent = useRef<ScrollIntent>("restore");
  // Search dialog
  const [showSearch, setShowSearch] = useState(false);
  // Jump-to-reference dialog
  const [showJumpTo, setShowJumpTo] = useState(false);

  // Mobile detection for bottom sheet book selector
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 640 : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Transition state for smooth chapter changes: null = visible, "next"/"prev" = fading out with direction
  const [transitionDir, setTransitionDir] = useState<"next" | "prev" | null>(
    null,
  );

  // Load book data (uses in-memory cache to avoid re-fetching)
  useEffect(() => {
    const abortController = new AbortController();
    setLoading(true);
    setLoadError(null);
    scrollIntent.current = scrollIntent.current === "top" ? "top" : "restore";

    getBook(selectedBook, abortController.signal)
      .then((data) => {
        if (!abortController.signal.aborted) {
          setBookData(data);
          // Cache verse counts for skeleton accuracy
          for (const ch of data.chapters) {
            verseCountCache.set(`${data.book}:${ch.chapter}`, ch.verses.length);
          }
        }
      })
      .catch((err) => {
        if (
          abortController.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError")
        )
          return;
        console.error("[BibleReader] Failed to load book:", err);
        setLoadError(
          err instanceof Error
            ? err.message
            : "Could not load this book. Check your connection and try again.",
        );
        setBookData(null);
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      });

    return () => abortController.abort();
  }, [selectedBook]);

  // Restore scroll position after content loads (useLayoutEffect runs before paint)
  useLayoutEffect(() => {
    if (
      !loading &&
      bookData &&
      bibleScrollRef.current &&
      scrollIntent.current
    ) {
      const intent = scrollIntent.current;
      scrollIntent.current = null;
      if (intent === "top") {
        bibleScrollRef.current.scrollTop = 0;
      } else if (intent === "restore") {
        restoreBibleScroll();
      }
    }
  }, [loading, bookData, restoreBibleScroll, bibleScrollRef]);

  // Save Bible position to localStorage (debounced to avoid thrashing during rapid nav)
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem("lastBibleBook", selectedBook);
      localStorage.setItem("lastBibleChapter", String(selectedChapter));
    }, 300);
    return () => clearTimeout(timer);
  }, [selectedBook, selectedChapter]);

  // Track recent books + reading progress
  useEffect(() => {
    addRecentBook(selectedBook);
  }, [selectedBook]);

  useEffect(() => {
    updateProgress(selectedBook, selectedChapter);
  }, [selectedBook, selectedChapter]);

  // Show scroll-to-top button + track reading progress
  useEffect(() => {
    const el = bibleScrollRef.current;
    if (!el) return;
    let rafId = 0;
    const handleScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setShowScrollTop(el.scrollTop > el.clientHeight * 2);
        const maxScroll = el.scrollHeight - el.clientHeight;
        setScrollProgress(maxScroll > 0 ? el.scrollTop / maxScroll : 0);
      });
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
      cancelAnimationFrame(rafId);
    };
  }, [bibleScrollRef]);

  useEffect(() => {
    const refreshSession = () => {
      setLastMapSession(getStoredMapSession());
    };
    refreshSession();
    if (typeof window === "undefined") return;
    window.addEventListener(MAP_SESSION_UPDATED_EVENT, refreshSession);
    return () => {
      window.removeEventListener(MAP_SESSION_UPDATED_EVENT, refreshSession);
    };
  }, []);

  // Note: Scroll position is now handled by useBibleScrollMemory hook
  // It restores saved position per book+chapter, or stays at top for new chapters

  const currentChapter = bookData?.chapters.find(
    (ch) => ch.chapter === String(selectedChapter),
  );

  useEffect(() => {
    if (!pendingVerseReference) return;
    const parsed = parseVerseReference(pendingVerseReference);
    if (!parsed) {
      onVerseNavigationComplete?.();
      return;
    }
    pendingNavigationRef.current = parsed;
    setSelectedBookInternal(parsed.book);
    setSelectedChapterInternal(parsed.chapter);
  }, [pendingVerseReference, onVerseNavigationComplete]);

  useEffect(() => {
    const target = pendingNavigationRef.current;
    if (!target) return;
    if (selectedBook !== target.book || selectedChapter !== target.chapter) {
      return;
    }
    if (!currentChapter) {
      if (bookData) {
        pendingNavigationRef.current = null;
        onVerseNavigationComplete?.();
      }
      return;
    }

    const scrollToTarget = () => {
      // Clear saved scroll position since we're navigating to a specific verse
      clearBibleScroll();
      const verseElement = document.querySelector(
        `[data-verse="${target.verse}"]`,
      ) as HTMLElement | null;
      if (verseElement) {
        verseElement.scrollIntoView({ behavior: "smooth", block: "center" });
        // Gold pulse to draw eye to the target verse
        verseElement.classList.add("animate-verse-pulse");
        verseElement.addEventListener(
          "animationend",
          () => verseElement!.classList.remove("animate-verse-pulse"),
          { once: true },
        );
      }
      pendingNavigationRef.current = null;
      onVerseNavigationComplete?.();
    };

    if (typeof window === "undefined") {
      scrollToTarget();
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scrollToTarget);
    });
  }, [
    bookData,
    currentChapter,
    onVerseNavigationComplete,
    selectedBook,
    selectedChapter,
    clearBibleScroll,
  ]);

  // Reset filter and focus input when dropdown opens; scroll to selected book
  useEffect(() => {
    if (showBookSelector) {
      setBookFilter("");
      // Focus the search input after render
      setTimeout(() => {
        bookFilterRef.current?.focus();
        selectedBookButtonRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 0);
    }
  }, [showBookSelector]);

  // Close book selector when clicking outside
  useEffect(() => {
    if (!showBookSelector) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (
        bookSelectorRef.current &&
        !bookSelectorRef.current.contains(target)
      ) {
        setShowBookSelector(false);
      }
    };

    // Use bubble phase instead of capture
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showBookSelector]);

  // Smooth chapter navigation with directional fade transition
  const navigateWithTransition = useCallback(
    (navigate: () => void, direction: "next" | "prev") => {
      hapticNav();
      setTransitionDir(direction);
      scrollIntent.current = "top";
      // Wait for fade out, then navigate
      setTimeout(() => {
        navigate();
        if (bibleScrollRef.current) {
          bibleScrollRef.current.scrollTop = 0;
        }
        setTimeout(() => setTransitionDir(null), 50);
      }, 150);
    },
    [bibleScrollRef],
  );

  const handlePreviousChapter = useCallback(() => {
    const canGoPrev =
      selectedChapter > 1 || BIBLE_BOOKS.indexOf(selectedBook) > 0;
    if (!canGoPrev) return;

    navigateWithTransition(() => {
      if (selectedChapter > 1) {
        if (onNavigate) {
          onNavigate(selectedBook, selectedChapter - 1);
        } else {
          setSelectedChapterInternal(selectedChapter - 1);
        }
      } else {
        const currentBookIndex = BIBLE_BOOKS.indexOf(selectedBook);
        if (currentBookIndex > 0) {
          const prevBook = BIBLE_BOOKS[currentBookIndex - 1];
          if (onNavigate) {
            onNavigate(prevBook, 1);
          } else {
            setSelectedBookInternal(prevBook);
            setSelectedChapterInternal(1);
          }
        }
      }
    }, "prev");
  }, [selectedBook, selectedChapter, navigateWithTransition, onNavigate]);

  const handleNextChapter = useCallback(() => {
    const canGoNext =
      (bookData && selectedChapter < bookData.chapters.length) ||
      BIBLE_BOOKS.indexOf(selectedBook) < BIBLE_BOOKS.length - 1;
    if (!canGoNext) return;

    navigateWithTransition(() => {
      if (bookData && selectedChapter < bookData.chapters.length) {
        if (onNavigate) {
          onNavigate(selectedBook, selectedChapter + 1);
        } else {
          setSelectedChapterInternal(selectedChapter + 1);
        }
      } else {
        const currentBookIndex = BIBLE_BOOKS.indexOf(selectedBook);
        if (currentBookIndex < BIBLE_BOOKS.length - 1) {
          const nextBook = BIBLE_BOOKS[currentBookIndex + 1];
          if (onNavigate) {
            onNavigate(nextBook, 1);
          } else {
            setSelectedBookInternal(nextBook);
            setSelectedChapterInternal(1);
          }
        }
      }
    }, "next");
  }, [
    bookData,
    selectedBook,
    selectedChapter,
    navigateWithTransition,
    onNavigate,
  ]);

  // Ctrl+K to open search, Ctrl+G to jump to reference, Ctrl+B to bookmark topmost visible verse
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "g") {
        e.preventDefault();
        setShowJumpTo(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        // Find the topmost visible verse in the scroll container
        const container = bibleScrollRef.current;
        if (!container) return;
        const verseEls =
          container.querySelectorAll<HTMLElement>("[data-verse]");
        const containerRect = container.getBoundingClientRect();
        let topVerse: number | null = null;
        for (const el of verseEls) {
          const rect = el.getBoundingClientRect();
          if (
            rect.top >= containerRect.top - 20 &&
            rect.top < containerRect.bottom
          ) {
            topVerse = parseInt(el.getAttribute("data-verse") || "0");
            break;
          }
        }
        if (!topVerse || topVerse < 1) return;
        hapticBookmark();
        if (isVerseBookmarked(selectedBook, selectedChapter, topVerse)) {
          const existing = getBookmark(selectedBook, selectedChapter, topVerse);
          if (existing) removeBookmark(existing.id);
        } else {
          addBookmark(selectedBook, selectedChapter, topVerse);
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedBook,
    selectedChapter,
    bibleScrollRef,
    isVerseBookmarked,
    addBookmark,
    removeBookmark,
    getBookmark,
  ]);

  // Keyboard arrow navigation (← → for prev/next chapter)
  useKeyboardNavigation({
    onPrevious: handlePreviousChapter,
    onNext: handleNextChapter,
    enabled: !showBookSelector && !showSearch,
  });

  // Swipe navigation for mobile (swipe left = next, swipe right = prev)
  const [swipeProgress, setSwipeProgress] = useState(0);
  const swipeRef = useSwipeNavigation<HTMLDivElement>({
    onSwipeLeft: handleNextChapter,
    onSwipeRight: handlePreviousChapter,
    onSwipeProgress: setSwipeProgress,
    threshold: 80,
    maxTime: 400,
  });

  const handleHighlight = (
    text: string,
    color: string,

    context?: { range?: Range },
  ) => {
    // Use the stored range from context (preferred) or fall back to current selection
    let range = context?.range;
    if (!range) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        range = selection.getRangeAt(0);
      }
    }

    if (!range) {
      return;
    }

    // Collect all verse numbers within the selection range
    const verseNums = new Set<number>();

    // Find all [data-verse] elements that intersect the range
    const ancestor = range.commonAncestorContainer;
    const container =
      ancestor.nodeType === window.Node.TEXT_NODE
        ? ancestor.parentElement
        : (ancestor as HTMLElement);

    if (!container) return;

    // If the ancestor itself is a verse element, just use it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const directVerse = (container as any)?.closest?.("[data-verse]");
    if (directVerse) {
      const num = parseInt(directVerse.getAttribute("data-verse") || "0");
      if (num > 0) verseNums.add(num);
    }

    // Also scan all [data-verse] descendants within the range
    const allVerseEls = container.querySelectorAll("[data-verse]");
    for (const el of allVerseEls) {
      if (range.intersectsNode(el)) {
        const num = parseInt(el.getAttribute("data-verse") || "0");
        if (num > 0) verseNums.add(num);
      }
    }

    // Fallback: check start and end containers
    if (verseNums.size === 0) {
      for (const node of [range.startContainer, range.endContainer]) {
        const el =
          node.nodeType === window.Node.TEXT_NODE
            ? node.parentElement
            : (node as HTMLElement);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const verseEl = (el as any)?.closest?.("[data-verse]");
        if (verseEl) {
          const num = parseInt(verseEl.getAttribute("data-verse") || "0");
          if (num > 0) verseNums.add(num);
        }
      }
    }

    if (verseNums.size > 0) {
      const verses = [...verseNums].sort((a, b) => a - b);
      addHighlight(selectedBook, selectedChapter, verses, text, color);
    }
  };

  // Keyboard shortcuts: Ctrl+1..5 to highlight selected text
  useHighlightShortcuts({
    onHighlight: handleHighlight,
    enabled: true,
  });

  const handleGoDeeper = (text: string, anchorRef?: string) => {
    // Use the canonical trace handler to show map visualization
    if (onTrace) {
      onTrace(text, anchorRef);
    }
  };

  const handleVerseNumberClick = (
    verseNumber: number,
    event: React.MouseEvent,
  ) => {
    hapticTap();
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const scrollContainer = (event.target as HTMLElement).closest(
      ".overflow-y-auto",
    ) as HTMLElement;

    if (scrollContainer) {
      const position = calcPopoverPosition(rect, scrollContainer);
      setSelectedVerseForPanel({
        reference: `${selectedBook} ${selectedChapter}:${verseNumber}`,
        position,
      });
    }
  };

  const handleExploreDeeper = (reference: string) => {
    if (!onNavigateToChat) return;

    // Format the prompt for the referenced verse
    const prompt = `${reference}\n\nHelp me understand this passage.`;

    // Navigate to chat with this verse as context
    onNavigateToChat(prompt);
  };

  const handleOpenMapSession = useCallback(() => {
    if (!lastMapSession?.bundle || !onOpenMap) return;
    onOpenMap(lastMapSession.bundle);
  }, [lastMapSession, onOpenMap]);

  return (
    <div className="h-full flex flex-col bg-black">
      {/* Header with Navigation */}
      <div className="flex-shrink-0 border-b border-white/10 bg-neutral-900/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-2.5">
          <div className="flex items-center justify-between gap-2">
            {/* Book Selector */}
            <div
              className="relative"
              ref={bookSelectorRef}
              data-book-selector="true"
            >
              <button
                onClick={() => setShowBookSelector(!showBookSelector)}
                aria-expanded={showBookSelector}
                aria-haspopup="listbox"
                className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-neutral-800/60 rounded-lg transition-colors"
              >
                <span className="font-semibold text-white">{selectedBook}</span>
                <svg
                  className="w-3.5 h-3.5 text-neutral-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Book Selector Dropdown (desktop only — mobile uses bottom sheet) */}
              {showBookSelector && !isMobile && (
                <div
                  ref={bookSelectorFocusTrapRef}
                  role="listbox"
                  aria-label="Select a book"
                  className="absolute top-full left-0 mt-2 w-80 bg-white/[0.08] backdrop-blur-2xl border border-white/5 rounded-lg shadow-2xl z-60"
                >
                  {/* Search input */}
                  <div className="sticky top-0 p-2 bg-neutral-900/95 backdrop-blur-xl border-b border-white/5 z-10">
                    <div className="relative">
                      <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                      <input
                        ref={bookFilterRef}
                        type="text"
                        value={bookFilter}
                        onChange={(e) => setBookFilter(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setShowBookSelector(false);
                          } else if (e.key === "Enter") {
                            const allFiltered = [
                              ...filteredOTBooks,
                              ...filteredNTBooks,
                            ];
                            if (allFiltered.length === 1) {
                              const book = allFiltered[0];
                              if (onNavigate) {
                                onNavigate(book, 1);
                              } else {
                                setSelectedBookInternal(book);
                                setSelectedChapterInternal(1);
                              }
                              setShowBookSelector(false);
                            }
                          }
                        }}
                        placeholder="Search books..."
                        className="w-full pl-9 pr-3 py-2 bg-neutral-800/50 border border-neutral-700/50 rounded-md text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-brand-primary-500/50"
                      />
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto p-2 pointer-events-auto">
                    {/* Recent books section */}
                    {!bookFilter && preferences.recentBooks.length > 1 && (
                      <>
                        <div className="text-xs font-semibold text-brand-primary-400/70 uppercase tracking-wider px-3 py-2">
                          Recent
                        </div>
                        {preferences.recentBooks.map((book) => {
                          const lastCh = getLastChapter(book);
                          const resumeChapter = lastCh || 1;
                          return (
                            <button
                              key={`recent-${book}`}
                              type="button"
                              role="option"
                              aria-selected={selectedBook === book}
                              onMouseDown={() => {
                                if (onNavigate) {
                                  onNavigate(book, resumeChapter);
                                } else {
                                  setSelectedBookInternal(book);
                                  setSelectedChapterInternal(resumeChapter);
                                }
                                setShowBookSelector(false);
                              }}
                              className={`w-full text-left px-3 py-2 rounded-md transition-colors cursor-pointer flex items-center justify-between ${
                                selectedBook === book
                                  ? "bg-brand-primary-500/20 text-brand-primary-300"
                                  : "hover:bg-neutral-800 text-neutral-300"
                              }`}
                            >
                              <span>{book}</span>
                              {lastCh &&
                                lastCh > 1 &&
                                selectedBook !== book && (
                                  <span className="text-[10px] text-neutral-500">
                                    Ch. {lastCh}
                                  </span>
                                )}
                            </button>
                          );
                        })}
                        <div className="border-b border-white/5 my-2" />
                      </>
                    )}
                    {filteredOTBooks.length > 0 && (
                      <>
                        <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider px-3 py-2">
                          Old Testament
                        </div>
                        {filteredOTBooks.map((book) => {
                          const lastCh = getLastChapter(book);
                          const resumeChapter = lastCh || 1;
                          return (
                            <button
                              key={book}
                              ref={
                                selectedBook === book
                                  ? selectedBookButtonRef
                                  : null
                              }
                              type="button"
                              role="option"
                              aria-selected={selectedBook === book}
                              onMouseDown={() => {
                                if (onNavigate) {
                                  onNavigate(book, resumeChapter);
                                } else {
                                  setSelectedBookInternal(book);
                                  setSelectedChapterInternal(resumeChapter);
                                }
                                setShowBookSelector(false);
                              }}
                              className={`w-full text-left px-3 py-2 rounded-md transition-colors cursor-pointer flex items-center justify-between ${
                                selectedBook === book
                                  ? "bg-brand-primary-500/20 text-brand-primary-300"
                                  : "hover:bg-neutral-800 text-neutral-300"
                              }`}
                            >
                              <span>{book}</span>
                              {lastCh &&
                                lastCh > 1 &&
                                selectedBook !== book && (
                                  <span className="text-[10px] text-neutral-500">
                                    Ch. {lastCh}
                                  </span>
                                )}
                            </button>
                          );
                        })}
                      </>
                    )}
                    {filteredNTBooks.length > 0 && (
                      <>
                        <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider px-3 py-2 mt-2">
                          New Testament
                        </div>
                        {filteredNTBooks.map((book) => {
                          const lastCh = getLastChapter(book);
                          const resumeChapter = lastCh || 1;
                          return (
                            <button
                              key={book}
                              ref={
                                selectedBook === book
                                  ? selectedBookButtonRef
                                  : null
                              }
                              type="button"
                              role="option"
                              aria-selected={selectedBook === book}
                              onMouseDown={() => {
                                if (onNavigate) {
                                  onNavigate(book, resumeChapter);
                                } else {
                                  setSelectedBookInternal(book);
                                  setSelectedChapterInternal(resumeChapter);
                                }
                                setShowBookSelector(false);
                              }}
                              className={`w-full text-left px-3 py-2 rounded-md transition-colors cursor-pointer flex items-center justify-between ${
                                selectedBook === book
                                  ? "bg-brand-primary-500/20 text-brand-primary-300"
                                  : "hover:bg-neutral-800 text-neutral-300"
                              }`}
                            >
                              <span>{book}</span>
                              {lastCh &&
                                lastCh > 1 &&
                                selectedBook !== book && (
                                  <span className="text-[10px] text-neutral-500">
                                    Ch. {lastCh}
                                  </span>
                                )}
                            </button>
                          );
                        })}
                      </>
                    )}
                    {filteredOTBooks.length === 0 &&
                      filteredNTBooks.length === 0 && (
                        <div className="text-center py-6 text-neutral-500 text-sm">
                          No books match &ldquo;{bookFilter}&rdquo;
                        </div>
                      )}
                  </div>
                </div>
              )}
            </div>

            {/* Chapter Navigation + Actions */}
            <div className="flex items-center gap-1">
              {lastMapSession && onOpenMap && (
                <button
                  type="button"
                  onClick={handleOpenMapSession}
                  title={`Map: ${lastMapSession.anchorLabel} (${lastMapSession.verseCount} verses)`}
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 mr-1 rounded-full border border-white/10 bg-neutral-900/40 hover:bg-neutral-800/70 text-[11px] text-neutral-300 transition-colors"
                >
                  <span className="text-neutral-500">Map:</span>
                  <span className="max-w-[120px] truncate text-white font-medium">
                    {lastMapSession.anchorLabel}
                  </span>
                </button>
              )}

              <button
                onClick={handlePreviousChapter}
                disabled={
                  selectedBook === BIBLE_BOOKS[0] && selectedChapter === 1
                }
                aria-label="Previous chapter"
                className="p-1.5 hover:bg-neutral-800/60 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg
                  className="w-4 h-4 text-neutral-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>

              <div className="flex items-center gap-1.5 px-1">
                <input
                  type="number"
                  min="1"
                  max={bookData?.chapters.length || 1}
                  value={selectedChapter}
                  onChange={(e) => {
                    const newChapter = Math.max(
                      1,
                      parseInt(e.target.value) || 1,
                    );
                    if (onNavigate) {
                      onNavigate(selectedBook, newChapter);
                    } else {
                      setSelectedChapterInternal(newChapter);
                    }
                  }}
                  className="w-12 px-2 py-1 bg-neutral-800/40 border border-white/5 rounded-md text-white text-sm text-center focus:outline-none focus:border-white/20"
                />
                <span className="text-xs text-neutral-600">
                  / {bookData?.chapters.length || "..."}
                </span>
              </div>

              <button
                onClick={handleNextChapter}
                disabled={
                  selectedBook === BIBLE_BOOKS[BIBLE_BOOKS.length - 1] &&
                  selectedChapter === (bookData?.chapters.length || 1)
                }
                aria-label="Next chapter"
                className="p-1.5 hover:bg-neutral-800/60 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg
                  className="w-4 h-4 text-neutral-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>

              <div className="w-px h-4 bg-white/5 mx-1 hidden sm:block" />

              {/* Search */}
              <button
                onClick={() => setShowSearch(true)}
                className="p-1.5 hover:bg-neutral-800/60 rounded-md transition-colors text-neutral-500 hover:text-neutral-300"
                title="Search (Ctrl+K)"
                aria-label="Search the Bible (Ctrl+K)"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </button>

              {/* Font size */}
              <button
                onClick={cycleFontSize}
                className="p-1.5 hover:bg-neutral-800/60 rounded-md transition-colors text-neutral-500 hover:text-neutral-300 text-xs font-semibold"
                title={`Font size: ${preferences.readerFontSize}`}
                aria-label={`Font size: ${preferences.readerFontSize}`}
              >
                <span
                  className={
                    preferences.readerFontSize === "compact"
                      ? "text-[10px]"
                      : preferences.readerFontSize === "large"
                        ? "text-sm"
                        : "text-xs"
                  }
                >
                  A
                </span>
                <span
                  className={
                    preferences.readerFontSize === "large"
                      ? "text-[10px]"
                      : preferences.readerFontSize === "compact"
                        ? "text-sm"
                        : "text-xs"
                  }
                >
                  A
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Screen reader announcement for chapter changes */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {!loading && bookData
          ? `${selectedBook} chapter ${selectedChapter}`
          : ""}
      </div>

      {/* Offline indicator */}
      {!isOnline && (
        <div className="flex-shrink-0 px-4 py-2 bg-amber-900/30 border-b border-amber-500/20 text-center">
          <span className="text-xs text-amber-300/90">
            You&rsquo;re offline
            {isBookCached(selectedBook)
              ? ` — reading ${selectedBook} from cache`
              : " — this book may not be available"}
          </span>
        </div>
      )}

      {/* Bible Text Content - starts invisible, shown after scroll restore */}
      <div
        ref={(node) => {
          // Merge refs: bibleScrollRef for scroll memory, swipeRef for gestures
          (
            bibleScrollRef as React.MutableRefObject<HTMLDivElement | null>
          ).current = node;
          (swipeRef as React.MutableRefObject<HTMLDivElement | null>).current =
            node;
        }}
        className="relative flex-1 overflow-y-auto"
      >
        {/* Swipe edge glow indicators */}
        {swipeProgress !== 0 && (
          <div
            className="sticky top-0 left-0 right-0 h-full z-20 pointer-events-none"
            style={{ position: "absolute", inset: 0 }}
          >
            {/* Right edge glow (swiping right → previous chapter) */}
            {swipeProgress > 0 && (
              <div
                className="absolute top-0 right-0 w-12 h-full"
                style={{
                  background: `linear-gradient(to left, rgba(212,175,55,${swipeProgress * 0.25}), transparent)`,
                }}
              />
            )}
            {/* Left edge glow (swiping left → next chapter) */}
            {swipeProgress < 0 && (
              <div
                className="absolute top-0 left-0 w-12 h-full"
                style={{
                  background: `linear-gradient(to right, rgba(212,175,55,${Math.abs(swipeProgress) * 0.25}), transparent)`,
                }}
              />
            )}
          </div>
        )}

        {/* Reading progress bar */}
        <div
          className="sticky top-0 left-0 right-0 h-0.5 z-10 pointer-events-none"
          style={{
            background:
              scrollProgress > 0
                ? `linear-gradient(to right, #D4AF37 ${scrollProgress * 100}%, transparent ${scrollProgress * 100}%)`
                : "transparent",
          }}
        />
        <div
          className={`max-w-4xl mx-auto px-8 py-12 transition-all duration-150 ease-out ${
            transitionDir
              ? `opacity-0 ${transitionDir === "next" ? "-translate-x-3" : "translate-x-3"}`
              : "opacity-100 translate-x-0"
          }`}
        >
          {loading ? (
            <BibleChapterSkeleton
              bookName={selectedBook}
              chapterNumber={selectedChapter}
              verseCount={
                verseCountCache.get(`${selectedBook}:${selectedChapter}`) || 24
              }
            />
          ) : currentChapter ? (
            <div className="space-y-8" ref={contentTopRef}>
              {/* Chapter Header */}
              <div className="text-center pb-10 border-b border-brand-primary-500/20">
                <h1 className="text-5xl font-sans font-medium text-[#E8E8E8] tracking-wide mb-3 drop-shadow-sm">
                  {selectedBook}
                </h1>
                <div className="text-7xl font-sans font-light text-brand-primary-400/80 mt-4 drop-shadow-lg">
                  {selectedChapter}
                </div>
              </div>

              {/* Verses - Optimized Dark Mode Bible Format */}
              <div className="bg-gradient-to-b from-neutral-900/40 to-neutral-950/60 rounded-2xl p-12 border border-white/5 shadow-2xl">
                <div
                  className="bible-verse-text text-justify text-[#E8E8E8] font-sans font-normal tracking-[0.03em]"
                  style={{
                    fontSize: `${fontConfig.fontSize}px`,
                    lineHeight: fontConfig.lineHeight,
                  }}
                >
                  {currentChapter.verses.map((verse) => {
                    const highlight = getHighlightForVerse(
                      selectedBook,
                      selectedChapter,
                      parseInt(verse.verse),
                    );

                    // Start new paragraph every 4 verses for natural flow (simulating KJV paragraph breaks)
                    const verseNum = parseInt(verse.verse);
                    const verseHasBookmark = isVerseBookmarked(
                      selectedBook,
                      selectedChapter,
                      verseNum,
                    );
                    const verseHasNoteIndicator = verseHasNote(
                      selectedBook,
                      selectedChapter,
                      verseNum,
                    );
                    const isNewParagraph =
                      verseNum === 1 || (verseNum % 4 === 1 && verseNum > 1);
                    const isFirstVerseOfParagraph = isNewParagraph;

                    // Stagger delay: 20ms per verse, capped at 600ms
                    const staggerDelay = Math.min(verseNum * 20, 600);

                    return (
                      <span
                        key={verse.verse}
                        className="animate-verse-enter"
                        style={{ animationDelay: `${staggerDelay}ms` }}
                      >
                        {isNewParagraph && verseNum > 1 && (
                          <>
                            <br />
                            <br />
                          </>
                        )}
                        <span
                          data-verse={verse.verse}
                          className={`inline ${isFirstVerseOfParagraph ? "ml-8" : ""}`}
                        >
                          <sup
                            className="relative text-brand-primary-400 hover:text-[#D4AF37] font-semibold text-[11px] mr-1.5 opacity-75 hover:opacity-100 cursor-pointer underline decoration-[#D4AF37]/20 hover:decoration-[#D4AF37]/60 underline-offset-2 active:scale-90 transition-all before:absolute before:inset-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:w-11 before:h-11 before:content-[''] md:before:hidden"
                            data-verse-number={verse.verse}
                            role="button"
                            tabIndex={0}
                            aria-haspopup="dialog"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleVerseNumberClick(parseInt(verse.verse), e);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                handleVerseNumberClick(
                                  parseInt(verse.verse),
                                  e as unknown as React.MouseEvent,
                                );
                              }
                            }}
                            title="View cross-references"
                          >
                            {verse.verse}
                            {verseHasBookmark && (
                              <svg
                                className="inline w-2.5 h-2.5 ml-0.5 text-[#D4AF37]"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                              </svg>
                            )}
                            {verseHasNoteIndicator && (
                              <svg
                                className="inline w-2.5 h-2.5 ml-0.5 text-[#D4AF37]/70"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                strokeWidth={2.5}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            )}
                          </sup>
                          <span
                            className="hover:bg-neutral-800/30 transition-colors cursor-text px-0.5 rounded-sm"
                            style={
                              highlight
                                ? {
                                    backgroundColor: highlight.color + "30",
                                    boxShadow: `0 0 0 2px ${highlight.color}20`,
                                    borderBottom: `2px solid ${highlight.color}70`,
                                  }
                                : undefined
                            }
                          >
                            {verse.text}
                          </span>
                        </span>{" "}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Page Navigation Arrows at Bottom */}
              <div className="flex items-center justify-center gap-4 pt-12 pb-8">
                {/* Previous Chapter */}
                <button
                  onClick={handlePreviousChapter}
                  disabled={
                    selectedBook === BIBLE_BOOKS[0] && selectedChapter === 1
                  }
                  className="group p-4 bg-neutral-900/90 hover:bg-neutral-800 border border-white/10 rounded-full shadow-2xl transition-all disabled:opacity-30 disabled:cursor-not-allowed backdrop-blur-sm active:scale-95"
                  title="Previous Chapter"
                >
                  <svg
                    className="w-6 h-6 text-neutral-300 group-hover:text-white transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>

                {/* Chapter Indicator */}
                <div className="px-4 py-2 bg-neutral-900/90 border border-white/10 rounded-full backdrop-blur-sm">
                  <span className="text-sm font-medium text-neutral-300">
                    {selectedBook} {selectedChapter}
                  </span>
                </div>

                {/* Next Chapter */}
                <button
                  onClick={handleNextChapter}
                  disabled={
                    selectedBook === BIBLE_BOOKS[BIBLE_BOOKS.length - 1] &&
                    selectedChapter === (bookData?.chapters.length || 1)
                  }
                  className="group p-4 bg-neutral-900/90 hover:bg-neutral-800 border border-white/10 rounded-full shadow-2xl transition-all disabled:opacity-30 disabled:cursor-not-allowed backdrop-blur-sm active:scale-95"
                  title="Next Chapter"
                >
                  <svg
                    className="w-6 h-6 text-neutral-300 group-hover:text-white transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>

              {/* Chapter Footer - Exploration Cards */}
              <ChapterFooter
                book={selectedBook}
                chapter={selectedChapter}
                onCardTap={(prompt) => {
                  if (onNavigateToChat) {
                    onNavigateToChat(prompt);
                  }
                }}
              />
            </div>
          ) : loadError ? (
            <ErrorState
              title={`Could not load ${selectedBook}`}
              detail={loadError}
              onRetry={() => {
                setLoadError(null);
                setLoading(true);
                getBook(selectedBook)
                  .then((data) => {
                    setBookData(data);
                    setLoadError(null);
                  })
                  .catch((err) =>
                    setLoadError(
                      err instanceof Error ? err.message : String(err),
                    ),
                  )
                  .finally(() => setLoading(false));
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-6 gap-6">
              {/* Open book illustration */}
              <div className="relative">
                <svg
                  viewBox="0 0 200 140"
                  fill="none"
                  className="w-48 h-36"
                  aria-hidden="true"
                >
                  <defs>
                    <filter
                      id="book-glow"
                      x="-50%"
                      y="-50%"
                      width="200%"
                      height="200%"
                    >
                      <feGaussianBlur stdDeviation="2" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  {/* Left page */}
                  <g filter="url(#book-glow)">
                    <path
                      d="M100 30 L100 115 Q80 110 40 112 L40 28 Q80 25 100 30Z"
                      fill="#1a1a1a"
                      stroke="#3f3f3f"
                      strokeWidth="1"
                    />
                    <rect
                      x="50"
                      y="42"
                      width="40"
                      height="3"
                      rx="1"
                      fill="#525252"
                      opacity="0.4"
                    />
                    <rect
                      x="50"
                      y="52"
                      width="38"
                      height="3"
                      rx="1"
                      fill="#525252"
                      opacity="0.3"
                    />
                    <rect
                      x="50"
                      y="62"
                      width="42"
                      height="3"
                      rx="1"
                      fill="#525252"
                      opacity="0.4"
                    />
                    <rect
                      x="50"
                      y="72"
                      width="36"
                      height="3"
                      rx="1"
                      fill="#525252"
                      opacity="0.3"
                    />
                    <rect
                      x="50"
                      y="82"
                      width="40"
                      height="3"
                      rx="1"
                      fill="#525252"
                      opacity="0.25"
                    />
                    <rect
                      x="50"
                      y="92"
                      width="30"
                      height="3"
                      rx="1"
                      fill="#525252"
                      opacity="0.2"
                    />
                  </g>

                  {/* Right page */}
                  <g filter="url(#book-glow)">
                    <path
                      d="M100 30 L100 115 Q120 110 160 112 L160 28 Q120 25 100 30Z"
                      fill="#1a1a1a"
                      stroke="#C5B358"
                      strokeWidth="1.5"
                    />
                    <rect
                      x="110"
                      y="42"
                      width="40"
                      height="3"
                      rx="1"
                      fill="#525252"
                      opacity="0.4"
                    />
                    <rect
                      x="110"
                      y="52"
                      width="38"
                      height="3"
                      rx="1"
                      fill="#C5B358"
                      opacity="0.25"
                    />
                    <rect
                      x="110"
                      y="62"
                      width="42"
                      height="3"
                      rx="1"
                      fill="#525252"
                      opacity="0.3"
                    />
                    <rect
                      x="110"
                      y="72"
                      width="36"
                      height="3"
                      rx="1"
                      fill="#525252"
                      opacity="0.3"
                    />
                    <rect
                      x="110"
                      y="82"
                      width="40"
                      height="3"
                      rx="1"
                      fill="#C5B358"
                      opacity="0.2"
                    />
                    <rect
                      x="110"
                      y="92"
                      width="30"
                      height="3"
                      rx="1"
                      fill="#525252"
                      opacity="0.2"
                    />
                  </g>

                  {/* Spine highlight */}
                  <line
                    x1="100"
                    y1="28"
                    x2="100"
                    y2="115"
                    stroke="#C5B358"
                    strokeWidth="1"
                    opacity="0.4"
                  />
                </svg>
                <div
                  className="absolute inset-0 -z-10 opacity-30 blur-3xl"
                  style={{
                    background:
                      "radial-gradient(circle, #C5B358 0%, transparent 70%)",
                  }}
                />
              </div>

              <div className="text-center max-w-sm space-y-2">
                <h3 className="text-lg font-semibold text-neutral-200">
                  Select a book to begin
                </h3>
                <p className="text-sm text-neutral-400 leading-relaxed">
                  Choose a book and chapter above to start reading Scripture.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Text Highlight Tooltip - inside scrolling container */}
        <TextHighlightTooltip
          onGoDeeper={handleGoDeeper}
          onNavigateToChat={handleExploreDeeper}
          onHighlight={handleHighlight}
          enableHighlight={true}
          bibleContext={{
            book: selectedBook,
            chapter: selectedChapter,
            verse: 0, // Will be detected from selection by tooltip
          }}
        />

        {/* Verse Exploration Panel - unified cross-refs + verse view */}
        {selectedVerseForPanel && (
          <VerseExplorationPanel
            reference={selectedVerseForPanel.reference}
            position={selectedVerseForPanel.position}
            onClose={() => setSelectedVerseForPanel(null)}
            onTrace={(ref) => onTrace?.(ref)}
            onGoDeeper={handleExploreDeeper}
          />
        )}

        {/* Scroll to top FAB */}
        {showScrollTop && (
          <button
            onClick={() =>
              bibleScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
            }
            className="sticky bottom-6 ml-auto mr-6 float-right p-3 bg-neutral-900/90 backdrop-blur-xl border border-white/10 rounded-full shadow-lg text-neutral-400 hover:text-white hover:bg-neutral-700/80 transition-all z-30"
            title="Scroll to top"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 15l7-7 7 7"
              />
            </svg>
          </button>
        )}
      </div>

      {/* First-time highlight onboarding hint */}
      <HighlightOnboarding />

      {/* Mobile book selector bottom sheet */}
      {isMobile && (
        <MobileBookSelector
          isOpen={showBookSelector}
          onClose={() => setShowBookSelector(false)}
          selectedBook={selectedBook}
          selectedChapter={selectedChapter}
          recentBooks={preferences.recentBooks}
          getLastChapter={getLastChapter}
          onSelect={(book, chapter) => {
            if (onNavigate) {
              onNavigate(book, chapter);
            } else {
              setSelectedBookInternal(book);
              setSelectedChapterInternal(chapter);
            }
            setShowBookSelector(false);
          }}
        />
      )}

      {/* Jump-to-reference dialog */}
      <JumpToReferenceDialog
        isOpen={showJumpTo}
        onClose={() => setShowJumpTo(false)}
        onNavigate={(book, chapter, verse) => {
          if (onNavigate) {
            onNavigate(book, chapter);
          } else {
            setSelectedBookInternal(book);
            setSelectedChapterInternal(chapter);
          }
          if (verse) {
            pendingNavigationRef.current = { book, chapter, verse };
          }
        }}
      />

      {/* Search dialog */}
      <BibleSearchDialog
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        currentBook={selectedBook}
        onNavigate={(book, chapter, verse) => {
          if (onNavigate) {
            onNavigate(book, chapter);
          } else {
            setSelectedBookInternal(book);
            setSelectedChapterInternal(chapter);
          }
          // Set pending verse navigation after book/chapter loads
          pendingNavigationRef.current = { book, chapter, verse };
        }}
      />
    </div>
  );
};

export default BibleReader;
