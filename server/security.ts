import AdmZip from 'adm-zip';
import crypto from 'crypto';
import type {NextFunction, Request, Response} from 'express';
import mime from 'mime-types';
import path from 'path';

export interface UploadLimits {
  maxUploadBytes: number;
  maxSingleFileBytes: number;
  maxFilesPerSite: number;
  maxCompressionRatio: number;
}

export const DEFAULT_UPLOAD_LIMITS: UploadLimits = {
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES) || 50 * 1024 * 1024, // 50 MB
  maxSingleFileBytes: Number(process.env.MAX_SINGLE_FILE_BYTES) || 15 * 1024 * 1024, // 15 MB
  maxFilesPerSite: Number(process.env.MAX_FILES_PER_SITE) || 250,
  maxCompressionRatio: 100,
};

export const ALLOWED_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.txt',
  '.xml',
  '.webmanifest',
  '.map',
  '.md',
]);

export const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.sh',
  '.bash',
  '.bat',
  '.cmd',
  '.ps1',
  '.vbs',
  '.php',
  '.phtml',
  '.py',
  '.rb',
  '.pl',
  '.cgi',
  '.jar',
  '.apk',
  '.msi',
  '.dmg',
]);

export interface ValidatedFile {
  path: string;
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export function isIgnoredSystemFile(rawPath: string): boolean {
  const normalized = rawPath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) return true;
  if (segments[0] === '__MACOSX') return true;
  const base = segments[segments.length - 1];
  return base === '.DS_Store' || base === 'Thumbs.db' || base === 'desktop.ini';
}

export function sanitizeRelativePath(rawPath: string): string {
  if (!rawPath || typeof rawPath !== 'string') {
    throw new Error('File path cannot be empty.');
  }
  if (rawPath.includes('\0')) {
    throw new Error(`Invalid null byte in file path: ${rawPath}`);
  }
  if (rawPath.length > 512) {
    throw new Error(`File path exceeds maximum length (512 chars): ${rawPath.slice(0, 64)}`);
  }
  const normalized = rawPath.replace(/\\/g, '/').trim();
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error(`Absolute paths are not permitted: ${rawPath}`);
  }
  const segments = normalized.split('/').filter((seg) => seg.length > 0);
  if (segments.length === 0) {
    throw new Error('Empty relative file path.');
  }
  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      throw new Error(`Path traversal sequence detected in "${rawPath}".`);
    }
  }
  return segments.join('/');
}

export function getSafeMimeType(filePath: string): string {
  const ext = path.posix.extname(filePath).toLowerCase();
  if (ext === '.html' || ext === '.htm') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js' || ext === '.mjs') return 'application/javascript; charset=utf-8';
  if (ext === '.json' || ext === '.webmanifest') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.txt' || ext === '.md') return 'text/plain; charset=utf-8';
  const lookup = mime.lookup(ext);
  return typeof lookup === 'string' ? lookup : 'application/octet-stream';
}

