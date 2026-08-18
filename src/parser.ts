/**
 * QSL Parser — converts raw QSL script text into QSLInstruction objects.
 * Does not validate command semantics, only tokenises.
 */

import type { QSLInstruction, QSLSelector } from './types'

// ── Tokeniser ─────────────────────────────────────────────────────────────────

/**
 * Splits a line into tokens respecting:
 * - Double-quoted strings → single token (quotes stripped)
 * - Single-quoted strings → single token (quotes stripped)
 * - [Label Text] → single token (brackets preserved)
 * - {css-selector} → single token (braces preserved)
 * - @shorthand → single token
 * - Whitespace separates all other tokens
 */
function tokenise(line: string): string[] {
  const tokens: string[] = []
  let i = 0

  while (i < line.length) {
    // Skip whitespace
    if (/\s/.test(line[i])) {
      i++
      continue
    }

    // Double-quoted string
    if (line[i] === '"') {
      let end = i + 1
      while (end < line.length && line[end] !== '"') {
        end++
      }
      tokens.push(line.slice(i + 1, end))
      i = end + 1
      continue
    }

    // Single-quoted string
    if (line[i] === "'") {
      let end = i + 1
      while (end < line.length && line[end] !== "'") {
        end++
      }
      tokens.push(line.slice(i + 1, end))
      i = end + 1
      continue
    }

    // [Label Text] — brackets preserved as part of the token
    if (line[i] === '[') {
      let end = i + 1
      while (end < line.length && line[end] !== ']') {
        end++
      }
      tokens.push(line.slice(i, end + 1))
      i = end + 1
      continue
    }

    // {css-selector} — braces preserved
    if (line[i] === '{') {
      let end = i + 1
      while (end < line.length && line[end] !== '}') {
        end++
      }
      tokens.push(line.slice(i, end + 1))
      i = end + 1
      continue
    }

    // Regular token (word or @shorthand)
    let end = i
    while (end < line.length && !/\s/.test(line[end])) {
      end++
    }
    tokens.push(line.slice(i, end))
    i = end
  }

  return tokens
}

// ── Selector extraction ───────────────────────────────────────────────────────

/**
 * Detects and parses a selector from a single token string.
 * Returns null if the token is not a selector.
 */
export function extractSelector(token: string): QSLSelector | null {
  if (token.startsWith('[') && token.endsWith(']')) {
    return { type: 'label', value: token.slice(1, -1) }
  }
  if (token.startsWith('{') && token.endsWith('}')) {
    return { type: 'css', value: token.slice(1, -1) }
  }
  if (token.startsWith('@')) {
    return { type: 'shorthand', value: token.slice(1) }
  }
  return null
}

// ── Comment stripping ─────────────────────────────────────────────────────────

/**
 * Strips inline comments from a line. Everything after a bare `#`
 * (not inside a quoted string or bracket group) is removed.
 */
function stripComment(line: string): string {
  let inDoubleQuote = false
  let inSingleQuote = false
  let inBracket = false
  let inBrace = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]

    if (ch === '"' && !inSingleQuote && !inBracket && !inBrace) {
      inDoubleQuote = !inDoubleQuote
    } else if (ch === "'" && !inDoubleQuote && !inBracket && !inBrace) {
      inSingleQuote = !inSingleQuote
    } else if (ch === '[' && !inDoubleQuote && !inSingleQuote && !inBrace) {
      inBracket = true
    } else if (ch === ']' && !inDoubleQuote && !inSingleQuote && !inBrace) {
      inBracket = false
    } else if (ch === '{' && !inDoubleQuote && !inSingleQuote && !inBracket) {
      inBrace = true
    } else if (ch === '}' && !inDoubleQuote && !inSingleQuote && !inBracket) {
      inBrace = false
    } else if (ch === '#' && !inDoubleQuote && !inSingleQuote && !inBracket && !inBrace) {
      return line.slice(0, i)
    }
  }

  return line
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parses a QSL script string into an array of QSLInstruction objects.
 * - Strips comments
 * - Trims whitespace
 * - Skips blank lines
 * - Tokenises each line
 * - Extracts selectors from arg tokens
 */
export function parseQSL(script: string): QSLInstruction[] {
  const lines = script.split(/\r?\n/)
  const instructions: QSLInstruction[] = []

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex]
    const stripped = stripComment(rawLine).trim()

    // Skip blank lines and full-line comments
    if (!stripped) continue

    const tokens = tokenise(stripped)
    if (tokens.length === 0) continue

    const command = tokens[0].toLowerCase()
    const remainingTokens = tokens.slice(1)

    // Find selector in remaining tokens (first token that looks like a selector)
    let selector: QSLSelector | undefined
    const args: string[] = []

    for (const token of remainingTokens) {
      const sel = extractSelector(token)
      if (sel && !selector) {
        selector = sel
        // Don't include the selector itself in args
      } else {
        args.push(token)
      }
    }

    const instruction: QSLInstruction = {
      lineNumber: lineIndex + 1,
      raw: rawLine,
      command,
      args,
    }

    if (selector) {
      instruction.selector = selector
    }

    instructions.push(instruction)
  }

  return instructions
}

/**
 * Public alias — parse() is the exported name from index.ts.
 */
export const parse = parseQSL
