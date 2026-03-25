const LEADING_SCOPE_REGEX = /^@/
const PACKAGE_SEPARATOR_REGEX = /\//g

export function sanitizePackageName(packageName: string): string {
  return packageName
    .replace(LEADING_SCOPE_REGEX, '')
    .replace(PACKAGE_SEPARATOR_REGEX, '-')
    .toLowerCase()
}

export function createTargetName(packageName: string, skillName: string): string {
  const sanitizedPackage = sanitizePackageName(packageName)
  return `npm-${sanitizedPackage}-${skillName}`
}
