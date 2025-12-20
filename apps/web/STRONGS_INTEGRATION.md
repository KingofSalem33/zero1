# Strong's Concordance Integration

## Phase 1: Data Foundation ✅ COMPLETE

### Data Source

- **Repository**: kaiserlik/kjv (GitHub)
- **License**: Public Domain (KJV 1769 + Strong's Concordance 1890)
- **Format**: JSON with embedded Strong's numbers
- **Size**: 78MB total (66 books + lexicon)

### What Was Downloaded

1. **66 Bible Books** (`/public/bible/strongs/*.json`)
   - All Old Testament (Hebrew Strong's: H1-H8674)
   - All New Testament (Greek Strong's: G1-G5624)
   - Format: `word[H1234]` or `word[G5678]` embedded inline

2. **Combined Lexicon** (`/public/bible/strongs/lexicon.json`)
   - 6.1MB dictionary file
   - Contains both Hebrew and Greek definitions
   - Structure:
     ```json
     {
       "H1": {
         "Hb_word": "אָב",
         "transliteration": "'āḇ",
         "strongs_def": "father, in a literal...",
         "part_of_speech": "masculine noun",
         "root_word": "primitive root",
         "occurrences": "chief(2x), families(2x)...",
         "outline_usage": "father of an individual..."
       },
       "G1722": {
         "Gk_word": "ἐν",
         "transliteration": "en",
         "strongs_def": "in, by, with...",
         ...
       }
     }
     ```

### Utility Functions Created

File: `/apps/web/src/utils/strongsConcordance.ts`

**Core Functions:**

- `extractStrongsWords(text)` - Parse verse to extract words with Strong's numbers
- `getStrongsVerse(book, chapter, verse)` - Fetch specific verse with Strong's
- `getStrongsVerses(book, chapter, start, end)` - Fetch multiple verses
- `extractUniqueStrongsNumbers(text)` - Get all unique Strong's in passage
- `getStrongsDefinitions(numbers[])` - Load lexicon entries
- `stripStrongsNumbers(text)` - Remove Strong's tags for clean reading
- `smartTruncate(verses[], maxWords)` - Intelligent truncation to complete verses
- `countWords(text)` - Count words for 100-word cap
- `detectLanguage(numbers[])` - Determine Hebrew/Greek/Mixed

**Mappings:**

- `BOOK_TO_ABBREV` - "John" → "Jhn", "Genesis" → "Gen", etc.
- `ABBREV_TO_BOOK` - Reverse mapping

### Example Data Structure

**Verse Format (John 1:1):**

```json
{
  "Jhn": {
    "Jhn|1": {
      "Jhn|1|1": {
        "en": "In[G1722] the[G3588] beginning[G746] was[G2258] the Word[G3056]...",
        "bg": "В начало бе Словото...",
        "ch": "太初有道...",
        "sp": "EN el principio era el Verbo..."
      }
    }
  }
}
```

**Lexicon Entry (G1722 - "en"):**

```json
{
  "Gk_word": "ἐν",
  "transliteration": "en",
  "strongs_def": "in, by, with...",
  "part_of_speech": "preposition",
  "root_word": "primitive root",
  "occurrences": "in(1902x), by(141x)...",
  "outline_usage": "in, by, with (various contexts)"
}
```

## Phase 2: ROOT Feature Implementation ✅ COMPLETE

### UI Components to Build

1. **ROOT Button in TextHighlightTooltip**
   - Add next to "Go Deeper" button
   - Only visible when `enableHighlight=true`
   - Icon: 🔤 or linguistics symbol

2. **View Toggle State**
   - Track current view: "synopsis" | "root"
   - X button to return to synopsis from root view
   - Smooth transitions between views

3. **Translation Display**
   - Loading state: "Translating from original [Greek/Hebrew]..."
   - Stream translation word by word (30ms delay)
   - Show language indicator during load

### Backend API Endpoint

File: `/apps/api/src/routes/root-translation.ts` (to be created)

**Endpoint:** `POST /api/root-translation`

**Request:**

```json
{
  "book": "John",
  "chapter": 1,
  "verse": 1,
  "selectedText": "In the beginning was the Word",
  "maxWords": 100
}
```

**Response (Streaming):**

```json
{
  "translation": "From the Greek: In [ἐν - en] means 'in, within'...",
  "language": "greek",
  "strongsUsed": ["G1722", "G3588", "G746", "G2258", "G3056"],
  "versesIncluded": 1,
  "totalWords": 28
}
```

**Logic:**

1. Detect verse location from `selectedText`
2. Load verse(s) from Strong's Bible
3. Extract Strong's numbers
4. Load definitions from lexicon
5. Build LLM prompt with grounding data
6. Call LLM with 100-word cap enforcement
7. Smart truncate to complete verses
8. Stream response back to client

### Implementation Checklist

- [x] Add ROOT button to TextHighlightTooltip
- [x] Implement view toggle (synopsis ↔ root)
- [x] Create /api/root-translation endpoint
- [x] Build LLM prompt with Strong's grounding
- [x] Add streaming support (word-by-word animation)
- [x] Implement 100-word cap with smart truncate
- [x] Add language detection and display
- [x] Handle error states gracefully
- [x] In-memory lexicon caching for performance
- [ ] Test with various passages (OT Hebrew, NT Greek) - **READY FOR TESTING**

### Design Decisions Made

✅ Use ALL words (not selective) for accuracy
✅ 100-word cap with smart truncate to complete verses
✅ Stream translation text with language indicator
✅ Loading text: "Translating from original [Greek/Hebrew]..."
✅ Toggle pattern: Synopsis ↔ ROOT (with X button to return)
✅ No caching for now (may add later)

## Testing

- **Test file**: `/apps/web/test-strongs.html`
- Open in browser to verify utility functions
- All core parsing and data loading tested

## Phase 2 Implementation Summary

### Frontend Changes

**File:** `apps/web/src/components/TextHighlightTooltip.tsx`

**New State:**

- `viewMode`: Toggle between "synopsis" and "root" views
- `rootTranslation`: Stores the Strong's-based translation
- `rootLanguage`: Hebrew/Greek language indicator
- `isLoadingRoot`: Loading state for root translation

**New Functions:**

- `generateRootTranslation()`: Calls backend API with selectedText
- `handleRootTranslation()`: Switches to root view and triggers translation
- `handleBackToSynopsis()`: Returns to synopsis view with X button

**UI Updates:**

- Added ROOT button (translation icon) next to "Go Deeper"
- Conditional rendering: Synopsis view OR Root view
- Loading state: "Translating from original [Hebrew/Greek]..."
- Streaming word-by-word animation (30ms delay)
- Back button to return to synopsis

### Backend Changes

**File:** `apps/api/src/routes/root-translation.ts` (NEW)

**Features:**

- Loads Strong's Concordance lexicon (6.1MB) with in-memory caching
- Searches Bible books to match selected text with verse containing Strong's numbers
- Extracts all Strong's numbers from matched verse
- Loads definitions for each Strong's number
- Builds grounding prompt with original words, transliterations, definitions
- Calls LLM (GPT-4o-mini) with grounding data to generate translation
- Returns translation with language indicator

**Smart Path Resolution:**

- `findStrongsDataPath()`: Tries multiple paths to locate data in monorepo
- Works from both API package and monorepo root
- Cached after first successful lookup

**Endpoint:** `POST /api/root-translation`

- Rate limited (readOnlyLimiter)
- Optional auth
- Input: `{ selectedText, maxWords: 100 }`
- Output: `{ translation, language, strongsUsed, versesIncluded, totalWords }`

**File:** `apps/api/src/index.ts`

- Imported and registered root-translation router at `/api/root-translation`

### Data Files

- **Location:** `/public/bible/strongs/`
- **Total:** 68 files (66 books + lexicon.json + test file)
- **Size:** 78MB
- **Accessible by:** Both web frontend and API backend

## Testing Instructions

### Manual Testing

1. Start the dev servers:

   ```bash
   npm run dev:api  # Terminal 1
   npm run dev      # Terminal 2 (web)
   ```

2. Open the Bible Reader
3. Select text from a Bible verse
4. Click the **ROOT** button in the tooltip
5. Observe:
   - Loading state: "Translating from original [Hebrew/Greek]..."
   - Translation streams in word-by-word
   - Language is detected (Hebrew for OT, Greek for NT)
   - "Back to synopsis" button returns to original view

### Test Cases

- **Hebrew (OT):** Select text from Genesis, Psalms, Isaiah
- **Greek (NT):** Select text from John, Romans, Matthew
- **Error handling:** Select non-Bible text (should show fallback message)
- **View toggle:** Switch between synopsis and root multiple times
- **Close tooltip:** Verify state resets properly

### Known Limitations (MVP)

1. **Verse matching** is simplified - searches common books only (Jhn, Gen, Psa, Mat, Rom)
   - Future: Frontend should pass book/chapter/verse context
2. **No multi-verse context** - translates single matched verse only
   - Future: Load surrounding verses for better context
3. **No caching** of translations (intentional for now)
4. **Search is literal match** - may miss slight variations in text
   - Future: Fuzzy matching or passage range detection

## Next Steps

- **User testing** to gather feedback on ROOT translations
- **Expand book search** to all 66 books (or pass context from frontend)
- **Add verse range detection** for multi-verse highlights
- **Performance monitoring** - track API response times
- **Consider caching** frequently requested translations
- **Analytics** - track ROOT button usage and most-translated passages
