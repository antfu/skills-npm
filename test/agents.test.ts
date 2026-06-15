import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
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

const BIN = path.join('/', 'usr', 'bin')
const BIN2 = path.join('/', 'usr', 'local', 'bin')

describe('isCommandAvailable', () => {
  it('finds a command present on PATH (POSIX)', async () => {
    const ok = await isCommandAvailable('claude', {
      platform: 'linux',
      env: { PATH: [BIN, BIN2].join(path.delimiter) },
      isExecutableFile: present(path.join(BIN2, 'claude')),
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
      env: { PATH: ['', '', BIN, ''].join(path.delimiter) },
      isExecutableFile: async (p) => {
        probed.push(p)
        return false
      },
    })
    expect(ok).toBe(false)
    expect(probed).toEqual([path.join(BIN, 'claude')])
  })

  // Note: a real Windows drive-letter dir (e.g. C:\bin) cannot be used here
  // because node:path.delimiter on a POSIX test host is ":", which would split
  // the drive letter. platform: 'win32' is what drives the PATHEXT logic; the
  // dir itself just needs to be free of the host delimiter.
  it('reads Windows-cased Path/Pathext and resolves via PATHEXT', async () => {
    const ok = await isCommandAvailable('claude', {
      platform: 'win32',
      env: { Path: BIN, Pathext: '.EXE;.CMD;.BAT' },
      isExecutableFile: present(path.join(BIN, 'claude.CMD')),
    })
    expect(ok).toBe(true)
  })

  it('does not match a bare extensionless name on Windows', async () => {
    const ok = await isCommandAvailable('claude', {
      platform: 'win32',
      env: { Path: BIN, Pathext: '.EXE;.CMD;.BAT' },
      isExecutableFile: present(path.join(BIN, 'claude')), // the extensionless file is not a PATHEXT candidate
    })
    expect(ok).toBe(false)
  })

  it('honors a command that already includes an extension on Windows', async () => {
    const ok = await isCommandAvailable('tool.exe', {
      platform: 'win32',
      env: { Path: BIN, Pathext: '.EXE;.CMD' },
      isExecutableFile: present(path.join(BIN, 'tool.exe')),
    })
    expect(ok).toBe(true)
  })

  // Exercises the real defaultIsExecutableFile (stat + isFile guard + X_OK).
  // X_OK is a no-op on Windows, so this POSIX-specific check is skipped there.
  it.skipIf(process.platform === 'win32')('uses the real isFile and executable checks', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'skills-npm-cmd-'))
    try {
      await fs.writeFile(path.join(dir, 'realcmd'), '#!/bin/sh\n')
      await fs.chmod(path.join(dir, 'realcmd'), 0o755)
      await fs.writeFile(path.join(dir, 'plainfile'), 'x')
      await fs.chmod(path.join(dir, 'plainfile'), 0o644)
      await fs.mkdir(path.join(dir, 'dircmd')) // a directory carries the exec bit on POSIX

      const env = { PATH: dir }
      expect(await isCommandAvailable('realcmd', { platform: 'linux', env })).toBe(true)
      expect(await isCommandAvailable('plainfile', { platform: 'linux', env })).toBe(false)
      expect(await isCommandAvailable('dircmd', { platform: 'linux', env })).toBe(false)
      expect(await isCommandAvailable('missing', { platform: 'linux', env })).toBe(false)
    }
    finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})

describe('detectAgentsByCommand', () => {
  const base = { platform: 'linux' as const, env: { PATH: BIN } }

  it('maps present commands to their agent types', async () => {
    const detected = await detectAgentsByCommand({
      ...base,
      isExecutableFile: present(path.join(BIN, 'claude'), path.join(BIN, 'codex')),
    })
    expect(detected).toContain('claude-code')
    expect(detected).toContain('codex')
    expect(detected).not.toContain('cursor')
  })

  it('resolves cursor via cursor-agent, not the cursor IDE shim', async () => {
    const viaAgent = await detectAgentsByCommand({
      ...base,
      isExecutableFile: present(path.join(BIN, 'cursor-agent')),
    })
    expect(viaAgent).toContain('cursor')

    const viaShim = await detectAgentsByCommand({
      ...base,
      isExecutableFile: present(path.join(BIN, 'cursor')),
    })
    expect(viaShim).not.toContain('cursor')
  })

  it('uses the disambiguated alias kilocode, not kilo', async () => {
    const detected = await detectAgentsByCommand({
      ...base,
      isExecutableFile: present(path.join(BIN, 'kilocode')),
    })
    expect(detected).toContain('kilo')
  })

  it('ignores generic command names that are intentionally unmapped', async () => {
    const detected = await detectAgentsByCommand({
      ...base,
      isExecutableFile: present(
        path.join(BIN, 'pi'),
        path.join(BIN, 'goose'),
        path.join(BIN, 'code'),
        path.join(BIN, 'vibe'),
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
