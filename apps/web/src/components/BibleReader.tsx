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
import { hapticTap } from "../utils/haptics";
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

// List of all 66 books in order
const BIBLE_BOOKS = [
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
  "Joshua",
  "Judges",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Kings",
  "2 Kings",
  "1 Chronicles",
  "2 Chronicles",
  "Ezra",
  "Nehemiah",
  "Esther",
  "Job",
  "Psalms",
  "Proverbs",
  "Ecclesiastes",
  "Song of Solomon",
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
  "Matthew",
  "Mark",
  "Luke",
  "John",
  "Acts",
  "Romans",
  "1 Corinthians",
  "2 Corinthians",
  "Galatians",
  "Ephesians",
  "Philippians",
  "Colossians",
  "1 Thessalonians",
  "2 Thessalonians",
  "1 Timothy",
  "2 Timothy",
  "Titus",
  "Philemon",
  "Hebrews",
  "James",
  "1 Peter",
  "2 Peter",
  "1 John",
  "2 John",
  "3 John",
  "Jude",
  "Revelation",
];

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

  // Wrapper setters: if onNavigate is provided, use it (URL routing); otherwise set internal state
  const setSelectedBook = useCallback((book: string) => {
    setSelectedBookInternal(book);
  }, []);

  const setSelectedChapter = useCallback((chapter: number) => {
    setSelectedChapterInternal(chapter);
  }, []);
  const [bookData, setBookData] = useState<Book | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showBookSelector, setShowBookSelector] = useState<boolean>(false);
  const [bookFilter, setBookFilter] = useState<string>("");
  const bookFilterRef = useRef<HTMLInputElement>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
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

  // Track if we need to restore scroll (ref-based to avoid re-render flash)
  const needsScrollRestore = useRef(true);
  const hasRestoredOnce = useRef(false);
  // Track if we're doing explicit navigation (prev/next) vs returning to a chapter
  const isExplicitNavigation = useRef(false);

  // Fade transition state for smooth chapter changes
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Load book data from GitHub
  useEffect(() => {
    const loadBook = async () => {
      setLoading(true);
      setLoadError(null);
      needsScrollRestore.current = true;
      try {
        const bookFileName = selectedBook.replace(/ /g, "");
        const response = await fetch(
          `https://raw.githubusercontent.com/aruljohn/Bible-kjv/master/${bookFileName}.json`,
        );
        if (!response.ok) {
          throw new Error(
            `Failed to load ${selectedBook} (${response.status})`,
          );
        }
        const data = await response.json();
        setBookData(data);
      } catch (err) {
        console.error("[BibleReader] Failed to load book:", err);
        setLoadError(
          err instanceof Error
            ? err.message
            : "Could not load this book. Check your connection and try again.",
        );
        setBookData(null);
      } finally {
        setLoading(false);
      }
    };

    loadBook();
  }, [selectedBook]);

  // Restore scroll position after content loads (useLayoutEffect runs before paint)
  useLayoutEffect(() => {
    if (!loading && bookData && bibleScrollRef.current) {
      // Handle scroll positioning, then show
      if (needsScrollRestore.current) {
        if (isExplicitNavigation.current) {
          // Explicit navigation (prev/next) - go to top
          bibleScrollRef.current.scrollTop = 0;
          isExplicitNavigation.current = false;
        } else {
          // Returning to a chapter - restore saved position
          restoreBibleScroll();
        }
        needsScrollRestore.current = false;
        hasRestoredOnce.current = true;
        // Force visibility update on the DOM element directly
        bibleScrollRef.current.style.visibility = "visible";
      }
    }
  }, [loading, bookData, restoreBibleScroll, bibleScrollRef]);

  // Save Bible position to localStorage when it changes
  useEffect(() => {
    localStorage.setItem("lastBibleBook", selectedBook);
  }, [selectedBook]);

  useEffect(() => {
    localStorage.setItem("lastBibleChapter", String(selectedChapter));
  }, [selectedChapter]);

  // Show scroll-to-top button after scrolling 2 screens
  useEffect(() => {
    const el = bibleScrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      setShowScrollTop(el.scrollTop > el.clientHeight * 2);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
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

  const resolveBookName = (rawBook: string) => {
    const normalized = rawBook.trim().replace(/\s+/g, " ");
    const key = normalized.toLowerCase();
    const aliasMap: Record<string, string> = {
      psalm: "Psalms",
      psalms: "Psalms",
      "song of songs": "Song of Solomon",
      "song of solomon": "Song of Solomon",
      canticles: "Song of Solomon",
      revelations: "Revelation",
    };
    if (aliasMap[key]) return aliasMap[key];
    const direct = BIBLE_BOOKS.find((book) => book.toLowerCase() === key);
    if (direct) return direct;
    const romanKey = key
      .replace(/^i\s+/, "1 ")
      .replace(/^ii\s+/, "2 ")
      .replace(/^iii\s+/, "3 ");
    return BIBLE_BOOKS.find((book) => book.toLowerCase() === romanKey) || null;
  };

  const parseReference = (reference: string) => {
    const cleaned = reference.trim().replace(/\s+/g, " ");
    const match = cleaned.match(/^(.+?)\s+(\d+):(\d+)(?:-\d+)?$/);
    if (!match) return null;
    const bookRaw = match[1];
    const chapter = Number.parseInt(match[2], 10);
    const verse = Number.parseInt(match[3], 10);
    if (!Number.isFinite(chapter) || !Number.isFinite(verse)) return null;
    const book = resolveBookName(bookRaw);
    if (!book) return null;
    return { book, chapter, verse };
  };

  useEffect(() => {
    if (!pendingVerseReference) return;
    const parsed = parseReference(pendingVerseReference);
    if (!parsed) {
      onVerseNavigationComplete?.();
      return;
    }
    pendingNavigationRef.current = parsed;
    setSelectedBook(parsed.book);
    setSelectedChapter(parsed.chapter);
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

  // Smooth chapter navigation with fade transition
  const navigateWithTransition = useCallback(
    (navigate: () => void) => {
      setIsTransitioning(true);
      // Mark as explicit navigation so we scroll to top instead of restoring
      isExplicitNavigation.current = true;
      // Wait for fade out, then navigate
      setTimeout(() => {
        navigate();
        // Scroll to top immediately after navigation
        if (bibleScrollRef.current) {
          bibleScrollRef.current.scrollTop = 0;
        }
        // Fade back in after a brief moment
        setTimeout(() => setIsTransitioning(false), 50);
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
          setSelectedChapter(selectedChapter - 1);
        }
      } else {
        const currentBookIndex = BIBLE_BOOKS.indexOf(selectedBook);
        if (currentBookIndex > 0) {
          const prevBook = BIBLE_BOOKS[currentBookIndex - 1];
          if (onNavigate) {
            onNavigate(prevBook, 1);
          } else {
            setSelectedBook(prevBook);
            setSelectedChapter(1);
          }
        }
      }
    });
  }, [
    selectedBook,
    selectedChapter,
    navigateWithTransition,
    onNavigate,
    setSelectedBook,
    setSelectedChapter,
  ]);

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
          setSelectedChapter(selectedChapter + 1);
        }
      } else {
        const currentBookIndex = BIBLE_BOOKS.indexOf(selectedBook);
        if (currentBookIndex < BIBLE_BOOKS.length - 1) {
          const nextBook = BIBLE_BOOKS[currentBookIndex + 1];
          if (onNavigate) {
            onNavigate(nextBook, 1);
          } else {
            setSelectedBook(nextBook);
            setSelectedChapter(1);
          }
        }
      }
    });
  }, [
    bookData,
    selectedBook,
    selectedChapter,
    navigateWithTransition,
    onNavigate,
    setSelectedBook,
    setSelectedChapter,
  ]);

  // Keyboard arrow navigation (← → for prev/next chapter)
  useKeyboardNavigation({
    onPrevious: handlePreviousChapter,
    onNext: handleNextChapter,
    enabled: !showBookSelector, // Disable when book selector is open
  });

  // Swipe navigation for mobile (swipe left = next, swipe right = prev)
  const swipeRef = useSwipeNavigation<HTMLDivElement>({
    onSwipeLeft: handleNextChapter,
    onSwipeRight: handlePreviousChapter,
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
      <div className="flex-shrink-0 border-b border-neutral-800/50 bg-neutral-900/50">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
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
                className="flex items-center gap-2 px-4 py-2 bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-700/50 rounded-lg transition-colors"
              >
                <svg
                  className="w-5 h-5 text-brand-primary-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
                <span className="font-semibold text-white">{selectedBook}</span>
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
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Book Selector Dropdown */}
              {showBookSelector && (
                <div
                  ref={bookSelectorFocusTrapRef}
                  role="listbox"
                  aria-label="Select a book"
                  className="absolute top-full left-0 mt-2 w-80 bg-white/[0.08] backdrop-blur-2xl border border-white/5 rounded-lg shadow-2xl z-40"
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
                                setSelectedBook(book);
                                setSelectedChapter(1);
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
                    {filteredOTBooks.length > 0 && (
                      <>
                        <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider px-3 py-2">
                          Old Testament
                        </div>
                        {filteredOTBooks.map((book) => (
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
                                onNavigate(book, 1);
                              } else {
                                setSelectedBook(book);
                                setSelectedChapter(1);
                              }
                              setShowBookSelector(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-md transition-colors cursor-pointer ${
                              selectedBook === book
                                ? "bg-brand-primary-500/20 text-brand-primary-300"
                                : "hover:bg-neutral-800 text-neutral-300"
                            }`}
                          >
                            {book}
                          </button>
                        ))}
                      </>
                    )}
                    {filteredNTBooks.length > 0 && (
                      <>
                        <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider px-3 py-2 mt-2">
                          New Testament
                        </div>
                        {filteredNTBooks.map((book) => (
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
                                onNavigate(book, 1);
                              } else {
                                setSelectedBook(book);
                                setSelectedChapter(1);
                              }
                              setShowBookSelector(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-md transition-colors cursor-pointer ${
                              selectedBook === book
                                ? "bg-brand-primary-500/20 text-brand-primary-300"
                                : "hover:bg-neutral-800 text-neutral-300"
                            }`}
                          >
                            {book}
                          </button>
                        ))}
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

            {/* Chapter Navigation */}
            <div className="flex flex-wrap items-center justify-end gap-3">
              {lastMapSession && onOpenMap && (
                <button
                  type="button"
                  onClick={handleOpenMapSession}
                  title={`Map: ${lastMapSession.anchorLabel} (${lastMapSession.verseCount} verses)`}
                  className="group flex items-center gap-2 px-3 py-1.5 rounded-full border border-neutral-700/60 bg-neutral-900/40 hover:bg-neutral-800/70 text-[11px] text-neutral-200 transition-all shadow-sm"
                >
                  <svg
                    className="w-3.5 h-3.5 text-neutral-300 group-hover:text-white transition-colors"
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
                  <span className="text-neutral-400">Map:</span>
                  <span className="max-w-[160px] truncate text-white font-semibold">
                    {lastMapSession.anchorLabel}
                  </span>
                  <span className="text-neutral-400">
                    ({lastMapSession.verseCount} verses)
                  </span>
                </button>
              )}
              <button
                onClick={handlePreviousChapter}
                disabled={
                  selectedBook === BIBLE_BOOKS[0] && selectedChapter === 1
                }
                className="p-2 hover:bg-neutral-800 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
              >
                <svg
                  className="w-5 h-5 text-neutral-300"
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

              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-400">Chapter</span>
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
                      setSelectedChapter(newChapter);
                    }
                  }}
                  className="w-16 px-3 py-1 bg-neutral-800/50 border border-neutral-700/50 rounded-lg text-white text-center input-glow input-depth"
                />
                <span className="text-sm text-neutral-500">
                  of {bookData?.chapters.length || "..."}
                </span>
              </div>

              <button
                onClick={handleNextChapter}
                disabled={
                  selectedBook === BIBLE_BOOKS[BIBLE_BOOKS.length - 1] &&
                  selectedChapter === (bookData?.chapters.length || 1)
                }
                className="p-2 hover:bg-neutral-800 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
              >
                <svg
                  className="w-5 h-5 text-neutral-300"
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

              {/* Keyboard shortcuts hint */}
              <div className="relative hidden md:block">
                <button
                  onClick={() => setShowShortcuts((s) => !s)}
                  className="p-2 hover:bg-neutral-800 rounded-lg transition-all text-neutral-500 hover:text-neutral-300"
                  title="Keyboard shortcuts"
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
                      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </button>
                {showShortcuts && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowShortcuts(false)}
                    />
                    <div className="absolute top-full right-0 mt-2 w-56 bg-white/[0.08] backdrop-blur-2xl border border-white/5 rounded-lg shadow-2xl p-4 z-40">
                      <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                        Keyboard Shortcuts
                      </h4>
                      <div className="space-y-2">
                        {[
                          ["←  →", "Previous / Next chapter"],
                          ["Esc", "Close popups"],
                          ["Enter", "Select book (when filtered to one)"],
                        ].map(([key, desc]) => (
                          <div key={key} className="flex items-center gap-3">
                            <kbd className="px-1.5 py-0.5 bg-neutral-800 border border-neutral-700 rounded text-[10px] font-mono text-neutral-300 min-w-[2.5rem] text-center">
                              {key}
                            </kbd>
                            <span className="text-xs text-neutral-400">
                              {desc}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

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
        style={{ visibility: hasRestoredOnce.current ? "visible" : "hidden" }}
      >
        <div
          className={`max-w-4xl mx-auto px-8 py-12 transition-opacity duration-150 ${
            isTransitioning ? "opacity-0" : "opacity-100"
          }`}
        >
          {loading ? (
            <BibleChapterSkeleton
              bookName={selectedBook}
              chapterNumber={selectedChapter}
              verseCount={24}
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
              <div className="bg-gradient-to-b from-neutral-900/40 to-neutral-950/60 rounded-2xl p-12 border border-neutral-800/30 shadow-2xl">
                <div className="bible-verse-text text-justify text-[#E8E8E8] text-[19px] font-sans font-normal leading-[2.4] tracking-[0.03em]">
                  {currentChapter.verses.map((verse) => {
                    const highlight = getHighlightForVerse(
                      selectedBook,
                      selectedChapter,
                      parseInt(verse.verse),
                    );

                    // Start new paragraph every 4 verses for natural flow (simulating KJV paragraph breaks)
                    const verseNum = parseInt(verse.verse);
                    const isNewParagraph =
                      verseNum === 1 || (verseNum % 4 === 1 && verseNum > 1);
                    const isFirstVerseOfParagraph = isNewParagraph;

                    return (
                      <span key={verse.verse}>
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
                  className="group p-4 bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-700/50 rounded-full shadow-2xl transition-all disabled:opacity-30 disabled:cursor-not-allowed backdrop-blur-sm active:scale-95"
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
                <div className="px-4 py-2 bg-neutral-900/90 border border-neutral-700/50 rounded-full backdrop-blur-sm">
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
                  className="group p-4 bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-700/50 rounded-full shadow-2xl transition-all disabled:opacity-30 disabled:cursor-not-allowed backdrop-blur-sm active:scale-95"
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
                const bookFileName = selectedBook.replace(/ /g, "");
                fetch(
                  `https://raw.githubusercontent.com/aruljohn/Bible-kjv/master/${bookFileName}.json`,
                )
                  .then((res) => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                  })
                  .then((data) => {
                    setBookData(data);
                    setLoadError(null);
                  })
                  .catch((err) => setLoadError(err.message))
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
    </div>
  );
};

export default BibleReader;
