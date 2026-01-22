import { Command } from "commander";
import * as p from "@clack/prompts";
import {
  loadUserConfig,
  updateUserConfig,
  getConfigFilePath,
  type ConversionStorageMode,
} from "../lib/config";
import { gracefulExit } from "../lib/utils/exit";

export const config = new Command("config")
  .description("Configure osgrep settings (Whisper API, etc.)")
  .option("--show", "Show current configuration")
  .option("--reset", "Reset configuration to defaults")
  .action(async (options) => {
    if (options.show) {
      await showConfig();
      return;
    }

    if (options.reset) {
      await resetConfig();
      return;
    }

    await runConfigWizard();
  });

async function showConfig(): Promise<void> {
  const config = loadUserConfig();
  const configPath = getConfigFilePath();

  console.log(`\nConfiguration file: ${configPath}\n`);

  // Conversion settings
  const storageMode = config.conversion?.storageMode ?? "cache";
  console.log("Conversion Settings:");
  console.log(`  Storage Mode: ${storageMode}`);
  if (storageMode === "cache") {
    console.log("    → Converted files stored in .osgrep/converted/");
  } else {
    console.log("    → Converted files stored alongside source files");
  }
  console.log();

  if (config.whisper) {
    console.log("Whisper API Settings:");
    console.log(
      `  API URL:     ${config.whisper.apiUrl || "(not set)"}`,
    );
    console.log(
      `  Auth Token:  ${config.whisper.authToken ? maskToken(config.whisper.authToken) : "(not set)"}`,
    );
    console.log(
      `  YouTube URL: ${config.whisper.youtubeApiUrl || "(auto-derived)"}`,
    );
  } else {
    console.log("Whisper API Settings: (not configured)");
    console.log("  Run 'osgrep config' to enable audio/video transcription.");
  }

  await gracefulExit();
}

