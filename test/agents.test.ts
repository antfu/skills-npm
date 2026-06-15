import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { detectAgentsByCommand } from '../src/agents'
import { isCommandAvailable } from '../src/utils/command'

// PATH strings and expected candidate paths are built with node:path's `join`
// and `delimiter` (the same primitives the implementation uses), so assertions
// hold on POSIX and Windows runners alike.
function present(...paths: string[]): (p: string) => Promise<boolean> {
  const set = new Set(paths)
  return async p => set.has(p)
}

const BIN = join('/', 'usr', 'bin')
const BIN2 = join('/', 'usr', 'local', 'bin')

describe('isCommandAvailable', () => {
  it('finds a command present on PATH (POSIX)', async () => {
    const ok = await isCommandAvailable('claude', {
      platform: 'linux',
      env: { PATH: [BIN, BIN2].join(delimiter) },
      isExecutableFile: present(join(BIN2, 'claude')),
    })
    expect(ok).toBe(true)
  })

  it('returns false when the command is not present', async () => {
    const ok = await isCommandAvailable('claude', {
      platform: 'linux',
      env: { PATH: BIN },
      isExecutableFile: async () => false,
    })
    expect(ok).toBe(false)
  })

  it('returns false for an empty PATH', async () => {
    const ok = await isCommandAvailable('claude', {
      platform: 'linux',
      env: { PATH: '' },
      isExecutableFile: async () => true,
    })
    expect(ok).toBe(false)
  })

  it('drops empty PATH segments (no relative/cwd probe)', async () => {
    const probed: string[] = []
    const ok = await isCommandAvailable('claude', {
      platform: 'linux',
      env: { PATH: ['', '', BIN, ''].join(delimiter) },
      isExecutableFile: async (p) => {
        probed.push(p)
        return false
      },
    })
    expect(ok).toBe(false)
    expect(probed).toEqual([join(BIN, 'claude')])
  })

  // Note: a real Windows drive-letter dir (e.g. C:\bin) cannot be used here
  // because node:path.delimiter on a POSIX test host is ":", which would split
  // the drive letter. platform: 'win32' is what drives the PATHEXT logic; the
  // dir itself just needs to be free of the host delimiter.
  it('reads Windows-cased Path/Pathext and resolves via PATHEXT', async () => {
    const ok = await isCommandAvailable('claude', {
      platform: 'win32',
      env: { Path: BIN, Pathext: '.EXE;.CMD;.BAT' },
      isExecutableFile: present(join(BIN, 'claude.CMD')),
    })
    expect(ok).toBe(true)
  })

  it('does not match a bare extensionless name on Windows', async () => {
    const ok = await isCommandAvailable('claude', {
      platform: 'win32',
      env: { Path: BIN, Pathext: '.EXE;.CMD;.BAT' },
      isExecutableFile: present(join(BIN, 'claude')), // the extensionless file is not a PATHEXT candidate
    })
    expect(ok).toBe(false)
  })

  it('honors a command that already includes an extension on Windows', async () => {
    const ok = await isCommandAvailable('tool.exe', {
      platform: 'win32',
      env: { Path: BIN, Pathext: '.EXE;.CMD' },
      isExecutableFile: present(join(BIN, 'tool.exe')),
    })
    expect(ok).toBe(true)
  })

  // Exercises the real defaultIsExecutableFile (stat + isFile guard + X_OK).
  // X_OK is a no-op on Windows, so this POSIX-specific check is skipped there.
  it.skipIf(process.platform === 'win32')('uses the real isFile and executable checks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skills-npm-cmd-'))
    try {
      await writeFile(join(dir, 'realcmd'), '#!/bin/sh\n')
      await chmod(join(dir, 'realcmd'), 0o755)
      await writeFile(join(dir, 'plainfile'), 'x')
      await chmod(join(dir, 'plainfile'), 0o644)
      await mkdir(join(dir, 'dircmd')) // a directory carries the exec bit on POSIX

      const env = { PATH: dir }
      expect(await isCommandAvailable('realcmd', { platform: 'linux', env })).toBe(true)
      expect(await isCommandAvailable('plainfile', { platform: 'linux', env })).toBe(false)
      expect(await isCommandAvailable('dircmd', { platform: 'linux', env })).toBe(false)
      expect(await isCommandAvailable('missing', { platform: 'linux', env })).toBe(false)
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('detectAgentsByCommand', () => {
  const base = { platform: 'linux' as const, env: { PATH: BIN } }

  it('maps present commands to their agent types', async () => {
    const detected = await detectAgentsByCommand({
      ...base,
      isExecutableFile: present(join(BIN, 'claude'), join(BIN, 'codex')),
    })
    expect(detected).toContain('claude-code')
    expect(detected).toContain('codex')
    expect(detected).not.toContain('cursor')
  })

  it('resolves cursor via cursor-agent, not the cursor IDE shim', async () => {
    const viaAgent = await detectAgentsByCommand({
      ...base,
      isExecutableFile: present(join(BIN, 'cursor-agent')),
    })
    expect(viaAgent).toContain('cursor')

    const viaShim = await detectAgentsByCommand({
      ...base,
      isExecutableFile: present(join(BIN, 'cursor')),
    })
    expect(viaShim).not.toContain('cursor')
  })

  it('uses the disambiguated alias kilocode, not kilo', async () => {
    const detected = await detectAgentsByCommand({
      ...base,
      isExecutableFile: present(join(BIN, 'kilocode')),
    })
    expect(detected).toContain('kilo')
  })

  it('ignores generic command names that are intentionally unmapped', async () => {
    const detected = await detectAgentsByCommand({
      ...base,
      isExecutableFile: present(
        join(BIN, 'pi'),
        join(BIN, 'goose'),
        join(BIN, 'code'),
        join(BIN, 'vibe'),
      ),
    })
    expect(detected).toEqual([])
  })

  it('returns nothing when no mapped commands are present', async () => {
    const detected = await detectAgentsByCommand({
      ...base,
      isExecutableFile: async () => false,
    })
    expect(detected).toEqual([])
  })
})
