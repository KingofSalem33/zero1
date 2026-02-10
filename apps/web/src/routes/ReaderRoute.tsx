import React, { lazy } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAppContext } from "../contexts/AppContext";
import { resolveBookFromUrl, bookToUrlParam } from "../utils/bibleReference";
import type { GoDeeperPayload } from "../types/chat";

const BibleReader = lazy(() => import("../components/BibleReader"));

export default function ReaderRoute() {
  const { book: urlBook = "Matthew", chapter: urlChapter = "1" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { handleTrace, handleShowVisualization } = useAppContext();

  // Resolve book name from URL param
  const book = resolveBookFromUrl(urlBook) || "Matthew";
  const chapter = parseInt(urlChapter, 10) || 1;

  // Parse verse from hash (e.g., #5 for verse 5)
  const verseFromHash = location.hash ? location.hash.slice(1) : null;
  // Build a reference string for BibleReader's pendingVerseReference
  const pendingVerse = verseFromHash
    ? `${book} ${chapter}:${verseFromHash}`
    : null;

  const handleNavigate = (newBook: string, newChapter: number) => {
    navigate(`/read/${bookToUrlParam(newBook)}/${newChapter}`, {
      replace: false,
    });
  };

  const handleNavigateToChat = (prompt: GoDeeperPayload | string) => {
    if (typeof prompt === "string") {
      navigate("/chat", {
        state: { prompt: { type: "text", content: prompt } },
      });
    } else {
      navigate("/chat", { state: { prompt } });
    }
  };

  // Clear hash after verse navigation completes
  const handleVerseNavigationComplete = () => {
    if (location.hash) {
      navigate(`/read/${bookToUrlParam(book)}/${chapter}`, { replace: true });
    }
  };

  return (
    <BibleReader
      book={book}
      chapter={chapter}
      onNavigate={handleNavigate}
      onNavigateToChat={handleNavigateToChat}
      onTrace={handleTrace}
      onOpenMap={handleShowVisualization}
      pendingVerseReference={pendingVerse}
      onVerseNavigationComplete={handleVerseNavigationComplete}
    />
  );
}
