import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

export interface CommandProbeOptions {
  /**
   * Environment to read PATH/PATHEXT from. Defaults to `process.env`.
   * Mainly a test seam.
   */
  env?: NodeJS.ProcessEnv
  /**
   * Platform to assume. Defaults to `process.platform`.
   * Mainly a test seam, so Windows behavior can be exercised cross-platform.
   */
  platform?: NodeJS.Platform
  /**
   * Per-candidate executable check. Defaults to a `stat` + `access(X_OK)` probe.
   * Mainly a test seam, so a synthetic file set can be supplied.
   */
  isExecutableFile?: (filePath: string) => Promise<boolean>
}

const DEFAULT_PATHEXT = '.EXE;.CMD;.BAT;.COM'

const cache = new Map<string, boolean>()

async function defaultIsExecutableFile(filePath: string, isWindows: boolean): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath) // follows symlinks (not lstat)
    if (!stats.isFile())
      return false // a directory on PATH carries the exec bit on POSIX; guard against it
    if (isWindows)
      return true // executability is decided by the extension; X_OK is a no-op on Windows
    await fs.access(filePath, fs.constants.X_OK)
    return true
  }
  catch {
    return false // ENOENT / EACCES / etc.
  }
}

/**
 * Check whether `command` resolves to an executable on the system `PATH`.
 *
 * Zero-dependency, cross-platform scan: splits `PATH`, applies `PATHEXT` on
 * Windows, and verifies each candidate is a real file (and executable on POSIX).
 * Results are cached per command for the process lifetime, unless a test seam
 * (`env`, `platform`, or `isExecutableFile`) is provided.
 */
export async function isCommandAvailable(
  command: string,
  options: CommandProbeOptions = {},
): Promise<boolean> {
  const injected = options.env !== undefined
    || options.platform !== undefined
    || options.isExecutableFile !== undefined

  if (!injected && cache.has(command))
    return cache.get(command)!

  const env = options.env ?? process.env
  const isWindows = (options.platform ?? process.platform) === 'win32'
  const isExecutableFile = options.isExecutableFile
    ?? (filePath => defaultIsExecutableFile(filePath, isWindows))

  // Windows env var casing is preserved by Node, commonly `Path` / `Pathext`.
  const pathValue = env.PATH ?? env.Path ?? ''
  const dirs = pathValue.split(path.delimiter).filter(Boolean) // drop empty segments (cwd footgun)

  const extensions = !isWindows || path.extname(command)
    ? ['']
    : (env.PATHEXT ?? env.Pathext ?? DEFAULT_PATHEXT).split(';').filter(Boolean)

  let found = false
  for (const dir of dirs) {
    // probe extensions in parallel, but keep dir order for short-circuit semantics
    const hits = await Promise.all(
      extensions.map(extension => isExecutableFile(path.join(dir, command + extension))),
    )
    if (hits.some(Boolean)) {
      found = true
      break
    }
  }

  if (!injected)
    cache.set(command, found)

  return found
}
