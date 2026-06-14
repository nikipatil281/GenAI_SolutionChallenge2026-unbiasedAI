import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { Storage } from '@google-cloud/storage';

const execFileAsync = promisify(execFile);
const storage = new Storage();
const RAG_BUCKET_NAME = process.env.RAG_BUCKET_NAME || 'genai-solution-challenge-knowledge-base';


const KNOWLEDGE_DIR = path.join(process.cwd(), 'knowledge');
const CACHE_PATH = path.join(KNOWLEDGE_DIR, '.rag-index.json');
const INDEX_VERSION = 1;
const MAX_CHUNK_CHARS = 1400;
const TARGET_CHUNK_CHARS = 950;

type KnowledgeFileSignature = {
  fileName: string;
  size: number;
  mtimeMs: number;
};

type CachedChunk = {
  id: string;
  title: string;
  fileName: string;
  pageNumber: number;
  chunkIndex: number;
  text: string;
};

type CachedKnowledgeIndex = {
  version: number;
  builtAt: string;
  fileSignatures: KnowledgeFileSignature[];
  chunks: CachedChunk[];
};

type IndexedChunk = CachedChunk & {
  normalizedText: string;
  tokenCounts: Record<string, number>;
  tokenCount: number;
};

type KnowledgeIndex = Omit<CachedKnowledgeIndex, 'chunks'> & {
  chunks: IndexedChunk[];
  documentFrequencies: Record<string, number>;
  averageChunkLength: number;
};

export type RetrievedKnowledgeChunk = {
  id: string;
  title: string;
  pageNumber: number;
  text: string;
  score: number;
};

let indexPromise: Promise<KnowledgeIndex | null> | null = null;

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can', 'do', 'does', 'for',
  'from', 'had', 'has', 'have', 'if', 'in', 'into', 'is', 'it', 'its', 'may', 'more', 'not',
  'of', 'on', 'or', 'our', 'should', 'so', 'such', 'than', 'that', 'the', 'their', 'them',
  'there', 'these', 'they', 'this', 'to', 'was', 'we', 'were', 'what', 'when', 'which', 'who',
  'with', 'would', 'you', 'your',
]);

