import type { CommandOptions } from './types'

export * from './agents'
export * from './gitignore'
export * from './scan'
export * from './symlink'
export type * from './types'
export * from './utils/index'

export function defineConfig(config: Partial<CommandOptions>): Partial<CommandOptions> {
  return config
}
