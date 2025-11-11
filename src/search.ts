import type {
  ScoredAudioURLInputChunk,
  ScoredImageURLInputChunk,
  ScoredTextInputChunk,
  ScoredVideoURLInputChunk,
} from "@mixedbread/sdk/resources/vector-stores/vector-stores";
import type { Command } from "commander";
import { Command as CommanderCommand } from "commander";
import { getJWTToken } from "./lib/auth";
import { createMxbaiClient } from "./lib/mxbai";
import type { FileMetadata } from "./types";
import { ensureAuthenticated } from "./utils";

type ChunkType =
  | ScoredTextInputChunk
  | ScoredImageURLInputChunk
  | ScoredAudioURLInputChunk
  | ScoredVideoURLInputChunk;

function formatChunk(chunk: ChunkType) {
  const path = (chunk.metadata as FileMetadata)?.path ?? "Unknown path";
  let line_range = "";
  switch (chunk.type) {
    case "text":
      line_range = `:${chunk.generated_metadata?.start_line}-${(chunk.generated_metadata?.start_line as number) + (chunk.generated_metadata?.num_lines as number)}`;
      break;
    case "image_url":
      line_range =
        chunk.generated_metadata?.type === "pdf"
          ? `:${chunk.generated_metadata?.page_number}`
          : "";
      break;
    case "audio_url":
      line_range = "";
      break;
    case "video_url":
      line_range = "";
      break;
  }
  return `${path}${line_range}`;
}

export const search: Command = new CommanderCommand("search")
  .description("File pattern searcher")
  .argument("<pattern>", "The pattern to search for")
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .action(async (pattern, _options, cmd) => {
    const options: { store: string } = cmd.optsWithGlobals();

    await ensureAuthenticated();

    try {
      const jwtToken = await getJWTToken();
      const mxbai = createMxbaiClient(jwtToken);

      const path = process.cwd();

      const results = await mxbai.stores.search({
        query: pattern,
        store_identifiers: [options.store],
        filters: {
          all: [
            {
              key: "path",
              operator: "starts_with",
              value: path,
            },
          ],
        },
      });

      console.log(results.data.map(formatChunk).join("\n"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to search:", message);
      process.exitCode = 1;
    }
  });
