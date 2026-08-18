import { executeScript } from '../src/executor'
import { parseQSL } from '../src/parser'
import { createVariableStore } from '../src/variables'
import type { RunOptions } from '../src/types'

/** Build a minimal mock Playwright Page */
function buildMockPage() {
  const locatorMock = {
    fill: jest.fn().mockResolvedValue(undefined),
    click: jest.fn().mockResolvedValue(undefined),
    dblclick: jest.fn().mockResolvedValue(undefined),
    hover: jest.fn().mockResolvedValue(undefined),
    check: jest.fn().mockResolvedValue(undefined),
    uncheck: jest.fn().mockResolvedValue(undefined),
    press: jest.fn().mockResolvedValue(undefined),
    selectOption: jest.fn().mockResolvedValue(undefined),
    scrollIntoViewIfNeeded: jest.fn().mockResolvedValue(undefined),
    waitFor: jest.fn().mockResolvedValue(undefined),
    isVisible: jest.fn().mockResolvedValue(true),
    isEnabled: jest.fn().mockResolvedValue(true),
    isChecked: jest.fn().mockResolvedValue(true),
    textContent: jest.fn().mockResolvedValue('some text'),
    inputValue: jest.fn().mockResolvedValue('some value'),
  }

  return {
    goto: jest.fn().mockResolvedValue(undefined),
    goBack: jest.fn().mockResolvedValue(undefined),
    goForward: jest.fn().mockResolvedValue(undefined),
    reload: jest.fn().mockResolvedValue(undefined),
    keyboard: { press: jest.fn().mockResolvedValue(undefined) },
    screenshot: jest.fn().mockResolvedValue(undefined),
    content: jest.fn().mockResolvedValue('<html><body>Hello</body></html>'),
    url: jest.fn().mockReturnValue('https://app.com/dashboard'),
    title: jest.fn().mockResolvedValue('My App'),
    waitForTimeout: jest.fn().mockResolvedValue(undefined),
    waitForLoadState: jest.fn().mockResolvedValue(undefined),
    waitForURL: jest.fn().mockResolvedValue(undefined),
    waitForFunction: jest.fn().mockResolvedValue(undefined),
    evaluate: jest.fn().mockResolvedValue(undefined),
    frameLocator: jest.fn().mockReturnValue({}),
    locator: jest.fn().mockReturnValue(locatorMock),
    getByLabel: jest.fn().mockReturnValue({ waitFor: jest.fn().mockResolvedValue(undefined) }),
    getByRole: jest.fn().mockReturnValue({ waitFor: jest.fn().mockResolvedValue(undefined) }),
    getByPlaceholder: jest.fn().mockReturnValue({ waitFor: jest.fn().mockResolvedValue(undefined) }),
    getByText: jest.fn().mockReturnValue({ waitFor: jest.fn().mockResolvedValue(undefined) }),
    getByAltText: jest.fn().mockReturnValue({ waitFor: jest.fn().mockResolvedValue(undefined) }),
  }
}

const defaultOptions: RunOptions = {
  url: 'https://app.com',
  headless: true,
  screenshotDir: '/tmp/qsl-test-screenshots',
  errorMode: 'fail-fast',
  elementTimeout: 5000,
  waitTimeout: 15000,
}

