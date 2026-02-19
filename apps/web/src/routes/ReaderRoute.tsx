import React, { lazy, useCallback } from "react";
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

  // Extract "came from" location passed via router state (from verse navigation)
  const cameFrom: string | null =
    (location.state as { cameFrom?: string })?.cameFrom ?? null;

  const handleNavigate = useCallback(
    (newBook: string, newChapter: number) => {
      navigate(`/read/${bookToUrlParam(newBook)}/${newChapter}`, {
        replace: false,
      });
    },
    [navigate],
  );

  const handleNavigateToChat = useCallback(
    (prompt: GoDeeperPayload | string) => {
      if (typeof prompt === "string") {
        navigate("/chat", {
          state: { prompt: { type: "text", content: prompt } },
        });
      } else {
        navigate("/chat", { state: { prompt } });
      }
    },
    [navigate],
  );

  // Clear hash after verse navigation completes — preserve cameFrom in state
  const handleVerseNavigationComplete = useCallback(() => {
    const current = window.location.pathname;
    navigate(current, {
      replace: true,
      state: cameFrom ? { cameFrom } : undefined,
    });
  }, [navigate, cameFrom]);

  // Go back to the page the user came from
  const handleGoBack = useCallback(() => {
    if (cameFrom) {
      // Find the first verse visible in the viewport to highlight on return
      const verseElements = document.querySelectorAll("[data-verse]");
      let firstVisibleVerse: string | null = null;
      for (const el of verseElements) {
        const rect = el.getBoundingClientRect();
        if (rect.top >= 0 && rect.top < window.innerHeight * 0.6) {
          firstVisibleVerse = el.getAttribute("data-verse");
          break;
        }
      }
      // Save departure position so returning later can highlight it
      if (firstVisibleVerse) {
        sessionStorage.setItem(
          "readerDeparture",
          JSON.stringify({ book, chapter, verse: firstVisibleVerse }),
        );
      }
      navigate(cameFrom);
    }
  }, [cameFrom, navigate, book, chapter]);

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
      cameFrom={cameFrom}
      onGoBack={handleGoBack}
    />
  );
}
