const patternCache = new Map<string, RegExp>()

export function getPatternRegex(pattern: string): RegExp {
  const cached = patternCache.get(pattern)
  if (cached)
    return cached

  let source = '^'

  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]

    if (char === '*') {
      if (pattern[index + 1] === '*') {
        source += '.*'
        index++
      }
      else {
        source += '[^/]*'
      }
    }
    else if (char === '?') {
      source += '[^/]'
    }
    else {
      source += escapeRegexChar(char)
    }
  }

  source += '$'

  const regex = new RegExp(source)
  patternCache.set(pattern, regex)
  return regex
}

export function hasWildcard(pattern: string): boolean {
  return pattern.includes('*') || pattern.includes('?')
}

function escapeRegexChar(char: string): string {
  return char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}
