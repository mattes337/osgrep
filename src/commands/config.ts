import { Command } from "commander";
import * as p from "@clack/prompts";
import chalk from "chalk";
import {
  loadUserConfig,
  updateUserConfig,
  getConfigFilePath,
  type ConversionStorageMode,
} from "../lib/config";
import { gracefulExit } from "../lib/utils/exit";

export const config = new Command("config")
  .description("Configure osgrep settings")
  .action(async () => {
    p.intro(chalk.cyan("osgrep Configuration"));

    const currentConfig = loadUserConfig();

    // Storage mode selection
    const storageMode = await p.select({
      message: "Where should converted documents be stored?",
      options: [
        {
          value: "cache",
          label: "Cache directory (.osgrep/converted/)",
          hint: currentConfig.conversion?.storageMode === "cache" || !currentConfig.conversion?.storageMode
            ? "current"
            : undefined,
        },
        {
          value: "alongside",
          label: "Alongside source files (document.pdf.md)",
          hint: currentConfig.conversion?.storageMode === "alongside" ? "current" : undefined,
        },
      ],
      initialValue: currentConfig.conversion?.storageMode ?? "cache",
    });

    if (p.isCancel(storageMode)) {
      p.cancel("Configuration cancelled");
      await gracefulExit();
      return;
    }

    // Save configuration
    updateUserConfig({
      conversion: {
        storageMode: storageMode as ConversionStorageMode,
      },
    });

    p.note(
      [
        `Storage mode: ${storageMode === "alongside" ? "alongside source files" : "cache directory"}`,
        "",
        storageMode === "alongside"
          ? "Converted files will be saved next to source files (e.g., report.pdf.md)"
          : "Converted files will be saved in .osgrep/converted/",
      ].join("\n"),
      "Configuration saved"
    );

    p.outro(`Config file: ${getConfigFilePath()}`);
    await gracefulExit();
  });
