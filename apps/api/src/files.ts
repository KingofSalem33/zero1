import formidable from "formidable";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type { Request, Response } from "express";
import { getProfiler, profileTime } from "./profiling/requestProfiler";

export interface FileMetadata {
  id: string;
  name: string;
  bytes: number;
  mime: string;
  uploadedAt: string;
  path: string;
}

export interface FileIndex {
  [id: string]: FileMetadata;
}

const DATA_DIR = path.join(process.cwd(), "data");
const INDEX_FILE = path.join(DATA_DIR, ".index.json");

// Ensure data directory exists
export async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// Load file index
export async function loadFileIndex(): Promise<FileIndex> {
  try {
    const indexData = await fs.readFile(INDEX_FILE, "utf-8");
    return JSON.parse(indexData);
  } catch {
    return {};
  }
}

// Save file index
export async function saveFileIndex(index: FileIndex): Promise<void> {
  await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
}

// Generate unique file ID
function generateFileId(): string {
  return crypto.randomBytes(16).toString("hex");
}

// Handle file upload
export async function handleFileUpload(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("files_upload");
    profiler?.markHandlerStart();

    await profileTime("files.ensureDataDir", () => ensureDataDir(), {
      file: "files.ts",
      fn: "ensureDataDir",
      await: "ensureDataDir",
    });

    const form = formidable({
      uploadDir: DATA_DIR,
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
    });

    const [, files] = await profileTime(
      "files.formParse",
      () => form.parse(req),
      { file: "files.ts", fn: "formidable.parse", await: "form.parse" },
    );

    if (!files.file || !Array.isArray(files.file) || files.file.length === 0) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const uploadedFile = files.file[0];
    const fileId = generateFileId();
    const fileName = uploadedFile.originalFilename || "untitled";
    const fileExtension = path.extname(fileName);
    const newFileName = `${fileId}${fileExtension}`;
    const newFilePath = path.join(DATA_DIR, newFileName);

    // Move uploaded file to final location
    await profileTime(
      "files.rename",
      () => fs.rename(uploadedFile.filepath, newFilePath),
      { file: "files.ts", fn: "fs.rename", await: "fs.rename" },
    );

    // Get file stats
    const stats = await profileTime("files.stat", () => fs.stat(newFilePath), {
      file: "files.ts",
      fn: "fs.stat",
      await: "fs.stat",
    });

    // Create file metadata
    const fileMetadata: FileMetadata = {
      id: fileId,
      name: fileName,
      bytes: stats.size,
      mime: uploadedFile.mimetype || "application/octet-stream",
      uploadedAt: new Date().toISOString(),
      path: newFilePath,
    };

    // Update index
    const index = await profileTime(
      "files.loadFileIndex",
      () => loadFileIndex(),
      { file: "files.ts", fn: "loadFileIndex", await: "loadFileIndex" },
    );
    index[fileId] = fileMetadata;
    await profileTime("files.saveFileIndex", () => saveFileIndex(index), {
      file: "files.ts",
      fn: "saveFileIndex",
      await: "saveFileIndex",
    });

    console.log(`File uploaded: ${fileName} (${fileId})`);

    res.json({
      id: fileMetadata.id,
      name: fileMetadata.name,
      bytes: fileMetadata.bytes,
      mime: fileMetadata.mime,
    });
  } catch (error) {
    console.error("File upload error:", error);
    res.status(500).json({ error: "File upload failed" });
  }
}

// Get all files
export async function listFiles(): Promise<FileMetadata[]> {
  const index = await loadFileIndex();
  return Object.values(index);
}

// Get file by ID
export async function getFileById(id: string): Promise<FileMetadata | null> {
  const index = await loadFileIndex();
  return index[id] || null;
}

// Read file content (for text files)
export async function readFileContent(file: FileMetadata): Promise<string> {
  try {
    const content = await fs.readFile(file.path, "utf-8");
    return content;
  } catch (error) {
    console.error(`Failed to read file ${file.id}:`, error);
    return "";
  }
}

// Delete file
export async function deleteFile(id: string): Promise<boolean> {
  try {
    const index = await loadFileIndex();
    const file = index[id];

    if (!file) {
      return false;
    }

    // Delete physical file
    try {
      await fs.unlink(file.path);
    } catch (error) {
      console.error(`Failed to delete file ${id}:`, error);
    }

    // Remove from index
    delete index[id];
    await saveFileIndex(index);

    console.log(`File deleted: ${file.name} (${id})`);
    return true;
  } catch (error) {
    console.error(`Error deleting file ${id}:`, error);
    return false;
  }
}
