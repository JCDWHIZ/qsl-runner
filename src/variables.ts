/**
 * QSL Variables — variable store creation, $var resolution, and `set` instruction handling.
 */

import type { QSLInstruction, VariableStore } from './types'

// ── Store creation ────────────────────────────────────────────────────────────

/**
 * Creates a new VariableStore pre-populated with the given built-in values.
 * Keys are stored without the `$` prefix.
 */
export function createVariableStore(builtins: Record<string, string>): VariableStore {
  const store: VariableStore = new Map()
  for (const [key, value] of Object.entries(builtins)) {
    // Accept keys with or without the $ prefix
    store.set(key.replace(/^\$/, ''), value)
  }
  return store
}

// ── Value resolution ──────────────────────────────────────────────────────────

/**
 * Resolves all `$var` references in a string value.
 * Unknown variables are replaced with an empty string and a warning is logged.
 *
 * Handles concatenation patterns: `$base + "/path"` — the `+` token is the
 * separator and is consumed, not output.
 */
export function resolveValue(value: string, store: VariableStore): string {
  // Replace $varName patterns (greedy word chars after $)
  return value.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, name: string) => {
    if (store.has(name)) {
      return store.get(name) as string
    }
    // eslint-disable-next-line no-console
    console.warn(`[QSL] Warning: unknown variable $${name} — substituting empty string`)
    return ''
  })
}

/**
 * Resolves a list of arg tokens that may contain `$var` references and
 * concatenation via `+` tokens.
 *
 * Examples:
 *   ['$base', '+', '"/path"']  →  resolvedBase + "/path"  →  "https://app.com/path"
 *   ['$url']                   →  "https://app.com"
 *   ['"hello"']                →  "hello"
 */
export function resolveArgs(args: string[], store: VariableStore): string[] {
  const resolved: string[] = []
  let i = 0

  while (i < args.length) {
    const token = args[i]

    // Check if this token + next is a concatenation: value + value
    if (i + 2 < args.length && args[i + 1] === '+') {
      const left = resolveValue(token, store)
      const right = resolveValue(args[i + 2], store)
      resolved.push(left + right)
      i += 3
      continue
    }

    resolved.push(resolveValue(token, store))
    i++
  }

  return resolved
}

// ── Set instruction ───────────────────────────────────────────────────────────

/**
 * Applies a `set $name = "value"` instruction to the variable store.
 *
 * Expected instruction shape after parsing:
 *   command: 'set'
 *   args: ['$name', '=', 'value']  (quotes already stripped by tokeniser)
 *
 * The value itself may contain $var references — these are resolved against
 * the current store state at the time `applySet` is called.
 */
export function applySet(instruction: QSLInstruction, store: VariableStore): void {
  const args = instruction.args
  // args[0] = '$name', args[1] = '=', args[2] = 'value'
  if (args.length < 3 || args[1] !== '=') {
    // eslint-disable-next-line no-console
    console.warn(`[QSL] Warning: malformed set instruction on line ${instruction.lineNumber}: "${instruction.raw}"`)
    return
  }

  const varName = args[0].replace(/^\$/, '')
  // The value may itself reference other variables; resolve them
  const rawValue = args.slice(2).join(' ')
  const resolved = resolveValue(rawValue, store)
  store.set(varName, resolved)
}
