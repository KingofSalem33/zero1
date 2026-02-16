import React, { useMemo } from "react";
import { BIBLE_BOOKS } from "../utils/bibleReference";
import type { BibleHighlight } from "../contexts/BibleHighlightsContext";

// OT/NT split index (Matthew = index 39)
const NT_START = 39;

interface HighlightHeatmapProps {
  highlights: BibleHighlight[];
  onBookClick?: (book: string) => void;
}

export function HighlightHeatmap({
  highlights,
  onBookClick,
}: HighlightHeatmapProps) {
  const bookCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of highlights) {
      counts.set(h.book, (counts.get(h.book) || 0) + 1);
    }
    return counts;
  }, [highlights]);

  const maxCount = useMemo(
    () => Math.max(1, ...bookCounts.values()),
    [bookCounts],
  );

  const otBooks = BIBLE_BOOKS.slice(0, NT_START);
  const ntBooks = BIBLE_BOOKS.slice(NT_START);

  const getIntensity = (book: string): number => {
    const count = bookCounts.get(book) || 0;
    if (count === 0) return 0;
    // Log scale for better visual distribution
    return Math.max(0.15, Math.log(count + 1) / Math.log(maxCount + 1));
  };

  const getAbbrev = (book: string): string => {
    // Short abbreviation (first 3 chars, or special cases)
    const abbrevs: Record<string, string> = {
      Genesis: "Gen",
      Exodus: "Exo",
      Leviticus: "Lev",
      Numbers: "Num",
      Deuteronomy: "Deu",
      Joshua: "Jos",
      Judges: "Jdg",
      Ruth: "Rth",
      "1 Samuel": "1Sa",
      "2 Samuel": "2Sa",
      "1 Kings": "1Ki",
      "2 Kings": "2Ki",
      "1 Chronicles": "1Ch",
      "2 Chronicles": "2Ch",
      Ezra: "Ezr",
      Nehemiah: "Neh",
      Esther: "Est",
      Job: "Job",
      Psalms: "Psa",
      Proverbs: "Pro",
      Ecclesiastes: "Ecc",
      "Song of Solomon": "SoS",
      Isaiah: "Isa",
      Jeremiah: "Jer",
      Lamentations: "Lam",
      Ezekiel: "Eze",
      Daniel: "Dan",
      Hosea: "Hos",
      Joel: "Joe",
      Amos: "Amo",
      Obadiah: "Oba",
      Jonah: "Jon",
      Micah: "Mic",
      Nahum: "Nah",
      Habakkuk: "Hab",
      Zephaniah: "Zep",
      Haggai: "Hag",
      Zechariah: "Zec",
      Malachi: "Mal",
      Matthew: "Mat",
      Mark: "Mrk",
      Luke: "Luk",
      John: "Jhn",
      Acts: "Act",
      Romans: "Rom",
      "1 Corinthians": "1Co",
      "2 Corinthians": "2Co",
      Galatians: "Gal",
      Ephesians: "Eph",
      Philippians: "Php",
      Colossians: "Col",
      "1 Thessalonians": "1Th",
      "2 Thessalonians": "2Th",
      "1 Timothy": "1Ti",
      "2 Timothy": "2Ti",
      Titus: "Tit",
      Philemon: "Phm",
      Hebrews: "Heb",
      James: "Jas",
      "1 Peter": "1Pe",
      "2 Peter": "2Pe",
      "1 John": "1Jn",
      "2 John": "2Jn",
      "3 John": "3Jn",
      Jude: "Jud",
      Revelation: "Rev",
    };
    return abbrevs[book] || book.slice(0, 3);
  };

  const renderBookGrid = (books: string[], label: string) => (
    <div>
      <p className="text-neutral-600 text-[10px] uppercase tracking-wider mb-2">
        {label}
      </p>
      <div
        className="flex flex-wrap gap-[3px]"
        role="grid"
        aria-label={`${label} highlight density`}
      >
        {books.map((book) => {
          const count = bookCounts.get(book) || 0;
          const intensity = getIntensity(book);
          return (
            <button
              key={book}
              onClick={() => count > 0 && onBookClick?.(book)}
              aria-label={`${book}: ${count} highlight${count !== 1 ? "s" : ""}`}
              className={`relative w-8 h-8 rounded-sm text-[7px] font-medium leading-none flex items-center justify-center transition-all duration-150 ${
                count > 0
                  ? "cursor-pointer hover:scale-110 hover:z-10"
                  : "cursor-default"
              }`}
              style={{
                backgroundColor:
                  count > 0
                    ? `rgba(212, 175, 55, ${intensity * 0.6})`
                    : "rgba(255,255,255,0.03)",
                color:
                  count > 0
                    ? `rgba(255,255,255,${0.5 + intensity * 0.5})`
                    : "rgba(255,255,255,0.15)",
              }}
              title={`${book}: ${count} highlight${count !== 1 ? "s" : ""}`}
            >
              {getAbbrev(book)}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-neutral-300 text-sm font-medium">
          Highlight Density
        </h3>
        <div className="flex items-center gap-1.5">
          <span className="text-neutral-600 text-[9px]">Less</span>
          {[0.05, 0.2, 0.4, 0.6].map((opacity) => (
            <div
              key={opacity}
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: `rgba(212, 175, 55, ${opacity})` }}
            />
          ))}
          <span className="text-neutral-600 text-[9px]">More</span>
        </div>
      </div>
      <div className="space-y-4">
        {renderBookGrid(otBooks, "Old Testament")}
        {renderBookGrid(ntBooks, "New Testament")}
      </div>
    </div>
  );
}
