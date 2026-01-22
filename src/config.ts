import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";

export const MODEL_IDS = {
  embed: "onnx-community/granite-embedding-30m-english-ONNX",
  colbert: "ryandono/mxbai-edge-colbert-v0-17m-onnx-int8",
};

const DEFAULT_WORKER_THREADS = (() => {
  const fromEnv = Number.parseInt(process.env.OSGREP_WORKER_THREADS ?? "", 10);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;

  const cores = os.cpus().length || 1;
  const HARD_CAP = 4;
  return Math.max(1, Math.min(HARD_CAP, cores));
})();

export const CONFIG = {
  VECTOR_DIM: 384,
  COLBERT_DIM: 48,
  MAX_CHUNK_CHARS: 2000,
  MAX_CHUNK_LINES: 75,
  EMBED_BATCH_SIZE: 24,
  WORKER_THREADS: DEFAULT_WORKER_THREADS,
  QUERY_PREFIX: "",
};

export const WORKER_TIMEOUT_MS = Number.parseInt(
  process.env.OSGREP_WORKER_TIMEOUT_MS || "60000",
  10,
);

export const WORKER_BOOT_TIMEOUT_MS = Number.parseInt(
  process.env.OSGREP_WORKER_BOOT_TIMEOUT_MS || "300000",
  10,
);

export const MAX_WORKER_MEMORY_MB = Number.parseInt(
  process.env.OSGREP_MAX_WORKER_MEMORY_MB ||
    String(
      Math.max(
        2048,
        Math.floor((os.totalmem() / 1024 / 1024) * 0.5), // 50% of system RAM
      ),
    ),
  10,
);

const HOME = os.homedir();
const GLOBAL_ROOT = path.join(HOME, ".osgrep");

export const PATHS = {
  globalRoot: GLOBAL_ROOT,
  models: path.join(GLOBAL_ROOT, "models"),
  grammars: path.join(GLOBAL_ROOT, "grammars"),
};

export const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 2; // 2MB limit for indexing

// Conversion cache directory (inside project's .osgrep)
export const CONVERTED_DIR = "converted";

// Conversion storage mode type
export type ConversionStorageMode = "cache" | "alongside";

// Load user config from ~/.osgrep/config.json (lazy, cached)
interface UserConfigWhisper {
  apiUrl?: string;
  authToken?: string;
  youtubeApiUrl?: string;
}

interface UserConfigConversion {
  storageMode?: ConversionStorageMode;
}

let _userConfigCache: { whisper?: UserConfigWhisper; conversion?: UserConfigConversion } | null = null;

function loadUserConfigSync(): { whisper?: UserConfigWhisper; conversion?: UserConfigConversion } {
  if (_userConfigCache !== null) return _userConfigCache;

  const configPath = path.join(os.homedir(), ".osgrep", "config.json");
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf-8");
      _userConfigCache = JSON.parse(content);
      return _userConfigCache ?? {};
    }
  } catch {
    // Ignore errors, return empty config
  }
  _userConfigCache = {};
  return _userConfigCache;
}

/**
 * Get the conversion storage mode (defaults to "cache")
 */
export function getConversionStorageMode(): ConversionStorageMode {
  return loadUserConfigSync().conversion?.storageMode ?? "cache";
}

// Whisper API configuration for audio/video transcription
// Priority: environment variables > user config file (~/.osgrep/config.json)
export const WHISPER_CONFIG = {
  get apiUrl(): string {
    return process.env.WHISPER_API_URL || loadUserConfigSync().whisper?.apiUrl || "";
  },
  get authToken(): string {
    return process.env.WHISPER_AUTH_TOKEN || loadUserConfigSync().whisper?.authToken || "";
  },
  get youtubeApiUrl(): string {
    return process.env.WHISPER_YOUTUBE_API_URL || loadUserConfigSync().whisper?.youtubeApiUrl || "";
  },
  get isConfigured(): boolean {
    return Boolean(this.apiUrl && this.authToken);
  },
};

// Audio/video extensions (only processed if WHISPER_CONFIG.isConfigured)
export const AUDIO_EXTENSIONS: Set<string> = new Set([
  ".mp3",
  ".wav",
  ".flac",
  ".ogg",
  ".m4a",
  ".aac",
  ".wma",
]);

export const VIDEO_EXTENSIONS: Set<string> = new Set([
  ".mp4",
  ".mkv",
  ".webm",
  ".avi",
  ".mov",
  ".wmv",
  ".flv",
]);

// Windows shortcut extensions (for YouTube URL detection)
export const SHORTCUT_EXTENSIONS: Set<string> = new Set([
  ".url", // Internet shortcut (INI format)
  ".lnk", // Windows shortcut (binary format)
]);

// Document formats that can be converted to markdown before indexing
const BASE_CONVERTIBLE_EXTENSIONS: string[] = [
  // Documents
  ".pdf",
  ".docx",
  ".xlsx",
  ".pptx",
  // Web & Data
  ".htm",
  ".csv",
  ".rss",
  ".atom",
  // Notebooks
  ".ipynb",
  // Archives (recursive extraction)
  ".zip",
];

// Build convertible extensions set (includes audio/video/shortcuts only if Whisper is configured)
export const CONVERTIBLE_EXTENSIONS: Set<string> = new Set([
  ...BASE_CONVERTIBLE_EXTENSIONS,
  ...(WHISPER_CONFIG.isConfigured
    ? [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS, ...SHORTCUT_EXTENSIONS]
    : []),
]);

// Extensions we consider for indexing to avoid binary noise and improve relevance.
export const INDEXABLE_EXTENSIONS: Set<string> = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".rb",
  ".php",
  ".cs",
  ".swift",
  ".kt",
  ".scala",
  ".lua",
  ".sh",
  ".sql",
  ".html",
  ".css",
  ".dart",
  ".el",
  ".clj",
  ".ex",
  ".exs",
  ".m",
  ".mm",
  ".f90",
  ".f95",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".md",
  ".mdx",
  ".txt",

  ".gitignore",
  ".dockerfile",
  "dockerfile",
  "makefile",
  // Convertible document formats (converted to markdown before indexing)
  ...CONVERTIBLE_EXTENSIONS,
]);
