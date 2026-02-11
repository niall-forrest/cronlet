import chokidar from "chokidar";
import { extname } from "node:path";

/**
 * Watcher options
 */
export interface WatcherOptions {
  /** Directory to watch */
  directory: string;
  /** File extensions to watch */
  extensions?: string[];
  /** Callback when files change */
  onChange: (path: string) => void;
  /** Debounce time in ms */
  debounce?: number;
}

/**
 * Create a file watcher for job files
 */
export function createWatcher(options: WatcherOptions): chokidar.FSWatcher {
  const {
    directory,
    extensions = [".ts", ".js"],
    onChange,
    debounce = 300,
  } = options;

  // Create glob patterns for each extension
  const patterns = extensions.map((ext) => `${directory}/**/*${ext}`);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingPath: string | null = null;

  const watcher = chokidar.watch(patterns, {
    ignored: [
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/build/**",
    ],
    persistent: true,
    ignoreInitial: true,
  });

  const handleChange = (path: string) => {
    // Only handle files with matching extensions
    const ext = extname(path);
    if (!extensions.includes(ext)) return;

    // Debounce rapid changes
    pendingPath = path;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      if (pendingPath) {
        onChange(pendingPath);
        pendingPath = null;
      }
    }, debounce);
  };

  watcher.on("add", handleChange);
  watcher.on("change", handleChange);
  watcher.on("unlink", handleChange);

  return watcher;
}
