import { glob } from 'tinyglobby'
import { DEFAULT_IGNORE_PATHS } from '../constants'

export function isDirectoryOrSymlink(entry: {
  isDirectory: () => boolean
  isSymbolicLink: () => boolean
}): boolean {
  return entry.isDirectory() || entry.isSymbolicLink()
}

/**
 * Search for all package.json files recursively in a workspace
 * Used for monorepo support to find all packages that may have their own node_modules
 */
export async function searchForPackagesRoot(
  current: string,
  ignorePaths: string[],
): Promise<string[]> {
  return glob('**/package.json', {
    ignore: DEFAULT_IGNORE_PATHS.concat(ignorePaths),
    cwd: current,
    onlyFiles: true,
    dot: false,
    expandDirectories: false,
  })
}
