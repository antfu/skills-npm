import type { CommandOptions } from './types'
import process from 'node:process'

export const isTTY = process.stdout.isTTY

export const DEFAULT_OPTIONS: CommandOptions = {
  source: 'node_modules',
  recursive: false,
  gitignore: true,
  yes: false,
  dryRun: false,
  exclude: [],
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
