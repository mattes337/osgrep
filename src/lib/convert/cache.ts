import * as fs from "node:fs";
import * as path from "node:path";
import type { ConversionStorageMode } from "../config";

/** Hash prefix marker used in alongside mode for cache validation */
const HASH_MARKER = "<!-- osgrep-hash:";
const HASH_MARKER_END = " -->";

/**
 * Manages a cache of converted markdown files.
 * Supports two storage modes:
 * - "cache": Store in .osgrep/converted/ directory (default)
 * - "alongside": Store next to source files with .md extension
 */
export class ConversionCache {
  constructor(
    private cacheDir: string,
    private storageMode: ConversionStorageMode = "cache",
  ) {}

  /**
   * Initialize the cache directory (only needed for "cache" mode)
   */
  async init(): Promise<void> {
    if (this.storageMode === "cache") {
      await fs.promises.mkdir(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Get the path where converted content should be stored
   */
  private getStoragePath(sourcePath: string, hash: string): string {
    if (this.storageMode === "alongside") {
      // Store next to source file: document.pdf → document.pdf.md
      return `${sourcePath}.md`;
    }
    // Cache mode: store in .osgrep/converted/ with hash prefix
    const safeName = sourcePath.replace(/[/\\:*?"<>|]/g, "_");
    return path.join(this.cacheDir, `${safeName}.${hash.slice(0, 8)}.md`);
  }

  /**
   * Extract hash from alongside-mode file content
   */
  private extractHashFromContent(content: string): string | null {
    const firstLine = content.split("\n")[0];
    if (firstLine?.startsWith(HASH_MARKER) && firstLine.endsWith(HASH_MARKER_END)) {
      return firstLine.slice(HASH_MARKER.length, -HASH_MARKER_END.length);
    }
    return null;
  }

  /**
   * Try to get cached markdown content for a source file
   */
  async get(sourcePath: string, hash: string): Promise<string | null> {
    if (this.storageMode === "alongside") {
      const mdPath = `${sourcePath}.md`;
      try {
        const content = await fs.promises.readFile(mdPath, "utf-8");
        // Validate hash in alongside mode
        const storedHash = this.extractHashFromContent(content);
        if (storedHash === hash) {
          // Return content without the hash marker line
          return content.split("\n").slice(1).join("\n");
        }
        // Hash mismatch - file is stale
        return null;
      } catch {
        return null;
      }
    }

    // Cache mode
    const cachePath = this.getStoragePath(sourcePath, hash);
    try {
      const content = await fs.promises.readFile(cachePath, "utf-8");
      return content;
    } catch {
      return null;
    }
  }

  /**
   * Cache markdown content for a source file
   */
  async set(sourcePath: string, hash: string, content: string): Promise<void> {
    if (this.storageMode === "alongside") {
      const mdPath = `${sourcePath}.md`;
      // Prepend hash marker for cache validation
      const contentWithHash = `${HASH_MARKER}${hash}${HASH_MARKER_END}\n${content}`;
      await fs.promises.writeFile(mdPath, contentWithHash, "utf-8");
      return;
    }

    // Cache mode
    const cachePath = this.getStoragePath(sourcePath, hash);
    await fs.promises.writeFile(cachePath, content, "utf-8");
  }

  /**
   * Remove stale cache entries that don't match current hashes.
   * Only applies to "cache" mode - alongside files are managed by user/git.
   */
  async cleanup(validEntries: Map<string, string>): Promise<number> {
    // Skip cleanup for alongside mode - user manages those files
    if (this.storageMode === "alongside") {
      return 0;
    }

    let removed = 0;
    try {
      const files = await fs.promises.readdir(this.cacheDir);
      for (const file of files) {
        if (!file.endsWith(".md")) continue;

        // Parse source path and hash from filename
        // Format: source_path.hash_prefix.md
        const match = file.match(/^(.+)\.([a-f0-9]{8})\.md$/);
        if (!match) {
          // Invalid format, remove
          await fs.promises.unlink(path.join(this.cacheDir, file)).catch(() => {});
          removed++;
          continue;
        }

        const [, encodedPath, hashPrefix] = match;
        // Check if this entry is still valid
        let isValid = false;
        for (const [sourcePath, hash] of validEntries) {
          const expectedSafe = sourcePath.replace(/[/\\:*?"<>|]/g, "_");
          if (encodedPath === expectedSafe && hash.startsWith(hashPrefix)) {
            isValid = true;
            break;
          }
        }

        if (!isValid) {
          await fs.promises.unlink(path.join(this.cacheDir, file)).catch(() => {});
          removed++;
        }
      }
    } catch {
      // Cache dir may not exist yet
    }
    return removed;
  }
}