function normalizeWhitespace(value: string) {
  return value
    .replace(/\u0000/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function tokenize(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ');

  return normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function buildTokenCounts(tokens: string[]) {
  const tokenCounts: Record<string, number> = {};
  tokens.forEach((token) => {
    tokenCounts[token] = (tokenCounts[token] || 0) + 1;
  });
  return tokenCounts;
}

function titleCaseIfNeeded(value: string) {
  if (!/[a-z]/.test(value)) {
    return value
      .toLowerCase()
      .replace(/\b([a-z])/g, (match) => match.toUpperCase())
      .replace(/\bAi\b/g, 'AI')
      .replace(/\bMl\b/g, 'ML')
      .replace(/\bNist\b/g, 'NIST');
  }
  return value;
}

function parsePdfInfo(stdout: string) {
  const metadata: Record<string, string> = {};
  stdout.split('\n').forEach((line) => {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      return;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key) {
      metadata[key] = value;
    }
  });
  return metadata;
}

function shouldSkipTitleLine(line: string) {
  return (
    !line ||
    /^https?:/i.test(line) ||
    /^doi:/i.test(line) ||
    /^doi\.org/i.test(line) ||
    /^journal homepage/i.test(line) ||
    /^n i s t special publication/i.test(line) ||
    /^review article/i.test(line) ||
    /^article history/i.test(line) ||
    /^available online/i.test(line) ||
    /^received\b/i.test(line) ||
    /^accepted\b/i.test(line) ||
    /^keywords?:/i.test(line) ||
    /^abstract$/i.test(line) ||
    /^\d+$/.test(line)
  );
}

function looksLikeAuthorOrAffiliation(line: string) {
  const tokens = line.split(/\s+/).filter(Boolean);
  const singleLetterTokens = tokens.filter((token) => /^[A-Z]$/.test(token)).length;

  return (
    /\bdepartment\b/i.test(line) ||
    /\buniversity\b/i.test(line) ||
    /\bmedical school\b/i.test(line) ||
    /\bcorresponding author/i.test(line) ||
    /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i.test(line) ||
    /^a\s/.test(line.toLowerCase()) ||
    /\* /.test(line) ||
    singleLetterTokens >= 2
  );
}

function extractTitleFromFirstPage(text: string, fallbackFileName: string) {
  const lines = text
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const abstractIndex = lines.findIndex((line) => /^abstract$/i.test(line));
  const candidateLines = lines.slice(0, abstractIndex > 0 ? Math.min(abstractIndex, 14) : 14);

  const titleLines: string[] = [];
  for (const line of candidateLines) {
    if (shouldSkipTitleLine(line)) {
      continue;
    }
    if (looksLikeAuthorOrAffiliation(line) && titleLines.length > 0) {
      break;
    }
    titleLines.push(line);
    if (titleLines.length >= 4) {
      break;
    }
  }

  if (titleLines.length > 0) {
    return titleCaseIfNeeded(titleLines.join(' ').replace(/\s+/g, ' ').trim());
  }

  return fallbackFileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
}

function splitIntoParagraphs(pageText: string) {
  return pageText
    .split(/\n\s*\n/g)
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter((paragraph) => paragraph.length >= 80);
}

function splitLongParagraph(paragraph: string) {
  if (paragraph.length <= MAX_CHUNK_CHARS) {
    return [paragraph];
  }

  const sentences = paragraph
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length <= 1) {
    const words = paragraph.split(/\s+/);
    const chunks: string[] = [];
    let current = '';

    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;
      if (next.length > MAX_CHUNK_CHARS && current) {
        chunks.push(current);
        current = word;
      } else {
        current = next;
      }
    });

    if (current) {
      chunks.push(current);
    }

    return chunks;
  }

  const chunks: string[] = [];
  let current = '';

  sentences.forEach((sentence) => {
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > MAX_CHUNK_CHARS && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  });

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function buildChunksForPage(title: string, fileName: string, pageNumber: number, pageText: string) {
  const paragraphs = splitIntoParagraphs(pageText);
  const pageChunks: CachedChunk[] = [];
  let current = '';
  let chunkIndex = 0;

  const flushCurrent = () => {
    const text = normalizeWhitespace(current);
    if (!text || text.length < 80) {
      current = '';
      return;
    }

    pageChunks.push({
      id: `${fileName}::${pageNumber}::${chunkIndex}`,
      title,
      fileName,
      pageNumber,
      chunkIndex,
      text,
    });
    chunkIndex += 1;
    current = '';
  };

  paragraphs.forEach((paragraph) => {
    splitLongParagraph(paragraph).forEach((segment) => {
      const next = current ? `${current}\n\n${segment}` : segment;
      if (next.length > MAX_CHUNK_CHARS && current.length >= TARGET_CHUNK_CHARS) {
        flushCurrent();
      }

      current = current ? `${current}\n\n${segment}` : segment;
      if (current.length >= TARGET_CHUNK_CHARS) {
        flushCurrent();
      }
    });
  });

  flushCurrent();
  return pageChunks;
}

function hydrateIndex(cachedIndex: CachedKnowledgeIndex): KnowledgeIndex {
  const documentFrequencies: Record<string, number> = {};
  let totalTokenCount = 0;

  const chunks = cachedIndex.chunks.map((chunk) => {
    const normalizedText = normalizeWhitespace(chunk.text);
    const tokens = tokenize(normalizedText);
    const tokenCounts = buildTokenCounts(tokens);
    totalTokenCount += tokens.length;

    Object.keys(tokenCounts).forEach((token) => {
      documentFrequencies[token] = (documentFrequencies[token] || 0) + 1;
    });

    return {
      ...chunk,
      normalizedText,
      tokenCounts,
      tokenCount: tokens.length,
    };
  });

  return {
    ...cachedIndex,
    chunks,
    documentFrequencies,
    averageChunkLength: chunks.length > 0 ? totalTokenCount / chunks.length : 0,
  };
}

