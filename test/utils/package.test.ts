import { describe, expect, it } from 'vitest'
import { sanitizeSkillName } from '../../src/utils/package'

// Cases mirror sanitizeName in vercel-labs/skills so link names stay
// byte-compatible with skills-lock.json entries.
describe('sanitizeSkillName', () => {
  it('lowercases and hyphenates special characters', () => {
    expect(sanitizeSkillName('My Skill!')).toBe('my-skill')
    expect(sanitizeSkillName('Presenter Mode')).toBe('presenter-mode')
  })

  it('keeps dots and underscores', () => {
    expect(sanitizeSkillName('skill_v1.2')).toBe('skill_v1.2')
  })

  it('strips leading and trailing dots and hyphens', () => {
    expect(sanitizeSkillName('..hidden')).toBe('hidden')
    expect(sanitizeSkillName('-name-')).toBe('name')
    expect(sanitizeSkillName('../../etc')).toBe('etc')
  })

  it('falls back for empty results and caps length', () => {
    expect(sanitizeSkillName('!!!')).toBe('unnamed-skill')
    expect(sanitizeSkillName(`a${'b'.repeat(300)}`)).toHaveLength(255)
  })
})