export function validateExtension(filePath: string): void {
  const ext = path.posix.extname(filePath).toLowerCase();
  if (!ext) {
    throw new Error(`File "${filePath}" has no file extension.`);
  }
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new Error(`Blocked file type "${ext}" for security reasons (${filePath}).`);
  }
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file type "${ext}" (${filePath}).`);
  }
}

export function validateSingleFile(
  rawPath: string,
  buffer: Buffer,
  limits: UploadLimits = DEFAULT_UPLOAD_LIMITS,
): ValidatedFile {
  const cleanPath = sanitizeRelativePath(rawPath);
  validateExtension(cleanPath);
  if (buffer.length > limits.maxSingleFileBytes) {
    throw new Error(
      `File "${cleanPath}" (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds max single file size.`,
    );
  }
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  return {
    path: cleanPath,
    buffer,
    mimeType: getSafeMimeType(cleanPath),
    sizeBytes: buffer.length,
    sha256,
  };
}

export function normalizeRootFolder(files: ValidatedFile[]): ValidatedFile[] {
  const hasRootIndex = files.some((f) => f.path.toLowerCase() === 'index.html');
  if (hasRootIndex || files.length === 0) {
    return files;
  }

  // Check if all files are nested inside a single top-level directory (common when zipping a folder)
  const firstSegments = new Set(files.map((f) => f.path.split('/')[0]));
  if (firstSegments.size === 1) {
    const prefix = `${Array.from(firstSegments)[0]}/`;
    const allNested = files.every((f) => f.path.startsWith(prefix));
    if (allNested) {
      const stripped = files.map((f) => ({
        ...f,
        path: f.path.slice(prefix.length),
      }));
      if (stripped.some((f) => f.path.toLowerCase() === 'index.html')) {
        return stripped;
      }
    }
  }
  return files;
}

export function extractAndValidateZip(
  zipBuffer: Buffer,
  limits: UploadLimits = DEFAULT_UPLOAD_LIMITS,
): ValidatedFile[] {
  if (zipBuffer.length > limits.maxUploadBytes) {
    throw new Error(
      `ZIP archive exceeds maximum allowed upload size of ${(limits.maxUploadBytes / (1024 * 1024)).toFixed(0)} MB.`,
    );
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    throw new Error('Corrupted or invalid ZIP archive.');
  }

  const entries = zip.getEntries();
  let totalUncompressed = 0;
  let fileCount = 0;

  for (const entry of entries) {
    if (entry.isDirectory || isIgnoredSystemFile(entry.entryName)) {
      continue;
    }
    fileCount += 1;
    if (fileCount > limits.maxFilesPerSite) {
      throw new Error(`Archive contains more than ${limits.maxFilesPerSite} files.`);
    }

    const declaredSize = entry.header.size;
    const compressedSize = Math.max(1, entry.header.compressedSize);
    if (declaredSize > limits.maxSingleFileBytes) {
      throw new Error(`Entry "${entry.entryName}" exceeds single file size limit.`);
    }
    if (declaredSize > 10 * 1024 && declaredSize / compressedSize > limits.maxCompressionRatio) {
      throw new Error(`Potential ZIP bomb detected in "${entry.entryName}" (compression ratio exceeded).`);
    }
    totalUncompressed += declaredSize;
    if (totalUncompressed > limits.maxUploadBytes) {
      throw new Error(
        `Extracted archive size exceeds maximum limit of ${(limits.maxUploadBytes / (1024 * 1024)).toFixed(0)} MB.`,
      );
    }
  }

  if (fileCount === 0) {
    throw new Error('ZIP archive does not contain any valid files.');
  }

  const extracted: ValidatedFile[] = [];
  let actualTotal = 0;
  const seenPaths = new Set<string>();

  for (const entry of entries) {
    if (entry.isDirectory || isIgnoredSystemFile(entry.entryName)) {
      continue;
    }
    const cleanPath = sanitizeRelativePath(entry.entryName);
    validateExtension(cleanPath);
    const data = entry.getData();
    actualTotal += data.length;
    if (actualTotal > limits.maxUploadBytes || data.length > limits.maxSingleFileBytes) {
      throw new Error('Extracted ZIP size exceeded security limits.');
    }
    if (!seenPaths.has(cleanPath)) {
      seenPaths.add(cleanPath);
      extracted.push(validateSingleFile(cleanPath, data, limits));
    }
  }

  return normalizeRootFolder(extracted);
}

export function validateBatchFiles(
  rawFiles: Array<{path: string; buffer: Buffer}>,
  limits: UploadLimits = DEFAULT_UPLOAD_LIMITS,
): ValidatedFile[] {
  if (rawFiles.length === 0) {
    throw new Error('No files were provided for upload.');
  }

  const filtered = rawFiles.filter((f) => !isIgnoredSystemFile(f.path));
  if (filtered.length > limits.maxFilesPerSite) {
    throw new Error(`Upload exceeds maximum limit of ${limits.maxFilesPerSite} files per site.`);
  }

  let totalBytes = 0;
  const deduped = new Map<string, ValidatedFile>();

  for (const item of filtered) {
    const validated = validateSingleFile(item.path, item.buffer, limits);
    totalBytes += validated.sizeBytes;
    if (totalBytes > limits.maxUploadBytes) {
      throw new Error(
        `Total upload size exceeds ${(limits.maxUploadBytes / (1024 * 1024)).toFixed(0)} MB limit.`,
      );
    }
    deduped.set(validated.path, validated);
  }

  const result = normalizeRootFolder(Array.from(deduped.values()));
  const hasIndex = result.some((f) => f.path.toLowerCase() === 'index.html');
  if (!hasIndex) {
    throw new Error('Missing required entry file "index.html" at the root of your website.');
  }
  return result;
}

const rateBuckets = new Map<string, number[]>();

export function createRateLimiter(bucketName: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${bucketName}:${ip}`;
    const now = Date.now();
    const timestamps = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
    if (timestamps.length >= maxRequests) {
      res.status(429).json({
        error: 'Too many requests. Please wait a moment and try again.',
      });
      return;
    }
    timestamps.push(now);
    rateBuckets.set(key, timestamps);
    next();
  };
}
