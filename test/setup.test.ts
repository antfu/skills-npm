import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mergePrepare, wirePrepare } from '../src/setup'

describe('mergePrepare', () => {
  it('returns the token when there is no prepare script', () => {
    expect(mergePrepare(undefined)).toBe('skills-npm')
    expect(mergePrepare('')).toBe('skills-npm')
    expect(mergePrepare('   ')).toBe('skills-npm')
  })

  it('appends to an existing unrelated prepare script', () => {
    expect(mergePrepare('husky')).toBe('husky && skills-npm')
    expect(mergePrepare('husky && simple-git-hooks')).toBe('husky && simple-git-hooks && skills-npm')
  })

  it('trims surrounding whitespace before appending', () => {
    expect(mergePrepare('  husky  ')).toBe('husky && skills-npm')
  })

  it('is idempotent when the token is already present', () => {
    expect(mergePrepare('skills-npm')).toBe('skills-npm')
    expect(mergePrepare('husky && skills-npm')).toBe('husky && skills-npm')
    expect(mergePrepare('skills-npm && husky')).toBe('skills-npm && husky')
  })

  it('treats the token as present even with trailing flags', () => {
    expect(mergePrepare('skills-npm --yes')).toBe('skills-npm --yes')
    expect(mergePrepare('husky && skills-npm --force')).toBe('husky && skills-npm --force')
  })

  it('does not false-match a command that merely contains the token', () => {
    expect(mergePrepare('my-skills-npm-wrapper build')).toBe('my-skills-npm-wrapper build && skills-npm')
  })
})

const { mockReadFile, mockWriteFile } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
}))

const PKG = '/project/package.json'

function written(): string {
  return mockWriteFile.mock.calls[0][1] as string
}

describe('wirePrepare', () => {
  beforeEach(() => {
    mockWriteFile.mockResolvedValue(undefined)
  })

  afterEach(() => {
    mockReadFile.mockReset()
    mockWriteFile.mockReset()
  })

  it('adds a prepare script when scripts is absent', async () => {
    mockReadFile.mockResolvedValue('{\n  "name": "demo"\n}\n')

    const result = await wirePrepare(PKG)

    expect(result).toEqual({ changed: true, before: undefined, after: 'skills-npm' })
    expect(mockWriteFile).toHaveBeenCalledTimes(1)
    const out = written()
    expect(JSON.parse(out).scripts.prepare).toBe('skills-npm')
    expect(out.endsWith('\n')).toBe(true)
  })

  it('appends to an existing prepare script', async () => {
    mockReadFile.mockResolvedValue('{\n  "scripts": {\n    "prepare": "husky"\n  }\n}\n')

    const result = await wirePrepare(PKG)

    expect(result).toEqual({ changed: true, before: 'husky', after: 'husky && skills-npm' })
    expect(JSON.parse(written()).scripts.prepare).toBe('husky && skills-npm')
  })

  it('is a no-op when the token is already present', async () => {
    mockReadFile.mockResolvedValue('{\n  "scripts": {\n    "prepare": "skills-npm"\n  }\n}\n')

    const result = await wirePrepare(PKG)

    expect(result).toEqual({ changed: false, before: 'skills-npm', after: 'skills-npm' })
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it('does not write in dry-run mode', async () => {
    mockReadFile.mockResolvedValue('{\n  "name": "demo"\n}\n')

    const result = await wirePrepare(PKG, true)

    expect(result).toEqual({ changed: true, before: undefined, after: 'skills-npm' })
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it('preserves tab indentation', async () => {
    mockReadFile.mockResolvedValue('{\n\t"name": "demo"\n}\n')

    await wirePrepare(PKG)

    expect(written()).toContain('\n\t"scripts"')
  })

  it('preserves four-space indentation', async () => {
    mockReadFile.mockResolvedValue('{\n    "name": "demo"\n}\n')

    await wirePrepare(PKG)

    expect(written()).toContain('\n    "scripts"')
  })

  it('preserves the absence of a trailing newline', async () => {
    mockReadFile.mockResolvedValue('{\n  "name": "demo"\n}')

    await wirePrepare(PKG)

    expect(written().endsWith('\n')).toBe(false)
  })

  it('preserves CRLF line endings', async () => {
    mockReadFile.mockResolvedValue('{\r\n  "name": "demo"\r\n}\r\n')

    await wirePrepare(PKG)

    const out = written()
    expect(out.includes('\r\n')).toBe(true)
    expect(out.endsWith('\r\n')).toBe(true)
    // no bare LF that is not part of a CRLF
    expect(/[^\r]\n/.test(out)).toBe(false)
  })

  it('preserves a leading BOM', async () => {
    mockReadFile.mockResolvedValue('\uFEFF{\n  "name": "demo"\n}\n')

    await wirePrepare(PKG)

    const out = written()
    expect(out.charCodeAt(0)).toBe(0xFEFF)
    // content after the BOM is still valid JSON
    expect(JSON.parse(out.slice(1)).scripts.prepare).toBe('skills-npm')
  })
})
