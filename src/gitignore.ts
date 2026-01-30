import { access, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

const GITIGNORE_PATTERN = 'skills/npm-*'
const GITIGNORE_COMMENT = '# Agent skills from npm packages (managed by skills-npm)'

/**
 * Check if .gitignore contains the npm skills pattern
 */
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

/**
 * Check if .gitignore file exists
 */
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

/**
 * Update .gitignore to include the npm skills pattern
 * Returns true if the file was modified, false if already up to date
 */
export async function updateGitignore(
  cwd: string = process.cwd(),
  dryRun: boolean = false,
): Promise<{ updated: boolean, created: boolean }> {
  const gitignorePath = join(cwd, '.gitignore')

  // Check if pattern already exists
  if (await hasGitignorePattern(cwd)) {
    return { updated: false, created: false }
  }

  if (dryRun) {
    const exists = await gitignoreExists(cwd)
    return { updated: true, created: !exists }
  }

  // Check if .gitignore exists
  const exists = await gitignoreExists(cwd)

  if (exists) {
    // Append to existing .gitignore
    const content = await readFile(gitignorePath, 'utf-8')
    const newContent = content.endsWith('\n')
      ? `${content}\n${GITIGNORE_COMMENT}\n${GITIGNORE_PATTERN}\n`
      : `${content}\n\n${GITIGNORE_COMMENT}\n${GITIGNORE_PATTERN}\n`
    await writeFile(gitignorePath, newContent, 'utf-8')
    return { updated: true, created: false }
  }
  else {
    // Create new .gitignore
    const content = `${GITIGNORE_COMMENT}\n${GITIGNORE_PATTERN}\n`
    await writeFile(gitignorePath, content, 'utf-8')
    return { updated: true, created: true }
  }
}
