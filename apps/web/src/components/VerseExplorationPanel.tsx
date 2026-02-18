import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { dispatchVerseNavigation } from "../utils/verseNavigation";
import { useRootTranslation } from "../hooks/useRootTranslation";
import { RootTranslationPanel } from "./tooltip/RootTranslationPanel";
import { LoadingDots } from "./tooltip/LoadingDots";
import { hapticTap, hapticBookmark, hapticSuccess } from "../utils/haptics";
import {
  fetchCrossReferences as cachedFetchCrossRefs,
  fetchVerseText,
} from "../utils/verseCache";
import {
  getStrongsVerse,
  extractStrongsWords,
  extractUniqueStrongsNumbers,
  getStrongsDefinitions,
  type StrongsWord,
  type StrongsLexiconEntry,
} from "../utils/strongsConcordance";
import { useBibleBookmarks } from "../contexts/BibleBookmarksContext";
import { parseVerseReference } from "../utils/bibleReference";
import { useBibleNotes } from "../hooks/useBibleNotes";

// --- Reference type classification (reused from VerseReferencesModal) ---

const OT_BOOKS = new Set([
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
]);
const GOSPELS = new Set(["Matthew", "Mark", "Luke", "John"]);
const PROPHETS = new Set([
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
]);

type RefType = "parallel" | "prophecy" | "thematic";

function classifyReference(sourceBook: string, targetBook: string): RefType {
  if (
    GOSPELS.has(sourceBook) &&
    GOSPELS.has(targetBook) &&
    sourceBook !== targetBook
  )
    return "parallel";
  const sourceIsOT = OT_BOOKS.has(sourceBook);
  const targetIsOT = OT_BOOKS.has(targetBook);
  if (
    (sourceIsOT && !targetIsOT && PROPHETS.has(sourceBook)) ||
    (!sourceIsOT && targetIsOT && PROPHETS.has(targetBook))
  )
    return "prophecy";
  if (sourceBook === targetBook) return "parallel";
  return "thematic";
}

const REF_TYPE_LABELS: Record<RefType, string> = {
  parallel: "Parallel",
  prophecy: "Prophecy",
  thematic: "Thematic",
};

// --- Types ---

interface VerseRef {
  book: string;
  chapter: number;
  verse: number;
}

interface VerseExplorationPanelProps {
  reference: string; // e.g. "Matthew 5:7"
  position: { top: number; left: number };
  onClose: () => void;
  onTrace?: (reference: string) => void;
  onGoDeeper?: (reference: string) => void;
}

interface BreadcrumbEntry {
  reference: string;
}

// --- Component ---

