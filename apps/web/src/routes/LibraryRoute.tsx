import React, { lazy } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../contexts/AppContext";
import { parseVerseReference, bookToUrlParam } from "../utils/bibleReference";

const LibraryView = lazy(() => import("../components/LibraryView"));

export default function LibraryRoute() {
  const navigate = useNavigate();
  const { handleGoDeeper, handleShowVisualization } = useAppContext();

  const handleNavigateToVerse = (reference?: string) => {
    if (!reference) {
      const lastBook = localStorage.getItem("lastBibleBook") || "Matthew";
      const lastChapter = localStorage.getItem("lastBibleChapter") || "1";
      navigate(`/read/${bookToUrlParam(lastBook)}/${lastChapter}`);
      return;
    }
    const parsed = parseVerseReference(reference);
    if (parsed) {
      navigate(
        `/read/${bookToUrlParam(parsed.book)}/${parsed.chapter}#${parsed.verse}`,
      );
    } else {
      navigate(`/read/Matthew/1`);
    }
  };

  const handleExploreBible = () => {
    const lastBook = localStorage.getItem("lastBibleBook") || "Matthew";
    const lastChapter = localStorage.getItem("lastBibleChapter") || "1";
    navigate(`/read/${bookToUrlParam(lastBook)}/${lastChapter}`);
  };

  return (
    <LibraryView
      userId="anonymous"
      onGoDeeper={handleGoDeeper}
      onOpenMap={handleShowVisualization}
      onNavigateToVerse={handleNavigateToVerse}
      onExploreBible={handleExploreBible}
    />
  );
}
