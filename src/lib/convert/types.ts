/**
 * Result of converting a document to markdown
 */
export interface ConversionResult {
  /** The converted markdown content */
  markdown: string;
  /** Optional metadata about the conversion */
  metadata?: {
    /** Original file format (without dot) */
    sourceFormat: string;
    /** Document title if extracted */
    title?: string;
  };
}

/**
 * Cache entry for a converted document
 */
export interface CacheEntry {
  /** Hash of the source file */
  sourceHash: string;
  /** Path to the cached markdown file */
  cachePath: string;
}
