import { useState, useEffect, useRef } from "react";
import { BIBLE_BOOKS, CHAPTER_COUNTS } from "../utils/bibleReference";

interface MobileBookSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  selectedBook: string;
  selectedChapter: number;
  onSelect: (book: string, chapter: number) => void;
  recentBooks?: string[];
  getLastChapter?: (book: string) => number | undefined;
}

export function MobileBookSelector({
  isOpen,
  onClose,
  selectedBook,
  selectedChapter,
  onSelect,
  recentBooks = [],
  getLastChapter,
}: MobileBookSelectorProps) {
  const [phase, setPhase] = useState<"books" | "chapters">("books");
  const [pickedBook, setPickedBook] = useState(selectedBook);
  const [filter, setFilter] = useState("");
  const [visible, setVisible] = useState(false);
  const filterRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPhase("books");
      setPickedBook(selectedBook);
      setFilter("");
      requestAnimationFrame(() => {
        setVisible(true);
        filterRef.current?.focus();
      });
    } else {
      setVisible(false);
    }
  }, [isOpen, selectedBook]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const lowerFilter = filter.toLowerCase();
  const otBooks = BIBLE_BOOKS.slice(0, 39).filter(
    (b) => !filter || b.toLowerCase().includes(lowerFilter),
  );
  const ntBooks = BIBLE_BOOKS.slice(39).filter(
    (b) => !filter || b.toLowerCase().includes(lowerFilter),
  );

  const chapterCount = CHAPTER_COUNTS[pickedBook] || 1;
  const chapters = Array.from({ length: chapterCount }, (_, i) => i + 1);

  const handleBookPick = (book: string) => {
    setPickedBook(book);
    const count = CHAPTER_COUNTS[book] || 1;
    if (count === 1) {
      onSelect(book, 1);
      onClose();
    } else {
      setPhase("chapters");
      requestAnimationFrame(() => scrollRef.current?.scrollTo(0, 0));
    }
  };

  const handleChapterPick = (chapter: number) => {
    onSelect(pickedBook, chapter);
    onClose();
  };

  return (
    <div
      className={`fixed inset-0 z-[70] flex flex-col transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Select a book and chapter"
        className={`relative mt-auto bg-neutral-900 border-t border-white/10 rounded-t-2xl max-h-[85vh] flex flex-col transition-transform duration-300 ${visible ? "translate-y-0" : "translate-y-full"}`}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-neutral-600" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3">
          {phase === "chapters" ? (
            <button
              onClick={() => {
                setPhase("books");
                setFilter("");
              }}
              aria-label="Go back to book selection"
              className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white transition-colors"
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Books
            </button>
          ) : (
            <span className="text-sm font-semibold text-white">
              Select a Book
            </span>
          )}
          {phase === "chapters" && (
            <span className="text-sm font-semibold text-[#D4AF37]">
              {pickedBook}
            </span>
          )}
          <button
            onClick={onClose}
            aria-label="Close book selector"
            className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/10 transition-colors"
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

        {/* Search (books phase only) */}
        {phase === "books" && (
          <div className="px-4 pb-3">
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
                ref={filterRef}
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search books..."
                className="w-full pl-9 pr-3 py-2.5 bg-neutral-800/80 border border-white/10 rounded-xl text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-[#D4AF37]/40"
              />
            </div>
          </div>
        )}

        {/* Scrollable content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-8">
          {phase === "books" ? (
            <>
              {/* Recent */}
              {!filter && recentBooks.length > 1 && (
                <div className="mb-4">
                  <div className="text-[10px] font-semibold text-[#D4AF37]/70 uppercase tracking-wider mb-2">
                    Recent
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {recentBooks.map((book) => {
                      const lastCh = getLastChapter?.(book);
                      return (
                        <button
                          key={`r-${book}`}
                          onClick={() => handleBookPick(book)}
                          className={`text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-between ${
                            selectedBook === book
                              ? "bg-[#D4AF37]/20 text-[#D4AF37] font-medium"
                              : "bg-white/5 text-neutral-300 active:bg-white/10"
                          }`}
                        >
                          <span>{book}</span>
                          {lastCh && lastCh > 1 && selectedBook !== book && (
                            <span className="text-[10px] text-neutral-500">
                              Ch. {lastCh}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* OT */}
              {otBooks.length > 0 && (
                <div className="mb-4">
                  <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                    Old Testament
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {otBooks.map((book) => {
                      const lastCh = getLastChapter?.(book);
                      return (
                        <button
                          key={book}
                          onClick={() => handleBookPick(book)}
                          className={`text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-between ${
                            selectedBook === book
                              ? "bg-[#D4AF37]/20 text-[#D4AF37] font-medium"
                              : "bg-white/5 text-neutral-300 active:bg-white/10"
                          }`}
                        >
                          <span>{book}</span>
                          {lastCh && lastCh > 1 && selectedBook !== book && (
                            <span className="text-[10px] text-neutral-500">
                              Ch. {lastCh}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* NT */}
              {ntBooks.length > 0 && (
                <div className="mb-4">
                  <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                    New Testament
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {ntBooks.map((book) => {
                      const lastCh = getLastChapter?.(book);
                      return (
                        <button
                          key={book}
                          onClick={() => handleBookPick(book)}
                          className={`text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-between ${
                            selectedBook === book
                              ? "bg-[#D4AF37]/20 text-[#D4AF37] font-medium"
                              : "bg-white/5 text-neutral-300 active:bg-white/10"
                          }`}
                        >
                          <span>{book}</span>
                          {lastCh && lastCh > 1 && selectedBook !== book && (
                            <span className="text-[10px] text-neutral-500">
                              Ch. {lastCh}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {otBooks.length === 0 && ntBooks.length === 0 && (
                <div className="text-center py-8 text-neutral-500 text-sm">
                  No books match &ldquo;{filter}&rdquo;
                </div>
              )}
            </>
          ) : (
            /* Chapter grid */
            <div>
              <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                Select Chapter
              </div>
              <div className="grid grid-cols-5 gap-2">
                {chapters.map((ch) => (
                  <button
                    key={ch}
                    onClick={() => handleChapterPick(ch)}
                    className={`py-3 rounded-lg text-sm font-medium transition-colors ${
                      pickedBook === selectedBook && ch === selectedChapter
                        ? "bg-[#D4AF37]/20 text-[#D4AF37]"
                        : "bg-white/5 text-neutral-300 active:bg-white/10"
                    }`}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
