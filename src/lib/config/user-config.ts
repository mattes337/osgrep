import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const CONFIG_DIR = path.join(os.homedir(), ".osgrep");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export interface UserConfig {
  whisper?: {
    apiUrl?: string;
    authToken?: string;
    youtubeApiUrl?: string;
  };
}

/**
 * Ensure config directory exists
 */
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load user configuration from ~/.osgrep/config.json
 */
export function loadUserConfig(): UserConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, "utf-8");
      return JSON.parse(content) as UserConfig;
    }
  } catch {
    // Return empty config on error
  }
  return {};
}

/**
 * Save user configuration to ~/.osgrep/config.json
 */
export function saveUserConfig(config: UserConfig): void {
  ensureConfigDir();
  const content = JSON.stringify(config, null, 2);
  fs.writeFileSync(CONFIG_FILE, content, "utf-8");
}

/**
 * Update specific fields in user configuration
 */
export function updateUserConfig(updates: Partial<UserConfig>): UserConfig {
  const current = loadUserConfig();
  const updated: UserConfig = {
    ...current,
    whisper: updates.whisper !== undefined
      ? updates.whisper
      : current.whisper,
  };
  saveUserConfig(updated);
  return updated;
}

/**
 * Get the config file path
 */
export function getConfigFilePath(): string {
  return CONFIG_FILE;
}
