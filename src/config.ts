import type { CommandOptions, ResolvedOptions } from './types'
import process from 'node:process'
import { toArray } from '@antfu/utils'
import { createConfigLoader } from 'unconfig'
import { DEFAULT_OPTIONS } from './constants'
import { searchForWorkspaceRoot } from './utils/index'

function normalizeConfig(options: Partial<CommandOptions>): CommandOptions {
  // Interop
  if ('default' in options)
    options = options.default as Partial<CommandOptions>

  return options
}

async function readConfig(options: Partial<CommandOptions>): Promise<CommandOptions> {
  const loader = createConfigLoader<CommandOptions>({
    sources: [
      {
        files: ['skills-npm.config'],
        extensions: ['ts'],
      },
    ],
    cwd: options.cwd || searchForWorkspaceRoot(process.cwd()),
    merge: false,
  })
  const config = await loader.load()
  return config.sources.length ? normalizeConfig(config.config) : {}
}

export async function resolveConfig(options: Partial<CommandOptions>): Promise<ResolvedOptions> {
  const defaults = structuredClone(DEFAULT_OPTIONS)
  options = normalizeConfig(options)

  const configOptions = await readConfig(options)
  const merged = { ...defaults, ...configOptions, ...options }

  merged.cwd = merged.cwd || searchForWorkspaceRoot(process.cwd())
  merged.agents = toArray(merged.agents)

  return merged as ResolvedOptions
}
