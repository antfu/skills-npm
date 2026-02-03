export function isDirectoryOrSymlink(entry: {
  isDirectory: () => boolean
  isSymbolicLink: () => boolean
}): boolean {
  return entry.isDirectory() || entry.isSymbolicLink()
}
