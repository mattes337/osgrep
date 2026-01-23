import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const CONFIG_DIR = path.join(os.homedir(), ".osgrep");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export type ConversionStorageMode = "cache" | "alongside";

export interface UserConfig {
  conversion?: {
    /** Where to store converted markdown files */
    storageMode?: ConversionStorageMode;
  };
}

/**
 * Load user config from ~/.osgrep/config.json
 */
export function loadUserConfig(): UserConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, "utf-8");
      return JSON.parse(content) as UserConfig;
    }
  } catch {
    // Ignore parse errors, return empty config
  }
  return {};
}

/**
 * Save user config to ~/.osgrep/config.json
 */
export function saveUserConfig(config: UserConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Update specific fields in user config
 */
export function updateUserConfig(updates: Partial<UserConfig>): UserConfig {
  const current = loadUserConfig();
  const updated: UserConfig = {
    ...current,
    conversion: updates.conversion !== undefined
      ? updates.conversion
      : current.conversion,
  };
  saveUserConfig(updated);
  return updated;
}

/**
 * Get the conversion storage mode (defaults to "cache")
 */
export function getConversionStorageMode(): ConversionStorageMode {
  const config = loadUserConfig();
  return config.conversion?.storageMode ?? "cache";
}

/**
 * Get the config file path
 */
export function getConfigFilePath(): string {
  return CONFIG_FILE;
}
