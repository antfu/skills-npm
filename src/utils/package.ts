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
