import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import matter from 'gray-matter'

export function sanitizePackageName(packageName: string): string {
  return packageName
    .replace(/^@/, '')
    .replace(/\//g, '-')
    .toLowerCase()
}

export function createTargetName(packageName: string, skillName: string): string {
  const sanitizedPackage = sanitizePackageName(packageName)
  return `npm-${sanitizedPackage}-${skillName}`
}

export function isDirectoryOrSymlink(entry: {
  isDirectory: () => boolean
  isSymbolicLink: () => boolean
}): boolean {
  return entry.isDirectory() || entry.isSymbolicLink()
}

export async function hasValidSkillMd(dir: string): Promise<{ valid: boolean, name?: string, description?: string }> {
  try {
    const skillMdPath = join(dir, 'SKILL.md')
    const stats = await stat(skillMdPath)
    if (!stats.isFile())
      return { valid: false }

    const content = await readFile(skillMdPath, 'utf-8')
    const { data } = matter(content)

    if (!data.name || !data.description)
      return { valid: false }

    return {
      valid: true,
      name: data.name,
      description: data.description,
    }
  }
  catch {
    return { valid: false }
  }
}
