import React, { useState, useEffect, useRef, useCallback } from "react";
import { getBook } from "../hooks/useBibleBookCache";
import { BIBLE_BOOKS } from "../utils/bibleReference";

interface SearchResult {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

interface BibleSearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (book: string, chapter: number, verse: number) => void;
  currentBook: string;
}

const MAX_RESULTS = 100;

export function BibleSearchDialog({
  isOpen,
  onClose,
  onNavigate,
  currentBook,
}: BibleSearchDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchScope, setSearchScope] = useState<"book" | "all">("book");
  const [searchedBooks, setSearchedBooks] = useState(0);
  const [totalBooks, setTotalBooks] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setSearching(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, onClose]);

  const searchBooks = useCallback(
    async (searchQuery: string, scope: "book" | "all") => {
      if (searchQuery.length < 2) {
        setResults([]);
        return;
      }

      // Cancel previous search
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setSearching(true);
      setResults([]);

      const booksToSearch = scope === "book" ? [currentBook] : [...BIBLE_BOOKS];
      setTotalBooks(booksToSearch.length);
      setSearchedBooks(0);

      const allResults: SearchResult[] = [];
      const lowerQuery = searchQuery.toLowerCase();

      for (const bookName of booksToSearch) {
        if (controller.signal.aborted) break;

        try {
          const bookData = await getBook(bookName, controller.signal);
          setSearchedBooks((prev) => prev + 1);

          for (const chapter of bookData.chapters) {
            for (const verse of chapter.verses) {
              if (verse.text.toLowerCase().includes(lowerQuery)) {
                allResults.push({
                  book: bookData.book,
                  chapter: parseInt(chapter.chapter),
                  verse: parseInt(verse.verse),
                  text: verse.text,
                });
                if (allResults.length >= MAX_RESULTS) break;
              }
            }
            if (allResults.length >= MAX_RESULTS) break;
          }
          if (allResults.length >= MAX_RESULTS) break;
        } catch {
          if (controller.signal.aborted) break;
        }
      }

      if (!controller.signal.aborted) {
        setResults(allResults);
        setSearching(false);
      }
    },
    [currentBook],
  );

  // Debounced search
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const timer = setTimeout(() => {
      searchBooks(query, searchScope);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, searchScope, searchBooks]);

  const highlightMatch = (text: string, q: string) => {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length);
    return (
      <>
        {before.length > 40 ? "..." + before.slice(-40) : before}
        <mark className="bg-[#D4AF37]/30 text-white rounded-sm px-0.5">
          {match}
        </mark>
        {after.slice(0, 80)}
        {after.length > 80 ? "..." : ""}
      </>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search the Bible"
        className="w-full max-w-xl bg-neutral-900/95 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl overflow-hidden"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <svg
            className="w-5 h-5 text-neutral-400 flex-shrink-0"
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
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the Bible..."
            className="flex-1 bg-transparent text-white text-sm placeholder-neutral-500 focus:outline-none"
          />
          {/* Scope toggle */}
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => setSearchScope("book")}
              className={`px-2 py-1 rounded transition-colors ${
                searchScope === "book"
                  ? "bg-[#D4AF37]/20 text-[#D4AF37]"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {currentBook}
            </button>
            <button
              onClick={() => setSearchScope("all")}
              className={`px-2 py-1 rounded transition-colors ${
                searchScope === "all"
                  ? "bg-[#D4AF37]/20 text-[#D4AF37]"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              All
            </button>
          </div>
          <kbd className="hidden md:inline px-1.5 py-0.5 bg-neutral-800 border border-neutral-700 rounded text-[10px] font-mono text-neutral-400">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div
          className="max-h-[50vh] overflow-y-auto"
          aria-live="polite"
          aria-label="Search results"
        >
          {searching && (
            <div className="px-4 py-3 text-sm text-neutral-400 flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-[#D4AF37]/40 border-t-[#D4AF37] rounded-full animate-spin" />
              {searchScope === "all"
                ? `Searching... (${searchedBooks}/${totalBooks} books)`
                : "Searching..."}
            </div>
          )}

          {!searching && query.length >= 2 && results.length === 0 && (
            <div className="px-4 py-8 text-center">
              <div className="text-sm text-neutral-400 mb-1">
                No results found for &ldquo;{query}&rdquo;
              </div>
              <div className="text-xs text-neutral-600">
                {searchScope === "book"
                  ? `Try searching "All" books instead of just ${currentBook}`
                  : "Try a different spelling or shorter phrase"}
              </div>
            </div>
          )}

          {results.map((result, i) => (
            <button
              key={`${result.book}-${result.chapter}-${result.verse}-${i}`}
              onClick={() => {
                onNavigate(result.book, result.chapter, result.verse);
                onClose();
              }}
              className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-b-0"
            >
              <div className="text-xs font-semibold text-[#D4AF37] mb-1">
                {result.book} {result.chapter}:{result.verse}
              </div>
              <div className="text-sm text-neutral-300 leading-relaxed">
                {highlightMatch(result.text, query)}
              </div>
            </button>
          ))}

          {results.length >= MAX_RESULTS && (
            <div className="px-4 py-3 text-xs text-neutral-500 text-center">
              Showing first {MAX_RESULTS} results. Refine your search for more
              specific matches.
            </div>
          )}

          {!searching && query.length < 2 && (
            <div className="px-4 py-8 text-center">
              <div className="text-sm text-neutral-500 mb-2">
                Type at least 2 characters to search
              </div>
              <div className="text-xs text-neutral-600">
                Search for words, phrases, or topics across Scripture
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