async function getKnowledgeFileSignatures() {
  const entries = await fs.readdir(KNOWLEDGE_DIR, { withFileTypes: true });
  const pdfFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
    .map((entry) => entry.name)
    .sort();

  const signatures = await Promise.all(
    pdfFiles.map(async (fileName) => {
      const fullPath = path.join(KNOWLEDGE_DIR, fileName);
      const stats = await fs.stat(fullPath);
      return {
        fileName,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
      };
    })
  );

  return signatures;
}

function signaturesMatch(a: KnowledgeFileSignature[], b: KnowledgeFileSignature[]) {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((signature, index) => {
    const other = b[index];
    return (
      signature.fileName === other.fileName &&
      signature.size === other.size &&
      Math.round(signature.mtimeMs) === Math.round(other.mtimeMs)
    );
  });
}

async function readCacheFile() {
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as CachedKnowledgeIndex;
    if (parsed?.version !== INDEX_VERSION || !Array.isArray(parsed?.chunks) || !Array.isArray(parsed?.fileSignatures)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function commandExists(command: string) {
  try {
    await execFileAsync('which', [command]);
    return true;
  } catch {
    return false;
  }
}

async function buildIndexFromPdfs(fileSignatures: KnowledgeFileSignature[]) {
  const pdfinfoAvailable = await commandExists('pdfinfo');
  const pdftotextAvailable = await commandExists('pdftotext');

  if (!pdfinfoAvailable || !pdftotextAvailable) {
    throw new Error('pdfinfo/pdftotext not available');
  }

  const chunks: CachedChunk[] = [];

  for (const fileSignature of fileSignatures) {
    const fullPath = path.join(KNOWLEDGE_DIR, fileSignature.fileName);
    const [{ stdout: infoOutput }, { stdout: fullTextOutput }, { stdout: firstPageOutput }] = await Promise.all([
      execFileAsync('pdfinfo', [fullPath]),
      execFileAsync('pdftotext', ['-layout', fullPath, '-']),
      execFileAsync('pdftotext', ['-f', '1', '-l', '1', '-layout', fullPath, '-']),
    ]);

    const metadata = parsePdfInfo(infoOutput);
    const title = titleCaseIfNeeded(metadata.Title?.trim() || extractTitleFromFirstPage(firstPageOutput, fileSignature.fileName));
    const pageTexts = fullTextOutput.split('\f');

    pageTexts.forEach((pageText, pageIndex) => {
      const normalizedPageText = normalizeWhitespace(pageText);
      if (normalizedPageText.length < 120) {
        return;
      }
      chunks.push(...buildChunksForPage(title, fileSignature.fileName, pageIndex + 1, normalizedPageText));
    });
  }

  const cachedIndex: CachedKnowledgeIndex = {
    version: INDEX_VERSION,
    builtAt: new Date().toISOString(),
    fileSignatures,
    chunks,
  };

  await fs.writeFile(CACHE_PATH, JSON.stringify(cachedIndex, null, 2));
  return cachedIndex;
}

async function syncKnowledgeFromCloud() {
  try {
    await fs.mkdir(KNOWLEDGE_DIR, { recursive: true });
    const [files] = await storage.bucket(RAG_BUCKET_NAME).getFiles();
    
    let downloadedCount = 0;
    for (const file of files) {
      const destination = path.join(KNOWLEDGE_DIR, file.name);
      try {
        await fs.access(destination);
      } catch {
        await file.download({ destination });
        downloadedCount++;
      }
    }
    if (downloadedCount > 0) {
      console.log(`[RAG] Synced ${downloadedCount} new knowledge files from cloud bucket.`);
    }
  } catch (error) {
    console.warn('[RAG] Failed to sync knowledge from cloud bucket. Falling back to local files if they exist:', error);
  }
}

async function loadKnowledgeIndex() {
  await syncKnowledgeFromCloud();
  
  const fileSignatures = await getKnowledgeFileSignatures();
  const cachedIndex = await readCacheFile();

  if (cachedIndex && signaturesMatch(cachedIndex.fileSignatures, fileSignatures)) {
    return hydrateIndex(cachedIndex);
  }

  try {
    const rebuiltIndex = await buildIndexFromPdfs(fileSignatures);
    return hydrateIndex(rebuiltIndex);
  } catch (error) {
    if (cachedIndex) {
      console.warn('[RAG] Falling back to existing cached knowledge index:', error);
      return hydrateIndex(cachedIndex);
    }
    console.warn('[RAG] Knowledge index unavailable:', error);
    return null;
  }
}

async function getKnowledgeIndex() {
  if (!indexPromise) {
    indexPromise = loadKnowledgeIndex();
  }
  return indexPromise;
}

function computeChunkScore(chunk: IndexedChunk, queryTokens: string[], documentFrequencies: Record<string, number>, totalChunks: number, averageChunkLength: number) {
  if (queryTokens.length === 0 || chunk.tokenCount === 0) {
    return 0;
  }

  const lowerText = chunk.normalizedText.toLowerCase();
  const lowerTitle = chunk.title.toLowerCase();
  let score = 0;

  queryTokens.forEach((token) => {
    const tf = chunk.tokenCounts[token] || 0;
    if (!tf) {
      return;
    }
    const df = documentFrequencies[token] || 0;
    const idf = Math.log(1 + (totalChunks - df + 0.5) / (df + 0.5));
    score += tf * idf;
  });

  const normalizedLength = averageChunkLength > 0 ? chunk.tokenCount / averageChunkLength : 1;
  score = score / Math.sqrt(Math.max(normalizedLength, 0.5));

  const uniqueTokens = Array.from(new Set(queryTokens));
  const titleMatches = uniqueTokens.filter((token) => lowerTitle.includes(token)).length;
  const textMatches = uniqueTokens.filter((token) => lowerText.includes(token)).length;

  score += titleMatches * 1.25;
  score += textMatches * 0.15;

  return score;
}

export async function retrieveKnowledgeChunks(query: string, maxResults = 5): Promise<RetrievedKnowledgeChunk[]> {
  const index = await getKnowledgeIndex();
  if (!index) {
    return [];
  }

  const queryTokens = tokenize(query).slice(0, 80);
  if (queryTokens.length === 0) {
    return [];
  }

  const scoredChunks = index.chunks
    .map((chunk) => ({
      chunk,
      score: computeChunkScore(
        chunk,
        queryTokens,
        index.documentFrequencies,
        index.chunks.length,
        index.averageChunkLength
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const selected: RetrievedKnowledgeChunk[] = [];
  const seenKeys = new Set<string>();

  for (const entry of scoredChunks) {
    const dedupeKey = `${entry.chunk.title}::${entry.chunk.pageNumber}`;
    if (seenKeys.has(dedupeKey)) {
      continue;
    }
    seenKeys.add(dedupeKey);
    selected.push({
      id: entry.chunk.id,
      title: entry.chunk.title,
      pageNumber: entry.chunk.pageNumber,
      text: entry.chunk.text,
      score: entry.score,
    });
    if (selected.length >= maxResults) {
      break;
    }
  }

  return selected;
}

export function formatKnowledgeGrounding(chunks: RetrievedKnowledgeChunk[]) {
  if (chunks.length === 0) {
    return '';
  }

  return chunks
    .map((chunk, index) => {
      return [
        `Source ${index + 1}`,
        `Title: ${chunk.title}`,
        `Page: ${chunk.pageNumber}`,
        `Excerpt: ${chunk.text}`,
      ].join('\n');
    })
    .join('\n\n---\n\n');
}

export async function warmKnowledgeBase() {
  await getKnowledgeIndex();
}