export function VerseExplorationPanel({
  reference: initialReference,
  position,
  onClose,
  onTrace,
  onGoDeeper,
}: VerseExplorationPanelProps) {
  // Breadcrumb stack: first entry is the initial verse
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([
    { reference: initialReference },
  ]);
  const currentRef = breadcrumbs[breadcrumbs.length - 1].reference;

  // Bookmarks
  const { addBookmark, removeBookmark, isBookmarked, getBookmark } =
    useBibleBookmarks();
  const parsedRef = useMemo(
    () => parseVerseReference(currentRef),
    [currentRef],
  );
  const bookmarked = parsedRef
    ? isBookmarked(parsedRef.book, parsedRef.chapter, parsedRef.verse)
    : false;

  const toggleBookmark = useCallback(() => {
    if (!parsedRef) return;
    hapticBookmark();
    if (bookmarked) {
      const existing = getBookmark(
        parsedRef.book,
        parsedRef.chapter,
        parsedRef.verse,
      );
      if (existing) removeBookmark(existing.id);
    } else {
      addBookmark(parsedRef.book, parsedRef.chapter, parsedRef.verse);
    }
  }, [parsedRef, bookmarked, addBookmark, removeBookmark, getBookmark]);

  // Notes
  const { getNote, setNote } = useBibleNotes();
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [noteText, setNoteText] = useState("");
  const currentNote = parsedRef
    ? getNote(parsedRef.book, parsedRef.chapter, parsedRef.verse)
    : undefined;

  // Sync note text when reference changes
  useEffect(() => {
    setNoteText(currentNote?.text || "");
    setShowNoteEditor(false);
  }, [currentRef]);

  const saveNote = useCallback(() => {
    if (!parsedRef) return;
    setNote(parsedRef.book, parsedRef.chapter, parsedRef.verse, noteText);
    hapticSuccess();
    setShowNoteEditor(false);
  }, [parsedRef, noteText, setNote]);

  // Verse text state
  const [verseText, setVerseText] = useState("");
  const [verseLoading, setVerseLoading] = useState(true);

  // Cross-references state
  const [crossRefs, setCrossRefs] = useState<VerseRef[]>([]);
  const [refsLoading, setRefsLoading] = useState(true);
  const [refsError, setRefsError] = useState<string | null>(null);
  const [versePreviews, setVersePreviews] = useState<Record<string, string>>(
    {},
  );

  // Strong's inline data
  const [strongsWords, setStrongsWords] = useState<StrongsWord[]>([]);
  const [strongsDefs, setStrongsDefs] = useState<
    Record<string, StrongsLexiconEntry>
  >({});
  const [selectedStrongsIndex, setSelectedStrongsIndex] = useState<
    number | null
  >(null);

  // ROOT translation
  const [viewMode, setViewMode] = useState<"explore" | "root">("explore");
  const root = useRootTranslation();

  // UI state
  const [isVisible, setIsVisible] = useState(false);
  const [focusedRefIndex, setFocusedRefIndex] = useState(-1);
  const panelRef = useRef<HTMLDivElement>(null);
  const refItemsRef = useRef<(HTMLDivElement | null)[]>([]);

  // Parse book name from reference for type classification
  const currentBook = currentRef.replace(/\s+\d+:\d+$/, "");

  // Entrance animation + auto-focus for keyboard
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setIsVisible(true);
      panelRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // Fetch verse text when current reference changes
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setVerseLoading(true);
    setVerseText("");
    setViewMode("explore");
    root.reset();

    const load = async () => {
      const text = await fetchVerseText(currentRef, controller.signal);
      if (cancelled) return;
      setVerseText(text || "Could not load verse text");
      setVerseLoading(false);
    };
    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [currentRef]);

  // Fetch Strong's data for the current verse
  useEffect(() => {
    let cancelled = false;
    setStrongsWords([]);
    setStrongsDefs({});
    setSelectedStrongsIndex(null);

    const refMatch = currentRef.match(/^(.+?)\s+(\d+):(\d+)$/);
    if (!refMatch) return;
    const [, book, ch, vs] = refMatch;

    const load = async () => {
      const strongsText = await getStrongsVerse(
        book,
        parseInt(ch),
        parseInt(vs),
      );
      if (cancelled || !strongsText) return;

      const words = extractStrongsWords(strongsText);
      if (cancelled) return;
      setStrongsWords(words);

      const uniqueNums = extractUniqueStrongsNumbers(strongsText);
      if (uniqueNums.length > 0) {
        const defs = await getStrongsDefinitions(uniqueNums);
        if (cancelled) return;
        setStrongsDefs(defs);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [currentRef]);

  // Fetch cross-references when current reference changes
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    let minLoadTimer: ReturnType<typeof setTimeout>;
    setRefsLoading(true);
    setRefsError(null);
    setCrossRefs([]);
    setVersePreviews({});

    const startTime = Date.now();
    const load = async () => {
      try {
        const refs = await cachedFetchCrossRefs(currentRef, controller.signal);
        if (cancelled) return;
        const remaining = Math.max(0, 300 - (Date.now() - startTime));
        minLoadTimer = setTimeout(() => {
          setCrossRefs(refs);
          setRefsLoading(false);
        }, remaining);
      } catch (err: unknown) {
        if (cancelled) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setRefsError("Could not load references");
        setRefsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(minLoadTimer);
    };
  }, [currentRef]);

  // Batch-fetch verse previews after cross-refs load
  useEffect(() => {
    if (crossRefs.length === 0) return;
    const controller = new AbortController();
    let cancelled = false;

    const toFetch = crossRefs.slice(0, 10);
    const promises = toFetch.map(async (ref) => {
      const refStr = `${ref.book} ${ref.chapter}:${ref.verse}`;
      const text = await fetchVerseText(refStr, controller.signal);
      return [refStr, text || ""] as const;
    });

    Promise.allSettled(promises).then((results) => {
      if (cancelled) return;
      const previews: Record<string, string> = {};
      for (const result of results) {
        if (result.status === "fulfilled") {
          const [key, text] = result.value;
          if (text) previews[key] = text;
        }
      }
      setVersePreviews(previews);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [crossRefs]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Navigate to a cross-reference (push onto breadcrumb stack)
  const navigateToRef = useCallback((refString: string) => {
    hapticTap();
    setBreadcrumbs((prev) => [...prev, { reference: refString }]);
  }, []);

  // Go back one level in breadcrumb
  const goBack = useCallback(() => {
    hapticTap();
    setBreadcrumbs((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  // ROOT translation handler
  const handleRootTranslation = async () => {
    if (!verseText) return;
    setViewMode("root");
    const refMatch = currentRef.match(/^(.+?)\s+(\d+):(\d+)$/);
    await root.generate(verseText, {
      book: refMatch?.[1] || "",
      chapter: refMatch?.[2] ? parseInt(refMatch[2]) : 0,
      verse: refMatch?.[3] ? parseInt(refMatch[3]) : 0,
    });
  };

  // Viewport bounds clamping
  const panelWidth = 384;
  const edgePadding = 16;
  const minLeft = panelWidth / 2 + edgePadding;
  const containerWidth =
    panelRef.current?.offsetParent?.clientWidth || window.innerWidth;
  const maxLeft = containerWidth - panelWidth / 2 - edgePadding;
  const adjustedLeft = Math.min(Math.max(position.left, minLeft), maxLeft);

  // Group cross-refs by type
  const groupedRefs = useMemo(() => {
    const grouped = new Map<RefType, VerseRef[]>();
    for (const ref of crossRefs) {
      const type = classifyReference(currentBook, ref.book);
      if (!grouped.has(type)) grouped.set(type, []);
      grouped.get(type)!.push(ref);
    }
    const order: RefType[] = ["parallel", "prophecy", "thematic"];
    return order
      .filter((t) => grouped.has(t))
      .map((t) => ({ type: t, refs: grouped.get(t)! }));
  }, [crossRefs, currentBook]);

  // Flat list of all ref strings for keyboard navigation indexing
  const flatRefStrings = useMemo(
    () =>
      groupedRefs.flatMap(({ refs }) =>
        refs.map((r) => `${r.book} ${r.chapter}:${r.verse}`),
      ),
    [groupedRefs],
  );

  // Reset focus when cross-refs change
  useEffect(() => {
    setFocusedRefIndex(-1);
    refItemsRef.current = [];
  }, [crossRefs]);

  // Auto-scroll focused item into view
  useEffect(() => {
    if (focusedRefIndex >= 0 && refItemsRef.current[focusedRefIndex]) {
      refItemsRef.current[focusedRefIndex]?.scrollIntoView({
        block: "nearest",
      });
    }
  }, [focusedRefIndex]);

  // Keyboard handler for the panel
  const handlePanelKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Only handle keys in explore mode with refs loaded
      if (viewMode === "root") {
        if (e.key === "Escape") {
          e.preventDefault();
          root.reset();
          setViewMode("explore");
        }
        return;
      }

      const totalRefs = flatRefStrings.length;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          if (totalRefs === 0) return;
          setFocusedRefIndex((prev) => (prev < totalRefs - 1 ? prev + 1 : 0));
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          if (totalRefs === 0) return;
          setFocusedRefIndex((prev) => (prev > 0 ? prev - 1 : totalRefs - 1));
          break;
        }
        case "Enter": {
          if (focusedRefIndex >= 0 && focusedRefIndex < totalRefs) {
            e.preventDefault();
            navigateToRef(flatRefStrings[focusedRefIndex]);
          }
          break;
        }
        case "Backspace": {
          if (breadcrumbs.length > 1) {
            e.preventDefault();
            goBack();
          }
          break;
        }
        case "Escape": {
          e.preventDefault();
          if (breadcrumbs.length > 1) {
            goBack();
          } else {
            onClose();
          }
          break;
        }
      }
    },
    [
      viewMode,
      flatRefStrings,
      focusedRefIndex,
      breadcrumbs.length,
      navigateToRef,
      goBack,
      onClose,
      root,
    ],
  );

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      onKeyDown={handlePanelKeyDown}
      className={`absolute z-[60] transform -translate-x-1/2 transition-all duration-150 ease-out outline-none ${isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
      style={{
        top: `${position.top}px`,
        left: `${adjustedLeft}px`,
      }}
    >
      <div className="relative bg-white/[0.08] backdrop-blur-2xl border border-white/5 rounded-lg shadow-2xl overflow-hidden max-w-sm w-[384px]">
        {/* Header with breadcrumb */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
          <div className="flex items-center gap-1.5 min-w-0">
            {breadcrumbs.length > 1 && (
              <button
                onClick={goBack}
                className="flex-shrink-0 p-0.5 rounded text-neutral-500 hover:text-neutral-300 hover:bg-white/10 transition-all"
                aria-label="Go back"
              >
                <svg
                  className="w-3.5 h-3.5"
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
            )}
            <div className="min-w-0">
              {breadcrumbs.length > 1 && (
                <div className="flex items-center gap-1 text-[10px] text-neutral-500 truncate">
                  {breadcrumbs.slice(0, -1).map((b, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && (
                        <span className="text-neutral-600">&rsaquo;</span>
                      )}
                      <button
                        onClick={() => {
                          hapticTap();
                          setBreadcrumbs((prev) => prev.slice(0, i + 1));
                        }}
                        className="hover:text-neutral-300 transition-colors truncate"
                      >
                        {b.reference}
                      </button>
                    </React.Fragment>
                  ))}
                </div>
              )}
              <div className="text-xs font-semibold text-[#D4AF37] uppercase tracking-wide truncate">
                {currentRef}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1 rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-white/10 transition-all duration-150"
            aria-label="Close"
          >
            <svg
              className="w-3.5 h-3.5"
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

        {/* Scrollable content */}
        <div className="max-h-96 overflow-y-auto">
          {viewMode === "root" ? (
            <div className="p-3">
              <RootTranslationPanel
                isLoading={root.isLoading}
                language={root.language}
                words={root.words}
                lostContext={root.lostContext}
                fallbackText={root.fallbackText}
                selectedWordIndex={root.selectedWordIndex}
                onSelectWord={root.setSelectedWordIndex}
                onBack={() => {
                  root.reset();
                  setViewMode("explore");
                }}
                backLabel="Back to verse"
              />
            </div>
          ) : (
            <>
              {/* Verse text section */}
              <div className="p-3 border-b border-white/5">
                {verseLoading ? (
                  <LoadingDots label="Loading verse" color="#D4AF37" />
                ) : (
                  <>
                    {/* Verse text with optional inline Strong's */}
                    <div className="text-[15px] leading-relaxed text-white font-serif italic">
                      {strongsWords.length > 0 ? (
                        <p>
                          {strongsWords.map((word, i) => {
                            const hasStrongs = Boolean(word.strongs);
                            const isSelected = selectedStrongsIndex === i;
                            return (
                              <React.Fragment key={i}>
                                {hasStrongs ? (
                                  <span
                                    role="button"
                                    tabIndex={-1}
                                    onClick={() =>
                                      setSelectedStrongsIndex(
                                        isSelected ? null : i,
                                      )
                                    }
                                    className={`cursor-pointer transition-colors ${
                                      isSelected
                                        ? "text-[#F0D77F]"
                                        : "hover:text-[#D4AF37]/80"
                                    }`}
                                  >
                                    {word.text}
                                    <sup className="text-[9px] font-sans not-italic ml-px opacity-40 hover:opacity-70 transition-opacity">
                                      {word.strongs}
                                    </sup>
                                  </span>
                                ) : (
                                  <span>{word.text}</span>
                                )}
                                {i < strongsWords.length - 1 && " "}
                              </React.Fragment>
                            );
                          })}
                        </p>
                      ) : (
                        <p>{verseText}</p>
                      )}
                    </div>

                    {/* Strong's definition inline expansion */}
                    {selectedStrongsIndex !== null &&
                      strongsWords[selectedStrongsIndex]?.strongs && (
                        <div className="mt-2 rounded-md border border-white/10 bg-white/5 px-2.5 py-2 text-[12px] leading-relaxed not-italic">
                          <div className="flex items-center gap-2 text-[10px] text-neutral-400 uppercase tracking-wide font-sans">
                            <span>
                              Strong&apos;s{" "}
                              {strongsWords[selectedStrongsIndex].strongs}
                            </span>
                            {strongsDefs[
                              strongsWords[selectedStrongsIndex].strongs!
                            ] && (
                              <span className="text-[#D4AF37]/60">
                                {strongsDefs[
                                  strongsWords[selectedStrongsIndex].strongs!
                                ].Gk_word ||
                                  strongsDefs[
                                    strongsWords[selectedStrongsIndex].strongs!
                                  ].Hb_word ||
                                  ""}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-neutral-300 font-sans">
                            {strongsDefs[
                              strongsWords[selectedStrongsIndex].strongs!
                            ]?.strongs_def || "Definition unavailable."}
                          </p>
                        </div>
                      )}

                    {/* Action buttons */}
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => {
                          dispatchVerseNavigation(currentRef);
                          onClose();
                        }}
                        className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-neutral-200 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5"
                        title="Open in Bible reader"
                      >
                        <svg
                          className="w-3.5 h-3.5"
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
                        <span>View</span>
                      </button>
                      {/* Bookmark toggle */}
                      <button
                        onClick={toggleBookmark}
                        className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5 ${
                          bookmarked
                            ? "bg-[#D4AF37]/20 text-[#D4AF37]"
                            : "bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-neutral-200"
                        }`}
                        title={
                          bookmarked ? "Remove bookmark" : "Bookmark this verse"
                        }
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill={bookmarked ? "currentColor" : "none"}
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                          />
                        </svg>
                      </button>
                      {/* Note toggle */}
                      <button
                        onClick={() => {
                          setShowNoteEditor((s) => !s);
                          if (!showNoteEditor)
                            setNoteText(currentNote?.text || "");
                        }}
                        className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5 ${
                          currentNote
                            ? "bg-[#D4AF37]/20 text-[#D4AF37]"
                            : "bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-neutral-200"
                        }`}
                        title={currentNote ? "Edit note" : "Add note"}
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      {onTrace && (
                        <button
                          onClick={() => {
                            onTrace(currentRef);
                            onClose();
                          }}
                          className="group px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5 hover:brightness-110 bg-[#D4AF37]/20 text-[#D4AF37]"
                          title="Open connection map"
                        >
                          <span>Trace</span>
                          <svg
                            className="w-3 h-3 transition-transform group-hover:translate-x-0.5"
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
                      )}
                      {onGoDeeper && (
                        <button
                          onClick={() => {
                            onGoDeeper(currentRef);
                            onClose();
                          }}
                          className="px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white"
                          title="Ask AI about this passage"
                        >
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                            />
                          </svg>
                          <span>Go Deeper</span>
                        </button>
                      )}
                      <button
                        onClick={handleRootTranslation}
                        className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-neutral-200 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5"
                        title="See original Hebrew/Greek translation"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                          />
                        </svg>
                        <span>ROOT</span>
                      </button>
                    </div>

                    {/* Note editor */}
                    {showNoteEditor && (
                      <div className="mt-3 rounded-md border border-white/10 bg-white/5 p-2">
                        <textarea
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder="Write a note about this verse..."
                          className="w-full bg-transparent text-sm text-neutral-200 placeholder-neutral-500 resize-none focus:outline-none"
                          rows={3}
                          autoFocus
                        />
                        <div className="flex items-center justify-end gap-2 mt-1.5">
                          <button
                            onClick={() => setShowNoteEditor(false)}
                            className="px-2 py-1 text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={saveNote}
                            className="px-2.5 py-1 text-[11px] font-medium bg-[#D4AF37]/20 text-[#D4AF37] hover:bg-[#D4AF37]/30 rounded transition-colors"
                          >
                            {currentNote ? "Update" : "Save"}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Cross-references section */}
              <div className="p-3">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500 font-medium mb-2">
                  Cross-References
                </div>
                {refsLoading ? (
                  <div className="flex items-center gap-2 py-2">
                    <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse" />
                    <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse [animation-delay:150ms]" />
                    <div className="w-1 h-1 rounded-full bg-[#D4AF37] animate-pulse [animation-delay:300ms]" />
                    <span className="text-xs text-neutral-400 ml-1 font-medium">
                      Loading
                    </span>
                  </div>
                ) : refsError ? (
                  <div className="text-xs text-red-400 py-1">{refsError}</div>
                ) : crossRefs.length === 0 ? (
                  <div className="text-xs text-neutral-400 py-1">
                    No cross-references found
                  </div>
                ) : (
                  <div
                    role="list"
                    aria-label={`Cross references for ${currentRef}`}
                  >
                    {(() => {
                      let flatIndex = 0;
                      return groupedRefs.map(({ type, refs }) => (
                        <div
                          key={type}
                          className={
                            groupedRefs.length > 1 ? "mb-2 last:mb-0" : ""
                          }
                        >
                          {groupedRefs.length > 1 && (
                            <div className="text-[10px] uppercase tracking-widest text-neutral-600 font-medium px-1 mb-1">
                              {REF_TYPE_LABELS[type]}
                            </div>
                          )}
                          <div className="space-y-1">
                            {refs.map((ref, index) => {
                              const refString = `${ref.book} ${ref.chapter}:${ref.verse}`;
                              const preview = versePreviews[refString];
                              const isFocused = flatIndex === focusedRefIndex;
                              const currentFlatIndex = flatIndex;
                              flatIndex++;

                              return (
                                <div
                                  key={`${type}-${index}`}
                                  ref={(el) => {
                                    refItemsRef.current[currentFlatIndex] = el;
                                  }}
                                  role="button"
                                  tabIndex={-1}
                                  onClick={() => navigateToRef(refString)}
                                  onMouseEnter={() =>
                                    setFocusedRefIndex(currentFlatIndex)
                                  }
                                  className={`px-1 py-1 cursor-pointer group border-l-2 pl-2 transition-all rounded-r-sm ${
                                    isFocused
                                      ? "border-[#D4AF37]/60 bg-white/[0.06]"
                                      : "border-[#D4AF37]/15 hover:border-[#D4AF37]/40 hover:bg-white/[0.03]"
                                  }`}
                                >
                                  <span
                                    className={`text-xs font-medium transition-colors ${
                                      isFocused
                                        ? "text-[#D4AF37]"
                                        : "text-[#D4AF37]/70 group-hover:text-[#D4AF37]"
                                    }`}
                                  >
                                    {refString}
                                  </span>
                                  {preview ? (
                                    <p
                                      className={`text-[11px] leading-relaxed font-serif italic mt-0.5 line-clamp-2 transition-colors ${
                                        isFocused
                                          ? "text-neutral-400"
                                          : "text-neutral-500 group-hover:text-neutral-400"
                                      }`}
                                    >
                                      {preview}
                                    </p>
                                  ) : (
                                    <div className="mt-1">
                                      <div className="h-2.5 w-3/4 rounded bg-white/5 animate-pulse" />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Arrow pointer */}
      <div
        className="absolute"
        style={{ top: "-8px", left: "50%", transform: "translateX(-50%)" }}
      >
        <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-1">
          <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[8px] border-b-black/20 blur-sm" />
        </div>
        <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[8px] border-b-white/[0.08]" />
        <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2">
          <div className="w-0 h-0 border-l-[9px] border-l-transparent border-r-[9px] border-r-transparent border-b-[9px] border-b-white/10" />
        </div>
      </div>
    </div>
  );
}
