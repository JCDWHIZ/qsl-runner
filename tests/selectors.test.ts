import { extractSelector } from '../src/parser'

describe('extractSelector', () => {
  describe('label selectors', () => {
    test('detects [Label Text]', () => {
      expect(extractSelector('[Email address]')).toEqual({
        type: 'label',
        value: 'Email address',
      })
    })

    test('handles single-word labels', () => {
      expect(extractSelector('[Submit]')).toEqual({
        type: 'label',
        value: 'Submit',
      })
    })

    test('handles labels with special characters', () => {
      expect(extractSelector('[Sign in / Register]')).toEqual({
        type: 'label',
        value: 'Sign in / Register',
      })
    })
  })

  describe('CSS selectors', () => {
    test('detects {css-selector}', () => {
      expect(extractSelector('{button.submit}')).toEqual({
        type: 'css',
        value: 'button.submit',
      })
    })

    test('handles attribute selectors', () => {
      expect(extractSelector('{input[type="email"]}')).toEqual({
        type: 'css',
        value: 'input[type="email"]',
      })
    })

    test('handles ID selectors', () => {
      expect(extractSelector('{#my-button}')).toEqual({
        type: 'css',
        value: '#my-button',
      })
    })
  })

  describe('shorthand selectors', () => {
    test('detects @email', () => {
      expect(extractSelector('@email')).toEqual({ type: 'shorthand', value: 'email' })
    })

    test('detects @password', () => {
      expect(extractSelector('@password')).toEqual({ type: 'shorthand', value: 'password' })
    })

    test('detects @submit', () => {
      expect(extractSelector('@submit')).toEqual({ type: 'shorthand', value: 'submit' })
    })

    test('detects @username', () => {
      expect(extractSelector('@username')).toEqual({ type: 'shorthand', value: 'username' })
    })

    test('detects @search', () => {
      expect(extractSelector('@search')).toEqual({ type: 'shorthand', value: 'search' })
    })

    test('detects @phone', () => {
      expect(extractSelector('@phone')).toEqual({ type: 'shorthand', value: 'phone' })
    })
  })

  describe('non-selector tokens', () => {
    test('returns null for plain words', () => {
      expect(extractSelector('into')).toBeNull()
      expect(extractSelector('navigate')).toBeNull()
      expect(extractSelector('click')).toBeNull()
    })

    test('returns null for variable references', () => {
      expect(extractSelector('$url')).toBeNull()
      expect(extractSelector('$email')).toBeNull()
    })

    test('returns null for quoted strings', () => {
      // By the time extractSelector is called, quotes have already been stripped
      // so we test with already-stripped content
      expect(extractSelector('user@test.com')).toBeNull()
    })

    test('returns null for numbers', () => {
      expect(extractSelector('300')).toBeNull()
    })
  })
})
