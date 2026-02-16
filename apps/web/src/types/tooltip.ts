/**
 * Shared types for the tooltip system.
 */

export interface Position {
  top: number;
  left: number;
}

export interface RootWord {
  english: string;
  original: string;
  strongs: string | null;
  definition: string;
}

export interface RootTranslationState {
  isLoading: boolean;
  language: string;
  words: RootWord[];
  lostContext: string;
  fallbackText: string;
  selectedWordIndex: number | null;
}

export interface VerseContext {
  book: string;
  chapter: number;
  verses: number[];
}
