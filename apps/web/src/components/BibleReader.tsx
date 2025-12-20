/* global Range, HTMLElement */
import React, { useState, useEffect, useRef } from "react";
import { TextHighlightTooltip } from "./TextHighlightTooltip";
import { useBibleHighlightsContext } from "../contexts/BibleHighlightsContext";
import { ChapterFooter } from "./ChapterFooter";

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
}

const BibleReader: React.FC<BibleReaderProps> = ({ onNavigateToChat }) => {
  const [selectedBook, setSelectedBook] = useState<string>("John");
  const [selectedChapter, setSelectedChapter] = useState<number>(1);
  const [bookData, setBookData] = useState<Book | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [showBookSelector, setShowBookSelector] = useState<boolean>(false);

  const { addHighlight, getHighlightForVerse } = useBibleHighlightsContext();
  const contentTopRef = useRef<HTMLDivElement>(null);

  // Load book data from GitHub
  useEffect(() => {
    const loadBook = async () => {
      setLoading(true);
      try {
        const bookFileName = selectedBook.replace(/ /g, "%20");
        const response = await fetch(
          `https://raw.githubusercontent.com/aruljohn/Bible-kjv/master/${bookFileName}.json`,
        );
        const data = await response.json();
        setBookData(data);
      } catch (error) {
        console.error("Failed to load book:", error);
      } finally {
        setLoading(false);
      }
    };

    loadBook();
  }, [selectedBook]);

  // Scroll to top when chapter changes
  useEffect(() => {
    if (contentTopRef.current) {
      contentTopRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [selectedBook, selectedChapter]);

  const currentChapter = bookData?.chapters.find(
    (ch) => ch.chapter === String(selectedChapter),
  );

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
    console.log("[BibleReader] handleHighlight called", {
      text: text.substring(0, 50) + "...",
      color,
      selectedBook,
      selectedChapter,
      hasContext: !!context,
      hasRange: !!context?.range,
    });

    // Use the stored range from context (preferred) or fall back to current selection
    let range = context?.range;
    if (!range) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        range = selection.getRangeAt(0);

        console.log("[BibleReader] Using current selection as fallback");
      }
    }

    if (!range) {
      console.error("[BibleReader] No range available");
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

    console.log("[BibleReader] Found verse element:", verseElement);

    if (verseElement) {
      verseNum = parseInt(verseElement.getAttribute("data-verse") || "0");

      console.log("[BibleReader] Verse number:", verseNum);
    } else {
      console.error("[BibleReader] Could not find verse element");
      return;
    }

    if (verseNum > 0) {
      console.log("[BibleReader] Saving highlight:", {
        book: selectedBook,
        chapter: selectedChapter,
        verse: verseNum,
        color,
      });

      addHighlight(selectedBook, selectedChapter, verseNum, text, color);

      console.log("[BibleReader] ✅ Highlight saved successfully!");
    } else {
      console.error("[BibleReader] Invalid verse number:", verseNum);
    }
  };

  const handleGoDeeper = (text: string) => {
    // For Bible mode, we could open chat with this verse as context
    // TODO: Implement chat integration
    void text;
  };

  return (
    <div className="h-full flex flex-col bg-black">
      {/* Header with Navigation */}
      <div className="flex-shrink-0 border-b border-neutral-800/50 bg-neutral-900/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Book Selector */}
            <div className="relative">
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
                <div className="absolute top-full left-0 mt-2 w-80 max-h-96 overflow-y-auto bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl z-50">
                  <div className="p-2">
                    <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider px-3 py-2">
                      Old Testament
                    </div>
                    {BIBLE_BOOKS.slice(0, 39).map((book) => (
                      <button
                        key={book}
                        onClick={() => {
                          setSelectedBook(book);
                          setSelectedChapter(1);
                          setShowBookSelector(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
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
                        onClick={() => {
                          setSelectedBook(book);
                          setSelectedChapter(1);
                          setShowBookSelector(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
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

      {/* Bible Text Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-12">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-neutral-700 border-t-brand-primary-500 rounded-full animate-spin" />
            </div>
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
                          <sup className="text-brand-primary-400 font-semibold text-[11px] mr-1.5 opacity-60">
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
      </div>
    </div>
  );
};

export default BibleReader;
