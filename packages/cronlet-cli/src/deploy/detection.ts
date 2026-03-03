import { existsSync } from "node:fs";
import { join } from "node:path";

export type RouterType = "app" | "pages";

export interface ProjectInfo {
  /** Whether this is a TypeScript project */
  typescript: boolean;
  /** Router type (App Router or Pages Router) */
  router: RouterType;
  /** Root directory of the project */
  rootDir: string;
  /** Directory where API routes should be generated */
  apiDir: string;
}

/**
 * Detect the Next.js project structure
 */
export function detectProject(rootDir: string = process.cwd()): ProjectInfo | null {
  // Check for TypeScript
  const hasTypeScript = existsSync(join(rootDir, "tsconfig.json"));

  // Check for App Router
  const hasAppDir = existsSync(join(rootDir, "app"));
  const hasSrcAppDir = existsSync(join(rootDir, "src/app"));

  // Check for Pages Router
  const hasPagesDir = existsSync(join(rootDir, "pages"));
  const hasSrcPagesDir = existsSync(join(rootDir, "src/pages"));

  // Determine router type
  // App Router takes precedence if both exist
  let router: RouterType;
  let apiDir: string;

  if (hasAppDir) {
    router = "app";
    apiDir = join(rootDir, "app/api");
  } else if (hasSrcAppDir) {
    router = "app";
    apiDir = join(rootDir, "src/app/api");
  } else if (hasPagesDir) {
    router = "pages";
    apiDir = join(rootDir, "pages/api");
  } else if (hasSrcPagesDir) {
    router = "pages";
    apiDir = join(rootDir, "src/pages/api");
  } else {
    // Could not detect Next.js project
    return null;
  }

  return {
    typescript: hasTypeScript,
    router,
    rootDir,
    apiDir,
  };
}