describe('executeScript — basic execution', () => {
  test('returns an empty result for an empty instruction list', async () => {
    const page = buildMockPage()
    const store = createVariableStore({ url: 'https://app.com' })
    const { steps, screenshots } = await executeScript([], page as any, store, defaultOptions)
    expect(steps).toHaveLength(0)
    expect(screenshots).toHaveLength(0)
  })

  test('executes navigate to and returns a passed step', async () => {
    const page = buildMockPage()
    const store = createVariableStore({ url: 'https://app.com' })
    const instructions = parseQSL('navigate to https://app.com')
    const { steps } = await executeScript(instructions, page as any, store, defaultOptions)
    expect(steps).toHaveLength(1)
    expect(steps[0].status).toBe('passed')
    expect(page.goto).toHaveBeenCalled()
  })

  test('assigns sequential stepIndex values', async () => {
    const page = buildMockPage()
    const store = createVariableStore({ url: 'https://app.com' })
    const instructions = parseQSL(`
      navigate to https://app.com
      reload
    `)
    const { steps } = await executeScript(instructions, page as any, store, defaultOptions)
    expect(steps[0].stepIndex).toBe(0)
    expect(steps[1].stepIndex).toBe(1)
  })

  test('records durationMs for each step', async () => {
    const page = buildMockPage()
    const store = createVariableStore({ url: 'https://app.com' })
    const instructions = parseQSL('navigate to https://app.com')
    const { steps } = await executeScript(instructions, page as any, store, defaultOptions)
    expect(steps[0].durationMs).toBeGreaterThanOrEqual(0)
  })

  test('calls onStepComplete callback for each step', async () => {
    const page = buildMockPage()
    const store = createVariableStore({ url: 'https://app.com' })
    const instructions = parseQSL('navigate to https://app.com')
    const callback = jest.fn()
    await executeScript(instructions, page as any, store, defaultOptions, callback)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][0].status).toBe('passed')
  })
})

describe('executeScript — fail-fast mode', () => {
  test('stops after first failure in fail-fast mode', async () => {
    const page = buildMockPage()
    // Make goto throw
    page.goto.mockRejectedValueOnce(new Error('Navigation failed'))
    const store = createVariableStore({ url: 'https://app.com' })
    const instructions = parseQSL(`
      navigate to https://app.com
      reload
    `)
    const { steps } = await executeScript(instructions, page as any, store, {
      ...defaultOptions,
      errorMode: 'fail-fast',
    })
    // Only the first failed step should be recorded
    expect(steps).toHaveLength(1)
    expect(steps[0].status).toBe('failed')
    expect(steps[0].errorMessage).toContain('Navigation failed')
  })
})

describe('executeScript — collect mode', () => {
  test('continues after failure in collect mode', async () => {
    const page = buildMockPage()
    page.goto.mockRejectedValueOnce(new Error('Nav failed'))
    const store = createVariableStore({ url: 'https://app.com' })
    const instructions = parseQSL(`
      navigate to https://app.com
      reload
    `)
    const { steps } = await executeScript(instructions, page as any, store, {
      ...defaultOptions,
      errorMode: 'collect',
    })
    expect(steps).toHaveLength(2)
    expect(steps[0].status).toBe('failed')
    expect(steps[1].status).toBe('passed')
  })
})

describe('executeScript — step text', () => {
  test('step text is the trimmed raw instruction line', async () => {
    const page = buildMockPage()
    const store = createVariableStore({ url: 'https://app.com' })
    const instructions = parseQSL('  navigate to https://app.com  ')
    const { steps } = await executeScript(instructions, page as any, store, defaultOptions)
    expect(steps[0].text).toBe('navigate to https://app.com')
  })
})

describe('executeScript — if blocks', () => {
  test('executes if body when condition is true', async () => {
    const page = buildMockPage()
    page.content.mockResolvedValue('<html><body>Cookie banner</body></html>')
    const store = createVariableStore({ url: 'https://app.com' })
    const instructions = parseQSL(`
      if page contains "Cookie banner" then
        reload
      end if
    `)
    await executeScript(instructions, page as any, store, defaultOptions)
    expect(page.reload).toHaveBeenCalled()
  })

  test('skips if body when condition is false', async () => {
    const page = buildMockPage()
    page.content.mockResolvedValue('<html><body>No banner</body></html>')
    const store = createVariableStore({})
    const instructions = parseQSL(`
      if page contains "Cookie banner" then
        reload
      end if
    `)
    await executeScript(instructions, page as any, store, defaultOptions)
    expect(page.reload).not.toHaveBeenCalled()
  })
})

describe('executeScript — repeat blocks', () => {
  test('executes body N times', async () => {
    const page = buildMockPage()
    const store = createVariableStore({})
    const instructions = parseQSL(`
      repeat 3 times
        reload
      end repeat
    `)
    await executeScript(instructions, page as any, store, defaultOptions)
    expect(page.reload).toHaveBeenCalledTimes(3)
  })
})
