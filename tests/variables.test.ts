import { createVariableStore, resolveValue, resolveArgs, applySet } from '../src/variables'
import { parseQSL } from '../src/parser'

describe('createVariableStore', () => {
  test('creates a store with provided builtins', () => {
    const store = createVariableStore({ url: 'https://example.com', base_url: 'https://example.com' })
    expect(store.get('url')).toBe('https://example.com')
    expect(store.get('base_url')).toBe('https://example.com')
  })

  test('strips $ prefix from keys if provided', () => {
    const store = createVariableStore({ $url: 'https://example.com' })
    expect(store.get('url')).toBe('https://example.com')
  })

  test('creates an empty store with empty builtins', () => {
    const store = createVariableStore({})
    expect(store.size).toBe(0)
  })
})

describe('resolveValue', () => {
  test('replaces $var with stored value', () => {
    const store = createVariableStore({ url: 'https://example.com' })
    expect(resolveValue('$url', store)).toBe('https://example.com')
  })

  test('replaces multiple $vars in a string', () => {
    const store = createVariableStore({ first: 'Hello', second: 'World' })
    expect(resolveValue('$first $second', store)).toBe('Hello World')
  })

  test('replaces unknown vars with empty string', () => {
    const store = createVariableStore({})
    // suppress the console.warn
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(resolveValue('$unknown', store)).toBe('')
    jest.restoreAllMocks()
  })

  test('leaves non-var strings unchanged', () => {
    const store = createVariableStore({})
    expect(resolveValue('hello world', store)).toBe('hello world')
  })

  test('handles mixed var + plain text', () => {
    const store = createVariableStore({ base: 'https://app.com' })
    expect(resolveValue('$base/login', store)).toBe('https://app.com/login')
  })
})

describe('resolveArgs', () => {
  test('resolves a simple list of args', () => {
    const store = createVariableStore({ url: 'https://example.com' })
    expect(resolveArgs(['$url'], store)).toEqual(['https://example.com'])
  })

  test('handles concatenation with + token', () => {
    const store = createVariableStore({ base: 'https://app.com' })
    const result = resolveArgs(['$base', '+', '/login'], store)
    expect(result).toEqual(['https://app.com/login'])
  })

  test('handles multiple args without concatenation', () => {
    const store = createVariableStore({ email: 'user@test.com' })
    const result = resolveArgs(['into', '$email'], store)
    expect(result).toEqual(['into', 'user@test.com'])
  })
})

describe('applySet', () => {
  test('sets a variable in the store', () => {
    const store = createVariableStore({})
    const [instr] = parseQSL('set $email = "user@test.com"')
    applySet(instr, store)
    expect(store.get('email')).toBe('user@test.com')
  })

  test('resolves $var references in the value', () => {
    const store = createVariableStore({ base: 'https://app.com' })
    const [instr] = parseQSL('set $login = "$base"')
    applySet(instr, store)
    expect(store.get('login')).toBe('https://app.com')
  })

  test('overwrites an existing variable', () => {
    const store = createVariableStore({ name: 'old' })
    const [instr] = parseQSL('set $name = "new"')
    applySet(instr, store)
    expect(store.get('name')).toBe('new')
  })

  test('warns on malformed set instruction', () => {
    const store = createVariableStore({})
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    // Simulate a malformed instruction
    const badInstr = { lineNumber: 1, raw: 'set $x', command: 'set', args: ['$x'] }
    applySet(badInstr, store)
    expect(store.has('x')).toBe(false)
    jest.restoreAllMocks()
  })
})
