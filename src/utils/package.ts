/**
 * Sanitize a skill's frontmatter `name` into its install/link name.
 *
 * Mirrors `sanitizeName` from vercel-labs/skills (vendor/skills/src/installer.ts)
 * byte-for-byte so conflict checks against `skills-lock.json` compare the exact
 * names the skills CLI would use.
 */
export function sanitizeSkillName(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, '-')
    .replace(/^[.\-]+|[.\-]+$/g, '')

  return sanitized.substring(0, 255) || 'unnamed-skill'
}
