import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface DiscoveredIndex {
  root: string; // Project root containing the .osgrep folder
  osgrepDir: string; // Path to .osgrep folder
  lancedbDir: string; // Path to lancedb
}

/**
 * Recursively find all .osgrep folders starting from a root directory.
 * Returns paths sorted by depth (shallowest first).
 */
export async function discoverIndexes(
  rootDir: string,
): Promise<DiscoveredIndex[]> {
  const indexes: DiscoveredIndex[] = [];
  const visited = new Set<string>();

  await walkForIndexes(rootDir, indexes, visited);

  // Sort by path depth (shallowest first)
  indexes.sort((a, b) => {
    const depthA = a.root.split(path.sep).length;
    const depthB = b.root.split(path.sep).length;
    return depthA - depthB;
  });

  return indexes;
}

async function walkForIndexes(
  dir: string,
  indexes: DiscoveredIndex[],
  visited: Set<string>,
): Promise<void> {
  // Resolve to real path to avoid symlink loops
  let realDir: string;
  try {
    realDir = await fs.realpath(dir);
  } catch {
    return; // Skip inaccessible paths
  }

  if (visited.has(realDir)) return;
  visited.add(realDir);

  // Check if this directory has an .osgrep folder
  const osgrepDir = path.join(dir, ".osgrep");
  const lancedbDir = path.join(osgrepDir, "lancedb");

  try {
    await fs.access(lancedbDir);
    // Found a valid index - record it
    indexes.push({
      root: dir,
      osgrepDir,
      lancedbDir,
    });
  } catch {
    // No valid lancedb in this directory
  }

  // Continue searching subdirectories for more indexes
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return; // Skip unreadable directories
  }

  const tasks: Promise<void>[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    // Skip common non-project directories
    const name = entry.name;
    if (
      name === "node_modules" ||
      name === ".git" ||
      name === "dist" ||
      name === "build" ||
      name === "out" ||
      name === "target" ||
      name === "__pycache__" ||
      name === "venv" ||
      name === ".venv" ||
      name === "coverage"
    ) {
      continue;
    }

    tasks.push(walkForIndexes(path.join(dir, name), indexes, visited));
  }

  await Promise.all(tasks);
}

/**
 * Check if a directory has a valid .osgrep index.
 */
export async function hasValidIndex(dir: string): Promise<boolean> {
  const lancedbDir = path.join(dir, ".osgrep", "lancedb");
  try {
    await fs.access(lancedbDir);
    return true;
  } catch {
    return false;
  }
}
