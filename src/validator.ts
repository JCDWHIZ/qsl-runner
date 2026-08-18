/**
 * QSL Validator — syntax-only validation. Does not launch a browser.
 * Parses the script and checks that every command keyword is a known QSL command.
 * Returns structured errors with line numbers.
 */

import { parseQSL } from './parser'
import type { ValidationResult, ValidationError } from './types'

// ── Known commands ────────────────────────────────────────────────────────────

/**
 * All valid first-token keywords in a QSL script.
 * Used to catch typos like `typo` instead of `type`.
 */
const KNOWN_COMMANDS = new Set([
  'navigate',
  'go',
  'reload',
  'type',
  'clear',
  'press',
  'select',
  'click',
  'double',
  'right',
  'hover',
  'scroll',
  'check',
  'uncheck',
  'wait',
  'assert',
  'screenshot',
  'set',
  'if',
  'end',
  'repeat',
  'switch',
  'close',
])

// ── Simple Levenshtein for "did you mean?" suggestions ────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function suggest(unknown: string): string | null {
  let best: string | null = null
  let bestDist = Infinity
  for (const cmd of KNOWN_COMMANDS) {
    const d = levenshtein(unknown, cmd)
    if (d < bestDist && d <= 3) {
      bestDist = d
      best = cmd
    }
  }
  return best
}

// ── Validate function ─────────────────────────────────────────────────────────

/**
 * Validates QSL syntax without launching a browser or executing anything.
 * Returns a ValidationResult with any syntax errors found.
 */
export function validate(script: string): ValidationResult {
  const instructions = parseQSL(script)
  const errors: ValidationError[] = []

  let ifDepth = 0
  let repeatDepth = 0

  for (const instr of instructions) {
    const { command, lineNumber, raw, args } = instr

    // Check for unknown commands
    if (!KNOWN_COMMANDS.has(command)) {
      const hint = suggest(command)
      errors.push({
        line: lineNumber,
        message: hint
          ? `Unknown command "${command}". Did you mean "${hint}"?`
          : `Unknown command "${command}".`,
        raw,
      })
      continue // Skip block tracking for unknown commands
    }

    // Track if/end if blocks
    if (command === 'if') {
      ifDepth++
      if (ifDepth > 1) {
        errors.push({
          line: lineNumber,
          message: 'Nested "if" blocks are not supported in QSL v1.0.',
          raw,
        })
      }
    }

    if (command === 'end') {
      const next = args[0]?.toLowerCase()
      if (next === 'if') {
        if (ifDepth === 0) {
          errors.push({
            line: lineNumber,
            message: '"end if" without a matching "if" block.',
            raw,
          })
        } else {
          ifDepth--
        }
      } else if (next === 'repeat') {
        if (repeatDepth === 0) {
          errors.push({
            line: lineNumber,
            message: '"end repeat" without a matching "repeat" block.',
            raw,
          })
        } else {
          repeatDepth--
        }
      }
    }

    // Track repeat/end repeat blocks
    if (command === 'repeat') {
      repeatDepth++
    }
  }

  // Unclosed blocks
  if (ifDepth > 0) {
    errors.push({
      line: -1,
      message: `Unclosed "if" block — missing "end if" (${ifDepth} block(s) unclosed).`,
      raw: '',
    })
  }

  if (repeatDepth > 0) {
    errors.push({
      line: -1,
      message: `Unclosed "repeat" block — missing "end repeat" (${repeatDepth} block(s) unclosed).`,
      raw: '',
    })
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
