import React, { useState, useEffect, useRef } from "react";
import { TextHighlightTooltip } from "./TextHighlightTooltip";
import { useBibleHighlights } from "../hooks/useBibleHighlights";
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
  const [showHighlights, setShowHighlights] = useState<boolean>(false);

  const {
    highlights,
    addHighlight,
    getHighlightForVerse,
    removeHighlight,
    clearAllHighlights,
  } = useBibleHighlights();
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

  const handleHighlight = (text: string, color: string) => {
    // Extract verse number from selected text
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const element =
        container.nodeType === window.Node.TEXT_NODE
          ? container.parentElement
          : container;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const verseElement = (element as any)?.closest?.("[data-verse]");

      if (verseElement) {
        const verseNum = parseInt(
          verseElement.getAttribute("data-verse") || "0",
        );
        if (verseNum > 0) {
          addHighlight(selectedBook, selectedChapter, verseNum, text, color);
        }
      }
    }
  };

  const handleGoDeeper = (text: string) => {
    // For Bible mode, we could open chat with this verse as context
    // TODO: Implement chat integration
    void text;
  };

  const handleJumpToHighlight = (book: string, chapter: number) => {
    setSelectedBook(book);
    setSelectedChapter(chapter);
    setShowHighlights(false);
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-gray-950 via-black to-gray-950">
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

            {/* Highlights Button */}
            <button
              onClick={() => setShowHighlights(!showHighlights)}
              className="relative flex items-center gap-2 px-4 py-2 bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-700/50 rounded-lg transition-colors"
              title="View Highlights"
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
                  d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                />
              </svg>
              {highlights.length > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-brand-primary-500 text-white text-xs font-semibold rounded-full">
                  {highlights.length}
                </span>
              )}
            </button>
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
      </div>

      {/* Text Highlight Tooltip */}
      <TextHighlightTooltip
        onGoDeeper={handleGoDeeper}
        onHighlight={handleHighlight}
        enableHighlight={true}
      />

      {/* Highlights Panel */}
      {showHighlights && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center pt-20">
          <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl max-h-[80vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700/50">
              <div className="flex items-center gap-3">
                <svg
                  className="w-6 h-6 text-brand-primary-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                  />
                </svg>
                <h2 className="text-xl font-semibold text-white">
                  Your Highlights
                </h2>
                <span className="px-2 py-1 bg-neutral-800 text-neutral-400 text-sm rounded-md">
                  {highlights.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {highlights.length > 0 && (
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          "Are you sure you want to clear all highlights?",
                        )
                      ) {
                        clearAllHighlights();
                      }
                    }}
                    className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-md transition-colors"
                  >
                    Clear All
                  </button>
                )}
                <button
                  onClick={() => setShowHighlights(false)}
                  className="text-neutral-400 hover:text-white transition-colors p-1.5 hover:bg-neutral-700/30 rounded"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Highlights List */}
            <div className="flex-1 overflow-y-auto p-4">
              {highlights.length === 0 ? (
                <div className="text-center py-12">
                  <svg
                    className="w-16 h-16 text-neutral-700 mx-auto mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                    />
                  </svg>
                  <p className="text-neutral-500 text-lg mb-2">
                    No highlights yet
                  </p>
                  <p className="text-neutral-600 text-sm">
                    Select text in the Bible and click the highlighter to create
                    your first highlight
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {highlights
                    .sort(
                      (a, b) =>
                        new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime(),
                    )
                    .map((highlight) => (
                      <div
                        key={highlight.id}
                        className="group bg-neutral-800/50 border border-neutral-700/50 rounded-lg p-4 hover:bg-neutral-800/70 transition-all"
                      >
                        <div className="flex items-start gap-3">
                          {/* Color Indicator */}
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0 mt-1.5"
                            style={{ backgroundColor: highlight.color }}
                          />

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            {/* Reference */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <button
                                onClick={() =>
                                  handleJumpToHighlight(
                                    highlight.book,
                                    highlight.chapter,
                                  )
                                }
                                className="text-brand-primary-400 hover:text-brand-primary-300 font-medium text-sm flex items-center gap-1 transition-colors"
                              >
                                {highlight.book} {highlight.chapter}:
                                {highlight.verse}
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
                                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                                  />
                                </svg>
                              </button>
                              <span className="text-xs text-neutral-600">
                                {new Date(
                                  highlight.createdAt,
                                ).toLocaleDateString()}
                              </span>
                            </div>

                            {/* Highlighted Text */}
                            <p
                              className="text-neutral-300 text-sm leading-relaxed mb-2 px-2 py-1 rounded"
                              style={{
                                backgroundColor: highlight.color + "30",
                                borderLeft: `3px solid ${highlight.color}`,
                              }}
                            >
                              {highlight.text}
                            </p>
                          </div>

                          {/* Delete Button */}
                          <button
                            onClick={() => removeHighlight(highlight.id)}
                            className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 transition-all p-1.5 hover:bg-red-500/10 rounded flex-shrink-0"
                            title="Delete highlight"
                          >
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BibleReader;
