import type { CommandOptions } from './types.ts'

export * from './agents.ts'
export * from './gitignore.ts'
export * from './scan.ts'
export * from './symlink.ts'
export type * from './types.ts'
export * from './utils.ts'

export function defineConfig(config: Partial<CommandOptions>): Partial<CommandOptions> {
  return config
}