async function resetConfig(): Promise<void> {
  p.intro("Reset Configuration");

  const confirm = await p.confirm({
    message: "Are you sure you want to reset all configuration?",
    initialValue: false,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel("Reset cancelled.");
    await gracefulExit();
    return;
  }

  updateUserConfig({ whisper: undefined });
  p.outro("Configuration reset to defaults.");
  await gracefulExit();
}

async function runConfigWizard(): Promise<void> {
  const currentConfig = loadUserConfig();

  p.intro("osgrep Configuration");

  // Conversion storage mode selection
  p.note(
    "Choose where to store converted markdown files.\n\n" +
      "• cache: Store in .osgrep/converted/ (gitignored)\n" +
      "  - Clean working directory\n" +
      "  - Regenerated on each machine\n\n" +
      "• alongside: Store next to source files (e.g., doc.pdf.md)\n" +
      "  - Can be committed to git\n" +
      "  - Shared across team/machines",
    "Conversion Storage",
  );

  const storageMode = await p.select<ConversionStorageMode>({
    message: "Where should converted files be stored?",
    initialValue: currentConfig.conversion?.storageMode ?? "cache",
    options: [
      {
        value: "cache",
        label: "Cache directory (.osgrep/converted/)",
        hint: "default, gitignored",
      },
      {
        value: "alongside",
        label: "Alongside source files",
        hint: "committable, e.g., document.pdf.md",
      },
    ],
  });

  if (p.isCancel(storageMode)) {
    p.cancel("Configuration cancelled.");
    await gracefulExit();
    return;
  }

  // Save conversion settings immediately
  updateUserConfig({
    conversion: { storageMode },
  });

  p.note(
    "Configure the Whisper API for audio/video transcription.\n" +
      "This enables indexing of audio files, video files, and\n" +
      "YouTube URLs in Windows shortcut files (.url, .lnk).",
    "Audio/Video Transcription",
  );

  const whisperEnabled = await p.confirm({
    message: "Enable audio/video transcription?",
    initialValue: Boolean(currentConfig.whisper?.apiUrl),
  });

  if (p.isCancel(whisperEnabled)) {
    p.cancel("Configuration cancelled.");
    await gracefulExit();
    return;
  }

  if (!whisperEnabled) {
    updateUserConfig({ whisper: undefined });
    p.outro("Audio/video transcription disabled.");
    await gracefulExit();
    return;
  }

  const apiUrl = await p.text({
    message: "Whisper API URL:",
    placeholder: "https://your-modal-app--whisper.modal.run",
    initialValue: currentConfig.whisper?.apiUrl || "",
    validate: (value) => {
      if (!value) return "API URL is required";
      if (!value.startsWith("http://") && !value.startsWith("https://")) {
        return "URL must start with http:// or https://";
      }
      return undefined;
    },
  });

  if (p.isCancel(apiUrl)) {
    p.cancel("Configuration cancelled.");
    await gracefulExit();
    return;
  }

  const authToken = await p.password({
    message: "Whisper Auth Token:",
    validate: (value) => {
      if (!value) return "Auth token is required";
      return undefined;
    },
  });

  if (p.isCancel(authToken)) {
    p.cancel("Configuration cancelled.");
    await gracefulExit();
    return;
  }

  const configureYoutube = await p.confirm({
    message: "Configure separate YouTube API URL? (optional)",
    initialValue: Boolean(currentConfig.whisper?.youtubeApiUrl),
  });

  if (p.isCancel(configureYoutube)) {
    p.cancel("Configuration cancelled.");
    await gracefulExit();
    return;
  }

  let youtubeApiUrl: string | undefined;
  if (configureYoutube) {
    const youtubeUrl = await p.text({
      message: "YouTube API URL:",
      placeholder: "https://your-modal-app--youtube.modal.run",
      initialValue: currentConfig.whisper?.youtubeApiUrl || "",
      validate: (value) => {
        if (!value) return "YouTube API URL is required";
        if (!value.startsWith("http://") && !value.startsWith("https://")) {
          return "URL must start with http:// or https://";
        }
        return undefined;
      },
    });

    if (p.isCancel(youtubeUrl)) {
      p.cancel("Configuration cancelled.");
      await gracefulExit();
      return;
    }
    youtubeApiUrl = youtubeUrl;
  }

  // Test the connection
  const testConnection = await p.confirm({
    message: "Test API connection?",
    initialValue: true,
  });

  if (p.isCancel(testConnection)) {
    p.cancel("Configuration cancelled.");
    await gracefulExit();
    return;
  }

  if (testConnection) {
    const s = p.spinner();
    s.start("Testing Whisper API connection...");

    try {
      const healthUrl = `${apiUrl}/health`;
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(30000),
      });

      if (response.ok) {
        s.stop("Whisper API connection successful!");
      } else {
        s.stop(`Warning: Health check returned status ${response.status}`);
      }
    } catch (error) {
      s.stop(
        `Warning: Could not connect to API (${error instanceof Error ? error.message : "unknown error"})`,
      );
      const continueAnyway = await p.confirm({
        message: "Save configuration anyway?",
        initialValue: true,
      });

      if (p.isCancel(continueAnyway) || !continueAnyway) {
        p.cancel("Configuration cancelled.");
        await gracefulExit();
        return;
      }
    }
  }

  // Save configuration
  updateUserConfig({
    whisper: {
      apiUrl,
      authToken,
      youtubeApiUrl,
    },
  });

  p.note(
    `Config saved to: ${getConfigFilePath()}\n\n` +
      "You can now index audio/video files:\n" +
      "  osgrep index /path/to/media\n\n" +
      "Supported formats:\n" +
      "  Audio: .mp3, .wav, .flac, .ogg, .m4a, .aac, .wma\n" +
      "  Video: .mp4, .mkv, .webm, .avi, .mov, .wmv, .flv\n" +
      "  YouTube: .url, .lnk shortcuts pointing to YouTube",
    "Configuration Saved",
  );

  p.outro("osgrep is configured for audio/video transcription!");
  await gracefulExit();
}

function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}
