/**
 * Bible Types and Interfaces
 */

export interface VerseRef {
  book: string;
  chapter: number;
  verse: number;
}

export interface Verse extends VerseRef {
  text: string;
}

export interface Book {
  abbrev: string;
  name: string;
  chapters: string[][];
}

export interface QuestionAnalysis {
  topics: string[];
  keywords: string[];
  explicitReferences: string[];
}

export interface AnchorVerse extends VerseRef {
  reason: string;
}

export interface CrossRefBundle {
  anchor: Verse;
  refs: Verse[];
}
