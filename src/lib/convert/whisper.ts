import { extname, basename } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import {
  WHISPER_CONFIG,
  AUDIO_EXTENSIONS,
  VIDEO_EXTENSIONS,
  SHORTCUT_EXTENSIONS,
} from "../../config";
import type { ConversionResult } from "./types";

/**
 * Check if a file extension is an audio format
 */
export function isAudioFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return AUDIO_EXTENSIONS.has(ext);
}

/**
 * Check if a file extension is a video format
 */
export function isVideoFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

/**
 * Check if a file is an audio or video format that can be transcribed
 */
export function isMediaFile(filePath: string): boolean {
  return isAudioFile(filePath) || isVideoFile(filePath);
}

/**
 * Check if a file is a Windows shortcut (.url or .lnk)
 */
export function isShortcutFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return SHORTCUT_EXTENSIONS.has(ext);
}

/**
 * YouTube URL patterns
 */
const YOUTUBE_PATTERNS = [
  /^https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
  /^https?:\/\/(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]+)/,
  /^https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+)/,
  /^https?:\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]+)/,
  /^https?:\/\/(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/,
];

/**
 * Check if a URL is a YouTube video URL
 */
function isYouTubeUrl(url: string): boolean {
  return YOUTUBE_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Extract URL from .url file (INI format)
 */
function parseUrlFile(content: string): string | null {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^URL\s*=\s*(.+)$/i);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Extract URL from .lnk file using PowerShell
 */
async function parseLnkFile(filePath: string): Promise<string | null> {
  try {
    const shortcutProps = await import("get-windows-shortcut-properties");
    const result = shortcutProps.sync(filePath);
    // Check TargetPath for URL or return null
    if (result && result.TargetPath) {
      const target = result.TargetPath;
      // If target looks like a URL, return it
      if (target.startsWith("http://") || target.startsWith("https://")) {
        return target;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract URL from a shortcut file (.url or .lnk)
 */
async function extractUrlFromShortcut(
  buffer: Buffer,
  filePath: string,
): Promise<string | null> {
  const ext = extname(filePath).toLowerCase();

  if (ext === ".url") {
    // .url files are INI format - parse directly
    const content = buffer.toString("utf-8");
    return parseUrlFile(content);
  }

  if (ext === ".lnk") {
    // .lnk files are binary - use PowerShell to parse
    return parseLnkFile(filePath);
  }

  return null;
}

/**
 * Transcribe YouTube video using Modal API
 */
async function transcribeYouTube(url: string): Promise<string> {
  const youtubeApiUrl =
    WHISPER_CONFIG.youtubeApiUrl ||
    WHISPER_CONFIG.apiUrl.replace(
      "modal-whisper-transcribe",
      "modal-youtube-transcribe",
    );

  const response = await fetch(`${youtubeApiUrl}/v1/youtube/transcribe`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHISPER_CONFIG.authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`YouTube transcription API error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  return result.text || result.transcript || "";
}

/**
 * Extract audio from video file using ffmpeg
 * Returns path to temporary WAV file
 */
async function extractAudioFromVideo(
  videoBuffer: Buffer,
  originalPath: string,
): Promise<string> {
  // Dynamic import to avoid loading ffmpeg if not needed
  const ffmpeg = await import("fluent-ffmpeg");
  const ffmpegPath = await import("ffmpeg-static");

  // Set ffmpeg path
  ffmpeg.default.setFfmpegPath(ffmpegPath.default as string);

  // Create temp directory for processing
  const tempDir = join(tmpdir(), "osgrep-whisper");
  await mkdir(tempDir, { recursive: true });

  const tempId = randomBytes(8).toString("hex");
  const inputPath = join(tempDir, `input-${tempId}${extname(originalPath)}`);
  const outputPath = join(tempDir, `output-${tempId}.wav`);

  // Write video buffer to temp file
  await writeFile(inputPath, videoBuffer);

  return new Promise((resolve, reject) => {
    ffmpeg.default(inputPath)
      .noVideo()
      .audioCodec("pcm_s16le")
      .audioFrequency(16000)
      .audioChannels(1)
      .format("wav")
      .output(outputPath)
      .on("end", async () => {
        // Clean up input file
        try {
          await unlink(inputPath);
        } catch {
          // Ignore cleanup errors
        }
        resolve(outputPath);
      })
      .on("error", async (err: Error) => {
        // Clean up on error
        try {
          await unlink(inputPath);
        } catch {
          // Ignore cleanup errors
        }
        reject(new Error(`FFmpeg audio extraction failed: ${err.message}`));
      })
      .run();
  });
}

/**
 * Send audio file to Whisper API for transcription
 */
async function transcribeAudio(
  audioBuffer: Buffer,
  fileName: string,
): Promise<string> {
  const formData = new FormData();
  // Convert Buffer to ArrayBuffer for Blob compatibility
  const arrayBuffer = audioBuffer.buffer.slice(
    audioBuffer.byteOffset,
    audioBuffer.byteOffset + audioBuffer.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: "audio/wav" });
  formData.append("file", blob, fileName);
  formData.append("model", "whisper-1");

  const response = await fetch(
    `${WHISPER_CONFIG.apiUrl}/v1/audio/transcriptions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHISPER_CONFIG.authToken}`,
      },
      body: formData,
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Whisper API error (${response.status}): ${errorText}`,
    );
  }

  const result = await response.json();
  return result.text || "";
}

/**
 * Convert shortcut file to markdown if it contains a YouTube URL
 */
export async function convertShortcutToMarkdown(
  buffer: Buffer,
  filePath: string,
): Promise<ConversionResult> {
  if (!WHISPER_CONFIG.isConfigured) {
    throw new Error(
      "Whisper API not configured. Set WHISPER_API_URL and WHISPER_AUTH_TOKEN environment variables.",
    );
  }

  const ext = extname(filePath).toLowerCase();
  const fileName = basename(filePath);

  // Extract URL from shortcut
  const url = await extractUrlFromShortcut(buffer, filePath);
  if (!url) {
    throw new Error(`Could not extract URL from shortcut file: ${fileName}`);
  }

  // Check if it's a YouTube URL
  if (!isYouTubeUrl(url)) {
    throw new Error(
      `Shortcut URL is not a YouTube video: ${url}. Only YouTube URLs are supported for transcription.`,
    );
  }

  // Transcribe the YouTube video
  const transcript = await transcribeYouTube(url);

  // Format as markdown
  const markdown = `# YouTube Transcript: ${fileName}

**Source**: ${fileName}
**URL**: ${url}
**Type**: YouTube video transcription

---

${transcript}
`;

  return {
    markdown,
    metadata: {
      sourceFormat: ext.slice(1),
      title: `YouTube Transcript: ${fileName}`,
    },
  };
}

/**
 * Convert audio/video buffer to markdown transcript using Whisper API
 */
export async function convertMediaToMarkdown(
  buffer: Buffer,
  filePath: string,
): Promise<ConversionResult> {
  if (!WHISPER_CONFIG.isConfigured) {
    throw new Error(
      "Whisper API not configured. Set WHISPER_API_URL and WHISPER_AUTH_TOKEN environment variables.",
    );
  }

  const ext = extname(filePath).toLowerCase();
  const fileName = basename(filePath);
  let audioBuffer: Buffer = buffer;
  let tempAudioPath: string | null = null;

  try {
    // Extract audio from video if needed
    if (isVideoFile(filePath)) {
      tempAudioPath = await extractAudioFromVideo(buffer, filePath);
      const { readFile } = await import("node:fs/promises");
      audioBuffer = await readFile(tempAudioPath);
    }

    // Transcribe audio
    const transcript = await transcribeAudio(
      audioBuffer,
      isVideoFile(filePath) ? `${fileName}.wav` : fileName,
    );

    // Format as markdown
    const sourceType = isVideoFile(filePath) ? "Video" : "Audio";
    const markdown = `# ${sourceType} Transcript: ${fileName}

**Source**: ${fileName}
**Format**: ${ext.slice(1).toUpperCase()}
**Type**: ${sourceType} transcription

---

${transcript}
`;

    return {
      markdown,
      metadata: {
        sourceFormat: ext.slice(1),
        title: `${sourceType} Transcript: ${fileName}`,
      },
    };
  } finally {
    // Clean up temp audio file
    if (tempAudioPath) {
      try {
        await unlink(tempAudioPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
