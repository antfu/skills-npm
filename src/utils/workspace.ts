// Workspace root detection (ported from Vite)
// https://github.com/vitejs/vite/blob/main/packages/vite/src/node/server/searchRoot.ts

import fs from 'node:fs'
import { dirname, join } from 'node:path'

const ROOT_FILES = [
  // https://pnpm.io/workspaces/
  'pnpm-workspace.yaml',
  // https://github.com/lerna/lerna#lernajson
  'lerna.json',
]

function isFileReadable(filename: string): boolean {
  try {
    fs.accessSync(filename, fs.constants.R_OK)
    return true
  }
  catch {
    return false
  }
}

function hasWorkspacePackageJSON(root: string): boolean {
  const path = join(root, 'package.json')
  if (!isFileReadable(path)) {
    return false
  }
  try {
    const content = JSON.parse(fs.readFileSync(path, 'utf-8')) || {}
    return !!content.workspaces
  }
  catch {
    return false
  }
}

function hasRootFile(root: string): boolean {
  return ROOT_FILES.some(file => fs.existsSync(join(root, file)))
}

function hasPackageJSON(root: string): boolean {
  const path = join(root, 'package.json')
  return fs.existsSync(path)
}

/**
 * Search up for the nearest `package.json`
 */
export function searchForPackageRoot(
  current: string,
  root: string = current,
): string {
  if (hasPackageJSON(current))
    return current

  const dir = dirname(current)
  // reach the fs root
  if (!dir || dir === current)
    return root

  return searchForPackageRoot(dir, root)
}

/**
 * Search up for the nearest workspace root
 */
export function searchForWorkspaceRoot(
  current: string,
  root: string = searchForPackageRoot(current),
): string {
  if (hasRootFile(current))
    return current
  if (hasWorkspacePackageJSON(current))
    return current

  const dir = dirname(current)
  // reach the fs root
  if (!dir || dir === current)
    return root

  return searchForWorkspaceRoot(dir, root)
}
