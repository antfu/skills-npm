import type { CommandOptions } from './types'
import process from 'node:process'

export const isTTY = process.stdout.isTTY

export const LOGO_LINES = [
  '███████╗██╗  ██╗██╗██╗     ██╗     ███████╗      ███╗   ██╗██████╗ ███╗   ███╗',
  '██╔════╝██║ ██╔╝██║██║     ██║     ██╔════╝      ████╗  ██║██╔══██╗████╗ ████║',
  '███████╗█████╔╝ ██║██║     ██║     ███████╗█████╗██╔██╗ ██║██████╔╝██╔████╔██║',
  '╚════██║██╔═██╗ ██║██║     ██║     ╚════██║╚════╝██║╚██╗██║██╔═══╝ ██║╚██╔╝██║',
  '███████║██║  ██╗██║███████╗███████╗███████║      ██║ ╚████║██║     ██║ ╚═╝ ██║',
  '╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚══════╝      ╚═╝  ╚═══╝╚═╝     ╚═╝     ╚═╝',
]

export const GRAYS = [
  '\x1B[38;5;250m', // lighter gray
  '\x1B[38;5;248m',
  '\x1B[38;5;245m', // mid gray
  '\x1B[38;5;243m',
  '\x1B[38;5;240m',
  '\x1B[38;5;238m', // darker gray
]
export const RESET = '\x1B[0m'

export const DEFAULT_OPTIONS: CommandOptions = {
  gitignore: true,
  yes: false,
  dryRun: false,
}

export const GITIGNORE_PATTERN = 'skills/npm-*'
export const GITIGNORE_COMMENT = '# Agent skills from npm packages (managed by skills-npm)'
