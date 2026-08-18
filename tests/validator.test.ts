import { validate } from '../src/validator'

describe('validate', () => {
  test('returns valid=true for an empty script', () => {
    const result = validate('')
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  test('returns valid=true for a correct script', () => {
    const result = validate(`
      navigate to $url
      type "user@test.com" into @email
      click @submit
      assert url contains "/dashboard"
    `)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  test('detects an unknown command', () => {
    const result = validate('typo "hello" into [Email]')
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain('"typo"')
    expect(result.errors[0].line).toBe(1)
  })

  test('suggests a correction for a close typo', () => {
    const result = validate('naviage to $url')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('navigate')
  })

  test('detects unclosed if block', () => {
    const result = validate(`
      if page contains "Cookie" then
        click [Accept]
    `)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('Unclosed "if"'))).toBe(true)
  })

  test('detects unclosed repeat block', () => {
    const result = validate(`
      repeat 3 times
        click [Add item]
    `)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('Unclosed "repeat"'))).toBe(true)
  })

  test('detects end if without matching if', () => {
    const result = validate('end if')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('"end if" without a matching "if"')
  })

  test('detects end repeat without matching repeat', () => {
    const result = validate('end repeat')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('"end repeat" without a matching "repeat"')
  })

  test('detects nested if blocks', () => {
    const result = validate(`
      if page contains "A" then
        if page contains "B" then
          click [X]
        end if
      end if
    `)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('Nested "if"'))).toBe(true)
  })

  test('valid if block passes', () => {
    const result = validate(`
      if page contains "Cookie banner" then
        click [Accept cookies]
      end if
    `)
    expect(result.valid).toBe(true)
  })

  test('valid repeat block passes', () => {
    const result = validate(`
      repeat 3 times
        click [Add item]
      end repeat
    `)
    expect(result.valid).toBe(true)
  })

  test('collects multiple errors', () => {
    const result = validate(`
      naviage to $url
      typo "hello" into [Email]
    `)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThanOrEqual(2)
  })

  test('raw field contains the original line', () => {
    const result = validate('unknowncmd [Selector]')
    expect(result.errors[0].raw).toBe('unknowncmd [Selector]')
  })

  test('ignores blank lines and comments', () => {
    const result = validate(`
      # This is a comment
      
      navigate to $url
    `)
    expect(result.valid).toBe(true)
  })
})
