import { parseQSL, extractSelector } from '../src/parser'

describe('parseQSL', () => {
  test('parses a simple navigate instruction', () => {
    const result = parseQSL('navigate to https://example.com')
    expect(result).toHaveLength(1)
    expect(result[0].command).toBe('navigate')
    expect(result[0].args).toEqual(['to', 'https://example.com'])
    expect(result[0].lineNumber).toBe(1)
  })

  test('skips blank lines', () => {
    const result = parseQSL('\n\nclick [Submit]\n\n')
    expect(result).toHaveLength(1)
    expect(result[0].command).toBe('click')
  })

  test('strips inline comments', () => {
    const result = parseQSL('navigate to $url   # this is a comment')
    expect(result).toHaveLength(1)
    expect(result[0].args).toEqual(['to', '$url'])
  })

  test('strips full-line comments', () => {
    const result = parseQSL('# full comment\nclick [Submit]')
    expect(result).toHaveLength(1)
    expect(result[0].command).toBe('click')
  })

  test('commands are lowercased', () => {
    const result = parseQSL('CLICK [Submit]')
    expect(result[0].command).toBe('click')
  })

  test('extracts label selector', () => {
    const result = parseQSL('click [Sign in]')
    expect(result[0].selector).toEqual({ type: 'label', value: 'Sign in' })
    expect(result[0].args).not.toContain('[Sign in]')
  })

  test('extracts CSS selector', () => {
    const result = parseQSL('click {button.primary}')
    expect(result[0].selector).toEqual({ type: 'css', value: 'button.primary' })
  })

  test('extracts shorthand selector', () => {
    const result = parseQSL('click @submit')
    expect(result[0].selector).toEqual({ type: 'shorthand', value: 'submit' })
  })

  test('handles double-quoted strings as single tokens', () => {
    const result = parseQSL('type "hello world" into [Email]')
    expect(result[0].args).toContain('hello world')
    expect(result[0].selector?.value).toBe('Email')
  })

  test('handles single-quoted strings as single tokens', () => {
    const result = parseQSL("type 'hello world' into [Email]")
    expect(result[0].args).toContain('hello world')
  })

  test('parses multiple instructions', () => {
    const script = `
      navigate to $url
      type "user@test.com" into [Email]
      click @submit
    `
    const result = parseQSL(script)
    expect(result).toHaveLength(3)
    expect(result[0].command).toBe('navigate')
    expect(result[1].command).toBe('type')
    expect(result[2].command).toBe('click')
  })

  test('preserves line numbers correctly', () => {
    const script = `navigate to $url\n\nclick [Submit]`
    const result = parseQSL(script)
    expect(result[0].lineNumber).toBe(1)
    expect(result[1].lineNumber).toBe(3) // blank line skipped
  })

  test('stores raw original line', () => {
    const line = '  click [Sign in]  # comment'
    const result = parseQSL(line)
    expect(result[0].raw).toBe(line)
  })

  test('parses set instruction', () => {
    const result = parseQSL('set $email = "user@test.com"')
    expect(result[0].command).toBe('set')
    expect(result[0].args).toEqual(['$email', '=', 'user@test.com'])
  })

  test('does not strip # inside quoted strings', () => {
    const result = parseQSL('type "pass#word" into [Password]')
    expect(result[0].args).toContain('pass#word')
  })

  test('does not strip # inside square brackets', () => {
    const result = parseQSL('click [Sign #in]')
    expect(result[0].selector?.value).toBe('Sign #in')
  })
})

describe('extractSelector', () => {
  test('returns label selector for [text]', () => {
    expect(extractSelector('[Email address]')).toEqual({ type: 'label', value: 'Email address' })
  })

  test('returns css selector for {selector}', () => {
    expect(extractSelector('{button.submit}')).toEqual({ type: 'css', value: 'button.submit' })
  })

  test('returns shorthand selector for @alias', () => {
    expect(extractSelector('@email')).toEqual({ type: 'shorthand', value: 'email' })
  })

  test('returns null for regular tokens', () => {
    expect(extractSelector('into')).toBeNull()
    expect(extractSelector('navigate')).toBeNull()
    expect(extractSelector('$url')).toBeNull()
  })
})
