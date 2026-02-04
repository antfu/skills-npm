import { access, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { GITIGNORE_COMMENT, GITIGNORE_PATTERN, LEGACY_GITIGNORE_PATTERN } from './constants'

export async function hasGitignorePattern(cwd: string = process.cwd()): Promise<boolean> {
  const gitignorePath = join(cwd, '.gitignore')

  try {
    await access(gitignorePath)
    const content = await readFile(gitignorePath, 'utf-8')
    return content.includes(GITIGNORE_PATTERN)
  }
  catch {
    return false
  }
}

export async function gitignoreExists(cwd: string = process.cwd()): Promise<boolean> {
  const gitignorePath = join(cwd, '.gitignore')

  try {
    await access(gitignorePath)
    return true
  }
  catch {
    return false
  }
}

export async function updateGitignore(
  cwd: string = process.cwd(),
  dryRun: boolean = false,
): Promise<{ updated: boolean, created: boolean }> {
  const gitignorePath = join(cwd, '.gitignore')

  if (await hasGitignorePattern(cwd))
    return { updated: false, created: false }

  const exists = await gitignoreExists(cwd)
  if (dryRun)
    return { updated: true, created: !exists }

  // Create .gitignore file
  if (!exists) {
    const content = `${GITIGNORE_COMMENT}\n${GITIGNORE_PATTERN}\n`
    await writeFile(gitignorePath, content, 'utf-8')
    return { updated: true, created: true }
  }

  const content = await readFile(gitignorePath, 'utf-8')

  // Replace legacy pattern with new pattern
  if (content.includes(LEGACY_GITIGNORE_PATTERN)) {
    const newContent = content.replace(LEGACY_GITIGNORE_PATTERN, GITIGNORE_PATTERN)
    await writeFile(gitignorePath, newContent, 'utf-8')
    return { updated: true, created: false }
  }

  const newContent = content.endsWith('\n')
    ? `${content}\n${GITIGNORE_COMMENT}\n${GITIGNORE_PATTERN}\n`
    : `${content}\n\n${GITIGNORE_COMMENT}\n${GITIGNORE_PATTERN}\n`

  await writeFile(gitignorePath, newContent, 'utf-8')
  return { updated: true, created: false }
}
