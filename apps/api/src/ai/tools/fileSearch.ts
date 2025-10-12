import { listFiles, readFileContent } from "../../files";
import type { FileSearchParams } from "../schemas";

export interface FileSearchResult {
  file: string;
  name: string;
  excerpt: string;
  score: number;
}

export interface FileSearchResponse {
  query: string;
  results: FileSearchResult[];
}

// Create text chunks from content (lazy generator to save memory)
function* createChunksLazy(
  content: string,
  chunkSize = 2000,
  overlap = 200,
): Generator<string> {
  let start = 0;

  while (start < content.length) {
    const end = Math.min(start + chunkSize, content.length);
    yield content.slice(start, end);
    start = end - overlap;
  }
}

// Simple TF-IDF-like scoring
function calculateRelevanceScore(query: string, text: string): number {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const textLower = text.toLowerCase();

  let score = 0;
  const textWords = textLower.split(/\s+/);

  for (const term of queryTerms) {
    // Count occurrences
    const termCount = (textLower.match(new RegExp(term, "g")) || []).length;
    if (termCount > 0) {
      // Simple TF score with diminishing returns
      score += Math.log(1 + termCount);

      // Bonus for exact phrase matches
      if (textLower.includes(query.toLowerCase())) {
        score += 2;
      }
    }
  }

  // Normalize by text length
  return score / Math.max(1, Math.log(textWords.length));
}

// Check if file type is supported for text extraction
function isTextFile(mime: string, fileName: string): boolean {
  const textMimes = [
    "text/",
    "application/json",
    "application/xml",
    "application/javascript",
    "application/csv",
  ];

  const textExtensions = [
    ".txt",
    ".md",
    ".csv",
    ".json",
    ".xml",
    ".html",
    ".js",
    ".ts",
    ".py",
    ".java",
    ".cpp",
    ".c",
    ".h",
  ];

  return (
    textMimes.some((m) => mime.startsWith(m)) ||
    textExtensions.some((ext) => fileName.toLowerCase().endsWith(ext))
  );
}

export async function file_search(
  params: FileSearchParams,
): Promise<FileSearchResponse> {
  const { query, topK = 5 } = params;

  // Memory safety: limit max file size and chunk processing
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file
  const MAX_CHUNK_COUNT = 100; // Max chunks to process per file
  const CHUNK_SIZE = 2000;
  const CHUNK_OVERLAP = 200;

  try {
    // Get all uploaded files
    const files = await listFiles();
    const results: FileSearchResult[] = [];

    for (const file of files) {
      // Skip non-text files for now (PDF support could be added later)
      if (!isTextFile(file.mime, file.name)) {
        continue;
      }

      // Memory safety: skip files that are too large
      if (file.bytes > MAX_FILE_SIZE) {
        console.warn(
          `Skipping large file ${file.name} (${file.bytes} bytes > ${MAX_FILE_SIZE} limit)`,
        );
        continue;
      }

      try {
        // Read file content
        const content = await readFileContent(file);
        if (!content.trim()) continue;

        // Memory safety: limit content size after reading
        const truncatedContent =
          content.length > MAX_FILE_SIZE
            ? content.substring(0, MAX_FILE_SIZE)
            : content;

        // ✅ Use lazy generator to process chunks one at a time (memory efficient)
        let bestScore = 0;
        let bestExcerpt = "";
        let chunkCount = 0;

        for (const chunk of createChunksLazy(
          truncatedContent,
          CHUNK_SIZE,
          CHUNK_OVERLAP,
        )) {
          if (chunkCount >= MAX_CHUNK_COUNT) {
            console.warn(
              `File ${file.name} exceeded ${MAX_CHUNK_COUNT} chunks, stopping early`,
            );
            break;
          }

          const score = calculateRelevanceScore(query, chunk);
          if (score > bestScore) {
            bestScore = score;
            bestExcerpt =
              chunk.length > 200 ? chunk.substring(0, 200) + "..." : chunk;
          }

          chunkCount++;
          // Chunk is immediately GC'd after each iteration - no memory buildup
        }

        // Only include results with some relevance
        if (bestScore > 0) {
          results.push({
            file: file.id,
            name: file.name,
            excerpt: bestExcerpt,
            score: bestScore,
          });
        }

        // Memory safety: keep only top results to avoid unbounded growth
        if (results.length > topK * 10) {
          results.sort((a, b) => b.score - a.score);
          results.splice(topK * 5); // Keep 5x the needed results as buffer
        }
      } catch (error) {
        console.error(`Failed to process file ${file.id}:`, error);
        // Continue processing other files instead of crashing
      }
    }

    // Sort by score and limit results
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, topK);

    console.log(
      `File search for "${query}" returned ${topResults.length} results from ${files.length} files`,
    );

    return {
      query,
      results: topResults,
    };
  } catch (error) {
    console.error("File search error:", error);
    return {
      query,
      results: [],
    };
  }
}
