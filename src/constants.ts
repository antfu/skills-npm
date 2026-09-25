import type { CommandOptions } from './types'
import { platform } from 'node:os'
import process from 'node:process'

export const isTTY = process.stdout.isTTY

export const isCI = Boolean(process.env.CI)

export const isWindows = platform() === 'win32'

export const DEFAULT_OPTIONS: CommandOptions = {
  source: 'node_modules',
  recursive: false,
  yes: false,
  dryRun: false,
  exclude: [],
  force: false,
  cleanup: true,
}

export const LOGO_LINES = [
  '███████╗██╗  ██╗██╗██╗     ██╗     ███████╗      ███╗   ██╗██████╗ ███╗   ███╗',
  '██╔════╝██║ ██╔╝██║██║     ██║     ██╔════╝      ████╗  ██║██╔══██╗████╗ ████║',
  '███████╗█████╔╝ ██║██║     ██║     ███████╗█████╗██╔██╗ ██║██████╔╝██╔████╔██║',
  '╚════██║██╔═██╗ ██║██║     ██║     ╚════██║╚════╝██║╚██╗██║██╔═══╝ ██║╚██╔╝██║',
  '███████║██║  ██╗██║███████╗███████╗███████║      ██║ ╚████║██║     ██║ ╚═╝ ██║',
  '╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚══════╝      ╚═╝  ╚═══╝╚═╝     ╚═╝     ╚═╝',
]

export const GRAYS = [
  '\x1B[38;5;250m', // Lighter gray
  '\x1B[38;5;248m',
  '\x1B[38;5;245m', // Mid gray
  '\x1B[38;5;243m',
  '\x1B[38;5;240m',
  '\x1B[38;5;238m', // Darker gray
]
export const RESET = '\x1B[0m'

/**
 * Gitignore patterns written by skills-npm v1. v2 commits the symlinks instead
 * and never touches .gitignore; these are only used to hint that a leftover
 * v1 block is inert and can be removed.
 */
export const LEGACY_GITIGNORE_PATTERNS = ['**/skills/npm-*', 'skills/npm-*']

/**
 * Lock files for different package managers.
 * Order matters: first match wins. Binary files (bun.lockb) are handled separately.
 */
export const LOCK_FILES = {
  /** Binary lock files that need Buffer reading */
  binary: ['bun.lockb'] as const,
  /** Text lock files that can be read as UTF-8 */
  text: ['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json'] as const,
  /** All lock files in priority order (binary first for faster hashing) */
  all: ['bun.lockb', 'pnpm-lock.yaml', 'yarn.lock', 'package-lock.json'] as const,
}
