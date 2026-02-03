import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import matter from 'gray-matter'

export async function hasValidSkillMd(dir: string): Promise<{ valid: boolean, name?: string, description?: string, error?: string }> {
  try {
    const skillMdPath = join(dir, 'SKILL.md')
    const stats = await stat(skillMdPath)
    if (!stats.isFile())
      return { valid: false, error: 'not_a_file' }

    const content = await readFile(skillMdPath, 'utf-8')
    const { data } = matter(content)

    if (!data.name || !data.description)
      return { valid: false, error: 'missing_fields' }

    return {
      valid: true,
      name: data.name,
      description: data.description,
    }
  }
  catch {
    return { valid: false, error: 'file_error' }
  }
}
