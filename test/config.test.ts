import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const configRecursiveDir = join(fixturesDir, 'config-recursive')

describe('resolveConfig', () => {
  it('applies config-file values when no CLI flags are passed', async () => {
    const config = await resolveConfig({ cwd: configRecursiveDir })

    expect(config.recursive).toBe(true)
    expect(config.source).toBe('node_modules')
    expect(config.cleanup).toBe(false)
  })

  it('lets an explicit CLI flag override the config file', async () => {
    const config = await resolveConfig({ cwd: configRecursiveDir, recursive: false })

    expect(config.recursive).toBe(false)
  })

  it('falls back to defaults for options absent from both CLI and config', async () => {
    const config = await resolveConfig({ cwd: configRecursiveDir })

    expect(config.yes).toBe(false)
    expect(config.dryRun).toBe(false)
    expect(config.force).toBe(false)
  })

  it('defaults source to package.json when unset', async () => {
    const config = await resolveConfig({ cwd: fixturesDir })

    expect(config.source).toBe('package.json')
  })
})
