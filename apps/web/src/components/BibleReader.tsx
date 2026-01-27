/* global Range, HTMLButtonElement */
import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { TextHighlightTooltip } from "./TextHighlightTooltip";
import { useBibleHighlightsContext } from "../contexts/BibleHighlightsContext";
import { ChapterFooter } from "./ChapterFooter";
import { VerseReferencesModal } from "./VerseReferencesModal";
import VerseTooltip from "./VerseTooltip";
import { BibleChapterSkeleton } from "./Skeleton";
import { useBibleScrollMemory } from "../hooks/useScrollMemory";

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
  onNavigateToChat?: (prompt: string) => void;
  onTrace?: (text: string) => void;
  pendingVerseReference?: string | null;
  onVerseNavigationComplete?: () => void;
}

const BibleReader: React.FC<BibleReaderProps> = ({
  onNavigateToChat,
  onTrace,
  pendingVerseReference,
  onVerseNavigationComplete,
}) => {
  // Restore last Bible position from localStorage
  const [selectedBook, setSelectedBook] = useState<string>(() => {
    const saved = localStorage.getItem("lastBibleBook");
    return saved || "Matthew";
  });
  const [selectedChapter, setSelectedChapter] = useState<number>(() => {
    const saved = localStorage.getItem("lastBibleChapter");
    return saved ? parseInt(saved, 10) : 1;
  });
  const [bookData, setBookData] = useState<Book | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [showBookSelector, setShowBookSelector] = useState<boolean>(false);
  const [selectedVerseForModal, setSelectedVerseForModal] = useState<{
    book: string;
    chapter: number;
    verse: number;
    position: { top: number; left: number };
  } | null>(null);
  const [selectedVerseTooltip, setSelectedVerseTooltip] = useState<{
    reference: string;
    position: { top: number; left: number };
  } | null>(null);
  const verseTooltipRef = useRef<HTMLDivElement>(null);
  const pendingNavigationRef = useRef<{
    book: string;
    chapter: number;
    verse: number;
  } | null>(null);

  const { addHighlight, getHighlightForVerse } = useBibleHighlightsContext();
  const contentTopRef = useRef<HTMLDivElement>(null);
  const bookSelectorRef = useRef<HTMLDivElement>(null);
  const selectedBookButtonRef = useRef<HTMLButtonElement>(null);

  // Scroll position memory - remembers where user was in each chapter
  const {
    scrollRef: bibleScrollRef,
    clearSavedPosition: clearBibleScroll,
    restoreNow: restoreBibleScroll,
  } = useBibleScrollMemory(selectedBook, selectedChapter);

  // Track if we need to restore scroll (ref-based to avoid re-render flash)
  const needsScrollRestore = useRef(true);
  const hasRestoredOnce = useRef(false);

  // Load book data from GitHub
  useEffect(() => {
    const loadBook = async () => {
      setLoading(true);
      needsScrollRestore.current = true; // Reset scroll flag when loading new content
      try {
        // Map display names to GitHub filenames
        // GitHub repo uses no spaces for "Song of Solomon" -> "SongofSolomon"
        const bookFileName = selectedBook.replace(/ /g, "");
        const response = await fetch(
          `https://raw.githubusercontent.com/aruljohn/Bible-kjv/master/${bookFileName}.json`,
        );
        const data = await response.json();
        setBookData(data);
      } catch {
        // TODO: Handle error more gracefully
      } finally {
        setLoading(false);
      }
    };

    loadBook();
  }, [selectedBook]);

  // Restore scroll position after content loads (useLayoutEffect runs before paint)
  useLayoutEffect(() => {
    if (!loading && bookData && bibleScrollRef.current) {
      // Restore scroll, then show
      if (needsScrollRestore.current) {
        restoreBibleScroll();
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

  // Scroll to selected book when dropdown opens
  useEffect(() => {
    if (showBookSelector && selectedBookButtonRef.current) {
      // Use setTimeout to ensure the dropdown is fully rendered
      setTimeout(() => {
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

  const handlePreviousChapter = () => {
    if (selectedChapter > 1) {
      setSelectedChapter(selectedChapter - 1);
    } else {
      // Go to previous book's last chapter
      const currentBookIndex = BIBLE_BOOKS.indexOf(selectedBook);
      if (currentBookIndex > 0) {
        setSelectedBook(BIBLE_BOOKS[currentBookIndex - 1]);
        // Will need to get last chapter of previous book
        setSelectedChapter(1); // Temporary, should be last chapter
      }
    }
  };

  const handleNextChapter = () => {
    if (bookData && selectedChapter < bookData.chapters.length) {
      setSelectedChapter(selectedChapter + 1);
    } else {
      // Go to next book's first chapter
      const currentBookIndex = BIBLE_BOOKS.indexOf(selectedBook);
      if (currentBookIndex < BIBLE_BOOKS.length - 1) {
        setSelectedBook(BIBLE_BOOKS[currentBookIndex + 1]);
        setSelectedChapter(1);
      }
    }
  };

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

    // Try multiple approaches to find the verse element
    let verseElement = null;
    let verseNum = 0;

    // Approach 1: Check start container
    const startContainer = range.startContainer;
    const startElement =
      startContainer.nodeType === window.Node.TEXT_NODE
        ? startContainer.parentElement
        : (startContainer as HTMLElement);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    verseElement = (startElement as any)?.closest?.("[data-verse]");

    // Approach 2: If not found, check end container
    if (!verseElement) {
      const endContainer = range.endContainer;
      const endElement =
        endContainer.nodeType === window.Node.TEXT_NODE
          ? endContainer.parentElement
          : (endContainer as HTMLElement);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      verseElement = (endElement as any)?.closest?.("[data-verse]");
    }

    // Approach 3: If still not found, check common ancestor
    if (!verseElement) {
      const container = range.commonAncestorContainer;
      const element =
        container.nodeType === window.Node.TEXT_NODE
          ? container.parentElement
          : (container as HTMLElement);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      verseElement = (element as any)?.closest?.("[data-verse]");
    }

    if (verseElement) {
      verseNum = parseInt(verseElement.getAttribute("data-verse") || "0");
    } else {
      return;
    }

    if (verseNum > 0) {
      addHighlight(selectedBook, selectedChapter, verseNum, text, color);
    }
  };

  const handleGoDeeper = (text: string) => {
    // Use the canonical trace handler to show map visualization
    if (onTrace) {
      onTrace(text);
    }
  };

  const handleVerseNumberClick = (
    verseNumber: number,
    event: React.MouseEvent,
  ) => {
    // Get click position for popover
    const rect = (event.target as HTMLElement).getBoundingClientRect();

    // Position below the verse number
    const spacing = 12;

    // Find the scrolling container (has overflow-y-auto class)
    const scrollContainer = (event.target as HTMLElement).closest(
      ".overflow-y-auto",
    ) as HTMLElement;

    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();

      // Calculate position relative to the scrolling container
      // rect.bottom is viewport-relative, so we subtract containerRect.top and add scrollTop
      const top =
        rect.bottom - containerRect.top + scrollContainer.scrollTop + spacing;

      // Center horizontally on the verse number, relative to container
      const left =
        rect.left -
        containerRect.left +
        scrollContainer.scrollLeft +
        rect.width / 2;

      setSelectedVerseForModal({
        book: selectedBook,
        chapter: selectedChapter,
        verse: verseNumber,
        position: {
          top,
          left,
        },
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

  const handleVerseTooltipRequest = (
    reference: string,
    position: { top: number; left: number },
  ) => {
    setSelectedVerseTooltip({ reference, position });
  };

  return (
    <div className="h-full flex flex-col bg-black">
      {/* Header with Navigation */}
      <div className="flex-shrink-0 border-b border-neutral-800/50 bg-neutral-900/50">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Book Selector */}
            <div
              className="relative"
              ref={bookSelectorRef}
              data-book-selector="true"
            >
              <button
                onClick={() => setShowBookSelector(!showBookSelector)}
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
                <div className="absolute top-full left-0 mt-2 w-80 max-h-96 overflow-y-auto bg-neutral-900 border-2 border-neutral-700 rounded-lg shadow-2xl z-[9999]">
                  <div className="p-2 pointer-events-auto">
                    <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider px-3 py-2">
                      Old Testament
                    </div>
                    {BIBLE_BOOKS.slice(0, 39).map((book) => (
                      <button
                        key={book}
                        ref={
                          selectedBook === book ? selectedBookButtonRef : null
                        }
                        type="button"
                        onMouseDown={() => {
                          setSelectedBook(book);
                          setSelectedChapter(1);
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
                    <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider px-3 py-2 mt-2">
                      New Testament
                    </div>
                    {BIBLE_BOOKS.slice(39).map((book) => (
                      <button
                        key={book}
                        ref={
                          selectedBook === book ? selectedBookButtonRef : null
                        }
                        type="button"
                        onMouseDown={() => {
                          setSelectedBook(book);
                          setSelectedChapter(1);
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
                  </div>
                </div>
              )}
            </div>

            {/* Chapter Navigation */}
            <div className="flex items-center gap-3">
              <button
                onClick={handlePreviousChapter}
                disabled={
                  selectedBook === BIBLE_BOOKS[0] && selectedChapter === 1
                }
                className="p-2 hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
                  onChange={(e) =>
                    setSelectedChapter(
                      Math.max(1, parseInt(e.target.value) || 1),
                    )
                  }
                  className="w-16 px-3 py-1 bg-neutral-800/50 border border-neutral-700/50 rounded-lg text-white text-center focus:outline-none focus:ring-2 focus:ring-brand-primary-500/50"
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
                className="p-2 hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
            </div>
          </div>
        </div>
      </div>

      {/* Bible Text Content - starts invisible, shown after scroll restore */}
      <div
        ref={bibleScrollRef}
        className="relative flex-1 overflow-y-auto"
        style={{ visibility: hasRestoredOnce.current ? "visible" : "hidden" }}
      >
        <div className="max-w-4xl mx-auto px-8 py-12">
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
                <div className="text-justify text-[#E8E8E8] text-[19px] font-sans font-normal leading-[2.4] tracking-[0.03em]">
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
                            className="text-brand-primary-400 hover:text-[#D4AF37] font-semibold text-[11px] mr-1.5 opacity-60 hover:opacity-100 cursor-pointer hover:underline transition-all"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleVerseNumberClick(parseInt(verse.verse), e);
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
                  className="group p-4 bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-700/50 rounded-full shadow-2xl transition-all disabled:opacity-30 disabled:cursor-not-allowed backdrop-blur-sm"
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
                  className="group p-4 bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-700/50 rounded-full shadow-2xl transition-all disabled:opacity-30 disabled:cursor-not-allowed backdrop-blur-sm"
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
          ) : (
            <div className="text-center py-20 text-neutral-500">
              No content available
            </div>
          )}
        </div>

        {/* Text Highlight Tooltip - inside scrolling container */}
        <TextHighlightTooltip
          onGoDeeper={handleGoDeeper}
          onHighlight={handleHighlight}
          enableHighlight={true}
          bibleContext={{
            book: selectedBook,
            chapter: selectedChapter,
            verse: 0, // Will be detected from selection by tooltip
          }}
        />

        {/* Verse References Popover - inside scrolling container */}
        {selectedVerseForModal && (
          <VerseReferencesModal
            book={selectedVerseForModal.book}
            chapter={selectedVerseForModal.chapter}
            verse={selectedVerseForModal.verse}
            position={selectedVerseForModal.position}
            onClose={() => setSelectedVerseForModal(null)}
            onRequestVerseTooltip={handleVerseTooltipRequest}
            verseTooltipRef={verseTooltipRef}
          />
        )}

        {/* Verse Tooltip - inside scrolling container */}
        {selectedVerseTooltip && (
          <VerseTooltip
            ref={verseTooltipRef}
            reference={selectedVerseTooltip.reference}
            position={selectedVerseTooltip.position}
            onClose={() => setSelectedVerseTooltip(null)}
            onTrace={handleExploreDeeper}
          />
        )}
      </div>
    </div>
  );
};

export default BibleReader;
