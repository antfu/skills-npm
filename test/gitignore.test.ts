import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateGitignore } from '../src/gitignore'

const { mockAccess, mockReadFile, mockWriteFile } = vi.hoisted(() => ({
  mockAccess: vi.fn(),
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  access: mockAccess,
  readFile: mockReadFile,
  writeFile: mockWriteFile,
}))

const noPatternContent = `node_modules`

const withPatternContent = `node_modules

# Agent skills from npm packages (managed by skills-npm)
**/skills/npm-*
`

const withLegacyPatternContent = `node_modules

# Agent skills from npm packages (managed by skills-npm)
skills/npm-*
`

describe('updateGitignore', () => {
  beforeEach(() => {
    mockAccess.mockResolvedValue(undefined)
    mockReadFile.mockResolvedValue('')
    mockWriteFile.mockResolvedValue(undefined)
  })

  afterEach(() => {
    mockAccess.mockReset()
    mockReadFile.mockReset()
    mockWriteFile.mockReset()
  })

  it('returns not updated when pattern already exists', async () => {
    mockReadFile.mockResolvedValue(withPatternContent)

    const result = await updateGitignore('/test/dir')
    expect(result).toEqual({ updated: false, created: false })
  })

  it('creates .gitignore when it does not exist', async () => {
    const error = { code: 'ENOENT' } as unknown as Error
    mockAccess.mockRejectedValue(error)

    const result = await updateGitignore('/test/dir')
    expect(result).toEqual({ updated: true, created: true })

    const content = mockWriteFile.mock.calls[0][1] as string
    expect(content).toMatchInlineSnapshot(`
      "# Agent skills from npm packages (managed by skills-npm)
      **/skills/npm-*
      "
    `)
  })

  it('appends pattern to existing .gitignore', async () => {
    mockReadFile.mockResolvedValue(noPatternContent)

    const result = await updateGitignore('/test/dir')
    expect(result).toEqual({ updated: true, created: false })

    const content = mockWriteFile.mock.calls[0][1] as string
    expect(content).toMatchInlineSnapshot(`
      "node_modules

      # Agent skills from npm packages (managed by skills-npm)
      **/skills/npm-*
      "
    `)
  })

  it('replaces legacy pattern with new pattern', async () => {
    mockReadFile.mockResolvedValue(withLegacyPatternContent)

    const result = await updateGitignore('/test/dir')
    expect(result).toEqual({ updated: true, created: false })

    const content = mockWriteFile.mock.calls[0][1] as string
    expect(content).toMatchInlineSnapshot(`
      "node_modules

      # Agent skills from npm packages (managed by skills-npm)
      **/skills/npm-*
      "
    `)
  })
})
