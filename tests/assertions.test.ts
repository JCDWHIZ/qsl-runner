import { executeAssertion } from '../src/assertions'
import { createVariableStore } from '../src/variables'
import type { QSLInstruction } from '../src/types'

/** Build a minimal instruction for testing assertions */
function makeInstruction(
  args: string[],
  selector?: QSLInstruction['selector']
): QSLInstruction {
  return {
    lineNumber: 1,
    raw: `assert ${args.join(' ')}`,
    command: 'assert',
    args,
    selector,
  }
}

/** Create a basic mocked Page */
function makePage(overrides: Partial<ReturnType<typeof buildMockPage>> = {}) {
  return { ...buildMockPage(), ...overrides }
}

function buildMockPage() {
  return {
    content: jest.fn().mockResolvedValue('<html><body>Welcome back</body></html>'),
    url: jest.fn().mockReturnValue('https://app.com/dashboard'),
    title: jest.fn().mockResolvedValue('My App — Dashboard'),
    locator: jest.fn().mockReturnValue({
      isVisible: jest.fn().mockResolvedValue(true),
      isEnabled: jest.fn().mockResolvedValue(true),
      isChecked: jest.fn().mockResolvedValue(true),
      textContent: jest.fn().mockResolvedValue('Expected text'),
      inputValue: jest.fn().mockResolvedValue('expected-value'),
      waitFor: jest.fn().mockResolvedValue(undefined),
    }),
    getByLabel: jest.fn(),
    getByRole: jest.fn(),
    getByPlaceholder: jest.fn(),
    getByText: jest.fn(),
    getByAltText: jest.fn(),
  }
}

const store = createVariableStore({})
const options = { elementTimeout: 5000 }

describe('executeAssertion — page contains', () => {
  test('passes when text is present', async () => {
    const page = makePage()
    const instr = makeInstruction(['page', 'contains', 'Welcome back'])
    await expect(executeAssertion(page as any, instr, store, options)).resolves.toBeUndefined()
  })

  test('throws when text is absent', async () => {
    const page = makePage({
      content: jest.fn().mockResolvedValue('<html><body>Nothing here</body></html>'),
    })
    const instr = makeInstruction(['page', 'contains', 'Welcome back'])
    await expect(executeAssertion(page as any, instr, store, options)).rejects.toThrow(
      'expected page to contain "Welcome back"'
    )
  })
})

describe('executeAssertion — page does not contain', () => {
  test('passes when text is absent', async () => {
    const page = makePage({
      content: jest.fn().mockResolvedValue('<html><body>Clean page</body></html>'),
    })
    const instr = makeInstruction(['page', 'does', 'not', 'contain', 'Error'])
    await expect(executeAssertion(page as any, instr, store, options)).resolves.toBeUndefined()
  })

  test('throws when text is present', async () => {
    const page = makePage({
      content: jest.fn().mockResolvedValue('<html><body>Error occurred</body></html>'),
    })
    const instr = makeInstruction(['page', 'does', 'not', 'contain', 'Error'])
    await expect(executeAssertion(page as any, instr, store, options)).rejects.toThrow(
      'expected page NOT to contain "Error"'
    )
  })
})

describe('executeAssertion — url contains', () => {
  test('passes when URL contains substring', async () => {
    const page = makePage()
    const instr = makeInstruction(['url', 'contains', '/dashboard'])
    await expect(executeAssertion(page as any, instr, store, options)).resolves.toBeUndefined()
  })

  test('throws when URL does not contain substring', async () => {
    const page = makePage({ url: jest.fn().mockReturnValue('https://app.com/login') })
    const instr = makeInstruction(['url', 'contains', '/dashboard'])
    await expect(executeAssertion(page as any, instr, store, options)).rejects.toThrow(
      'expected URL to contain "/dashboard"'
    )
  })
})

describe('executeAssertion — url equals', () => {
  test('passes when URL matches exactly', async () => {
    const page = makePage()
    const instr = makeInstruction(['url', 'equals', 'https://app.com/dashboard'])
    await expect(executeAssertion(page as any, instr, store, options)).resolves.toBeUndefined()
  })

  test('throws when URL does not match', async () => {
    const page = makePage()
    const instr = makeInstruction(['url', 'equals', 'https://app.com/other'])
    await expect(executeAssertion(page as any, instr, store, options)).rejects.toThrow(
      'expected URL to equal'
    )
  })
})

describe('executeAssertion — title equals', () => {
  test('passes when title matches', async () => {
    const page = makePage()
    const instr = makeInstruction(['title', 'equals', 'My App — Dashboard'])
    await expect(executeAssertion(page as any, instr, store, options)).resolves.toBeUndefined()
  })

  test('throws when title does not match', async () => {
    const page = makePage()
    const instr = makeInstruction(['title', 'equals', 'Wrong Title'])
    await expect(executeAssertion(page as any, instr, store, options)).rejects.toThrow(
      'expected title to equal'
    )
  })
})

describe('executeAssertion — unknown assertion', () => {
  test('throws for unrecognised assertion pattern', async () => {
    const page = makePage()
    const instr = makeInstruction(['something', 'random'])
    await expect(executeAssertion(page as any, instr, store, options)).rejects.toThrow(
      'Unknown assertion'
    )
  })
})
