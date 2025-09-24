import formidable from "formidable";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type { Request, Response } from "express";

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
    await ensureDataDir();

    const form = formidable({
      uploadDir: DATA_DIR,
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
    });

    const [, files] = await form.parse(req);

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
    await fs.rename(uploadedFile.filepath, newFilePath);

    // Get file stats
    const stats = await fs.stat(newFilePath);

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
    const index = await loadFileIndex();
    index[fileId] = fileMetadata;
    await saveFileIndex(index);

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
