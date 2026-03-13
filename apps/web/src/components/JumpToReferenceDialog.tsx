import { useState, useEffect, useRef } from "react";
import {
  parseVerseReference,
  resolveBookName,
  CHAPTER_COUNTS,
} from "../utils/bibleReference";

interface JumpToReferenceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (book: string, chapter: number, verse?: number) => void;
}

export function JumpToReferenceDialog({
  isOpen,
  onClose,
  onNavigate,
}: JumpToReferenceDialogProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setInput("");
      setError("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

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

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Try full verse reference first: "John 3:16"
    const parsed = parseVerseReference(trimmed);
    if (parsed) {
      onNavigate(parsed.book, parsed.chapter, parsed.verse);
      onClose();
      return;
    }

    // Try book + chapter: "John 3"
    const chapterMatch = trimmed.match(/^(.+?)\s+(\d+)$/);
    if (chapterMatch) {
      const book = resolveBookName(chapterMatch[1]);
      const chapter = parseInt(chapterMatch[2]);
      if (book && chapter > 0 && chapter <= (CHAPTER_COUNTS[book] || 999)) {
        onNavigate(book, chapter);
        onClose();
        return;
      }
    }

    // Try book name only: "John"
    const bookOnly = resolveBookName(trimmed);
    if (bookOnly) {
      onNavigate(bookOnly, 1);
      onClose();
      return;
    }

    setError('Could not parse reference. Try "John 3:16" or "Genesis 1".');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[20vh] bg-black/60 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Jump to verse reference"
        className="w-full max-w-md bg-neutral-900/95 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <svg
            className="w-5 h-5 text-[#D4AF37] flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="Jump to... (e.g. John 3:16)"
            className="flex-1 bg-transparent text-white text-sm placeholder-neutral-500 focus:outline-none"
          />
          <kbd className="hidden md:inline px-1.5 py-0.5 bg-neutral-800 border border-neutral-700 rounded text-[10px] font-mono text-neutral-400">
            Enter
          </kbd>
        </div>
        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="px-4 py-2 text-xs text-red-400"
          >
            {error}
          </div>
        )}
        <div className="px-4 py-3 text-xs text-neutral-500">
          Type a book name, chapter, or verse reference.
          <br />
          Examples: <span className="text-neutral-400">John 3:16</span>,{" "}
          <span className="text-neutral-400">Genesis 1</span>,{" "}
          <span className="text-neutral-400">Psalms</span>
        </div>
      </div>
    </div>
  );
}
