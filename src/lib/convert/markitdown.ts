import { extname } from "node:path";
import { MarkItDown } from "markitdown-ts";
import type { ConversionResult } from "./types";

const markitdown = new MarkItDown();

/**
 * Convert a document buffer to markdown using markitdown-ts
 */
export async function convertToMarkdown(
  buffer: Buffer,
  filePath: string,
): Promise<ConversionResult> {
  const ext = extname(filePath).toLowerCase();

  // Use convertBuffer for in-memory conversion (serverless-friendly)
  const result = await markitdown.convertBuffer(buffer, {
    file_extension: ext,
  });

  if (!result) {
    throw new Error(`Conversion failed for ${filePath}: no result returned`);
  }

  return {
    markdown: result.text_content,
    metadata: {
      sourceFormat: ext.slice(1),
      title: result.title ?? undefined,
    },
  };
}
