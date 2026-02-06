import type { FilterItem } from './types'
import process from 'node:process'

export const isTTY = process.stdout.isTTY

export const DEFAULT_OPTIONS = {
  source: 'node_modules',
  recursive: false,
  gitignore: true,
  yes: false,
  dryRun: false,
  exclude: [],
  force: false,
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

export const GITIGNORE_PATTERN = '**/skills/npm-*'
export const LEGACY_GITIGNORE_PATTERN = 'skills/npm-*'
export const GITIGNORE_COMMENT = '# Agent skills from npm packages (managed by skills-npm)'

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
