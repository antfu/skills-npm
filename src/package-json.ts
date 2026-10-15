import { readFile } from 'node:fs/promises'

export interface PackageJson {
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

export interface PackageJsonFile {
  pkg: PackageJson
  /**
   * Serialize with the file's original indentation, newline style, trailing
   * newline and leading BOM, so edits produce a minimal diff.
   */
  serialize: (pkg: PackageJson) => string
}

const INDENT_RE = /^[\t ]+/m
const CRLF_RE = /\r\n/
const TRAILING_NEWLINE_RE = /\n$/
const LF_GLOBAL_RE = /\n/g

export async function readPackageJson(path: string): Promise<PackageJsonFile> {
  const raw = await readFile(path, 'utf-8')
  const hasBom = raw.charCodeAt(0) === 0xFEFF
  const source = hasBom ? raw.slice(1) : raw

  const indent = source.match(INDENT_RE)?.[0] ?? '  '
  const crlf = CRLF_RE.test(source)
  const trailingNewline = TRAILING_NEWLINE_RE.test(source)

  return {
    pkg: JSON.parse(source),
    serialize(pkg) {
      let output = JSON.stringify(pkg, null, indent)
      if (crlf)
        output = output.replace(LF_GLOBAL_RE, '\r\n')
      if (trailingNewline)
        output += crlf ? '\r\n' : '\n'
      if (hasBom)
        output = `\uFEFF${output}`
      return output
    },
  }
}
