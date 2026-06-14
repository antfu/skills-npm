import type { ResolvedOptions, SetupResult } from './types'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { searchForWorkspaceRoot } from './utils/index'

/**
 * The command written into `package.json` `scripts.prepare`.
 * This is the plain sync command, not `skills-npm setup`, so it stays fast and
 * does not re-run setup on every install.
 */
const PREPARE_TOKEN = 'skills-npm'

const INDENT_RE = /^[\t ]+/m
const CRLF_RE = /\r\n/
const TRAILING_NEWLINE_RE = /\n$/
const WHITESPACE_RE = /\s+/
const LF_GLOBAL_RE = /\n/g

/**
 * Merge the skills-npm token into an existing `prepare` script.
 *
 * - no prepare -> the token on its own
 * - token already present as a `&&`-separated command -> returned unchanged
 * - otherwise -> appended with ` && `
 *
 * The presence check matches the first word of each `&&`-separated segment so it
 * does not false-match unrelated commands such as `my-skills-npm-wrapper`.
 *
 * Pure and side-effect free.
 */
export function mergePrepare(existing: string | undefined): string {
  const trimmed = existing?.trim()
  if (!trimmed)
    return PREPARE_TOKEN

  const alreadyPresent = trimmed
    .split('&&')
    .some(segment => segment.trim().split(WHITESPACE_RE)[0] === PREPARE_TOKEN)

  return alreadyPresent ? trimmed : `${trimmed} && ${PREPARE_TOKEN}`
}

function detectIndent(source: string): string {
  const match = source.match(INDENT_RE)
  return match ? match[0] : '  '
}

/**
 * Add `skills-npm` to `scripts.prepare` in the given `package.json`, preserving
 * the file's indentation, newline style, trailing newline and leading BOM.
 *
 * Returns the before/after `prepare` values. `changed` is `false` (and nothing
 * is written) when the script already runs skills-npm.
 */
export async function wirePrepare(
  packageJsonPath: string,
  dryRun = false,
): Promise<SetupResult['prepare']> {
  const raw = await readFile(packageJsonPath, 'utf-8')
  const hasBom = raw.charCodeAt(0) === 0xFEFF
  const source = hasBom ? raw.slice(1) : raw

  const pkg = JSON.parse(source)
  const before: string | undefined = pkg.scripts?.prepare
  const after = mergePrepare(before)

  if (after === before)
    return { changed: false, before, after }

  if (dryRun)
    return { changed: true, before, after }

  pkg.scripts ??= {}
  pkg.scripts.prepare = after

  const indent = detectIndent(source)
  const crlf = CRLF_RE.test(source)
  const trailingNewline = TRAILING_NEWLINE_RE.test(source)

  let output = JSON.stringify(pkg, null, indent)
  if (crlf)
    output = output.replace(LF_GLOBAL_RE, '\r\n')
  if (trailingNewline)
    output += crlf ? '\r\n' : '\n'
  if (hasBom)
    output = `\uFEFF${output}`

  await writeFile(packageJsonPath, output, 'utf-8')
  return { changed: true, before, after }
}

/**
 * Bootstrap skills-npm in a project by wiring the `prepare` script. The caller
 * runs the sync afterwards, which symlinks skills and updates .gitignore.
 */
export async function setupProject(options: ResolvedOptions): Promise<SetupResult> {
  const cwd = options.cwd || searchForWorkspaceRoot(process.cwd())
  const packageJsonPath = join(cwd, 'package.json')

  if (!existsSync(packageJsonPath))
    throw new Error(`No package.json found at ${packageJsonPath}`)

  const prepare = await wirePrepare(packageJsonPath, options.dryRun)

  return { packageJsonPath, prepare }
}
