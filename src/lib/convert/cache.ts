import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Manages a cache of converted markdown files in .osgrep/converted/
 */
export class ConversionCache {
  constructor(private cacheDir: string) {}

  /**
   * Initialize the cache directory
   */
  async init(): Promise<void> {
    await fs.promises.mkdir(this.cacheDir, { recursive: true });
  }

  /**
   * Get a deterministic cache path for a source file
   */
  private getCachePath(sourcePath: string, hash: string): string {
    // Create a safe filename from source path and hash prefix
    const safeName = sourcePath.replace(/[/\\:*?"<>|]/g, "_");
    return path.join(this.cacheDir, `${safeName}.${hash.slice(0, 8)}.md`);
  }

  /**
   * Try to get cached markdown content for a source file
   */
  async get(sourcePath: string, hash: string): Promise<string | null> {
    const cachePath = this.getCachePath(sourcePath, hash);
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
    const cachePath = this.getCachePath(sourcePath, hash);
    await fs.promises.writeFile(cachePath, content, "utf-8");
  }

  /**
   * Remove stale cache entries that don't match current hashes
   */
  async cleanup(validEntries: Map<string, string>): Promise<number> {
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
