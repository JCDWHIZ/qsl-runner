/**
 * QSL Executor — core execution engine.
 * Iterates over parsed instructions and calls the appropriate Playwright API for each.
 * Handles error modes, screenshots, step results, if/repeat blocks, and frame switching.
 */

import * as fs from 'fs'
import * as path from 'path'
import type { Page } from 'playwright'
import type { QSLInstruction, VariableStore, RunOptions, StepResult } from './types'
import { findElement } from './selectors'
import { executeAssertion } from './assertions'
import { resolveValue, resolveArgs, applySet } from './variables'

// ── Block structures for control flow pre-processing ─────────────────────────

interface IfBlock {
  kind: 'if'
  condition: QSLInstruction
  body: ExecutionItem[]
}

interface RepeatBlock {
  kind: 'repeat'
  count: number
  body: ExecutionItem[]
  lineNumber: number
}

type ExecutionItem = QSLInstruction | IfBlock | RepeatBlock

// ── Control flow pre-processor ────────────────────────────────────────────────

/**
 * Scans a flat instruction list and groups if/repeat blocks into nested structures.
 * Returns a flat ExecutionPlan where blocks are represented as IfBlock or RepeatBlock.
 */
function buildExecutionPlan(instructions: QSLInstruction[]): ExecutionItem[] {
  const result: ExecutionItem[] = []
  let i = 0

  while (i < instructions.length) {
    const instr = instructions[i]

    if (instr.command === 'if') {
      // Find matching end if
      i++
      const body: QSLInstruction[] = []
      let depth = 1
      while (i < instructions.length && depth > 0) {
        if (instructions[i].command === 'if') depth++
        if (instructions[i].command === 'end') depth--
        if (depth > 0) body.push(instructions[i])
        i++
      }
      result.push({ kind: 'if', condition: instr, body: buildExecutionPlan(body) })
      continue
    }

    if (instr.command === 'repeat') {
      const countToken = instr.args[0]
      const count = parseInt(countToken, 10)
      i++
      const body: QSLInstruction[] = []
      let depth = 1
      while (i < instructions.length && depth > 0) {
        if (instructions[i].command === 'repeat') depth++
        if (instructions[i].command === 'end') depth--
        if (depth > 0) body.push(instructions[i])
        i++
      }
      result.push({ kind: 'repeat', count: isNaN(count) ? 1 : count, body: buildExecutionPlan(body), lineNumber: instr.lineNumber })
      continue
    }

    // Skip bare 'end' instructions (consumed above)
    if (instr.command === 'end') {
      i++
      continue
    }

    result.push(instr)
    i++
  }

  return result
}

// ── Condition evaluator for if blocks ─────────────────────────────────────────

async function evaluateCondition(
  page: Page,
  condition: QSLInstruction,
  store: VariableStore
): Promise<boolean> {
  const args = condition.args.map((a) => resolveValue(a, store))

  // "if page contains <text>"
  if (args[0] === 'page' && args[1] === 'contains') {
    const content = await page.content()
    return content.includes(args[2])
  }

  // "if page does not contain <text>"
  if (args[0] === 'page' && args[1] === 'does' && args[2] === 'not' && args[3] === 'contain') {
    const content = await page.content()
    return !content.includes(args[4])
  }

  // "if [selector] is visible"
  if (condition.selector && args[0] === 'is' && args[1] === 'visible') {
    try {
      const locator = page.locator(
        condition.selector.type === 'css' ? condition.selector.value : `text=${condition.selector.value}`
      )
      return await locator.isVisible()
    } catch {
      return false
    }
  }

  // "if [selector] is hidden"
  if (condition.selector && args[0] === 'is' && args[1] === 'hidden') {
    try {
      const locator = page.locator(
        condition.selector.type === 'css' ? condition.selector.value : `text=${condition.selector.value}`
      )
      return !(await locator.isVisible())
    } catch {
      return true
    }
  }

  // "if url contains <path>"
  if (args[0] === 'url' && args[1] === 'contains') {
    return page.url().includes(args[2])
  }

  return false
}

// ── Screenshot helper ─────────────────────────────────────────────────────────

async function takeScreenshot(
  page: Page,
  name: string,
  screenshotDir: string,
  fullPage = false
): Promise<string> {
  fs.mkdirSync(screenshotDir, { recursive: true })
  const filePath = path.join(screenshotDir, `${name}.png`)
  await page.screenshot({ path: filePath, fullPage })
  return filePath
}

// ── Single instruction executor ───────────────────────────────────────────────

async function executeInstruction(
  instruction: QSLInstruction,
  page: Page,
  store: VariableStore,
  options: RunOptions,
  currentContext: { page: Page }
): Promise<void> {
  const elementTimeout = options.elementTimeout ?? 5000
  const waitTimeout = options.waitTimeout ?? 15000
  const screenshotDir = options.screenshotDir ?? './qsl-screenshots'

  // Resolve all args
  const args = resolveArgs(instruction.args, store)
  const cmd = instruction.command

  switch (cmd) {
    // ── Navigation ──────────────────────────────────────────────────────────
    case 'navigate': {
      // "navigate to <url>" — args[0] is 'to', rest is the URL (may include + concatenation)
      // instruction.args = ['to', '$base', '+', '/login'] for example
      const urlParts = resolveArgs(instruction.args.slice(1), store)
      const navUrl = urlParts.filter((a) => a !== 'to').join('')
      await currentContext.page.goto(navUrl, { waitUntil: 'domcontentloaded' })
      break
    }

    case 'go': {
      if (args[0] === 'back') {
        await currentContext.page.goBack()
      } else if (args[0] === 'forward') {
        await currentContext.page.goForward()
      }
      break
    }

    case 'reload': {
      await currentContext.page.reload({ waitUntil: 'domcontentloaded' })
      break
    }

    // ── Input ───────────────────────────────────────────────────────────────
    case 'type': {
      // "type <value> into [selector]"
      if (!instruction.selector) throw new Error(`type: no selector specified on line ${instruction.lineNumber}`)
      const value = resolveArgs(instruction.args.filter(a => a !== 'into'), store)[0] ?? ''
      const locator = await findElement(currentContext.page, instruction.selector, elementTimeout)
      await locator.fill(value)
      break
    }

    case 'clear': {
      if (!instruction.selector) throw new Error(`clear: no selector specified on line ${instruction.lineNumber}`)
      const locator = await findElement(currentContext.page, instruction.selector, elementTimeout)
      await locator.fill('')
      break
    }

    case 'press': {
      // "press <Key> on [selector]" or "press <Key>"
      const key = instruction.args[0] ?? args[0]
      if (instruction.selector) {
        const locator = await findElement(currentContext.page, instruction.selector, elementTimeout)
        await locator.press(key)
      } else {
        await currentContext.page.keyboard.press(key)
      }
      break
    }

    case 'select': {
      // "select <option> from [selector]"
      if (!instruction.selector) throw new Error(`select: no selector specified on line ${instruction.lineNumber}`)
      const optionLabel = resolveArgs(instruction.args.filter(a => a !== 'from'), store)[0] ?? ''
      const locator = await findElement(currentContext.page, instruction.selector, elementTimeout)
      await locator.selectOption({ label: optionLabel })
      break
    }

    // ── Mouse ───────────────────────────────────────────────────────────────
    case 'click': {
      if (!instruction.selector) throw new Error(`click: no selector specified on line ${instruction.lineNumber}`)
      const locator = await findElement(currentContext.page, instruction.selector, elementTimeout)
      await locator.click()
      break
    }

    case 'double': {
      // "double click [selector]"
      if (!instruction.selector) throw new Error(`double click: no selector specified on line ${instruction.lineNumber}`)
      const locator = await findElement(currentContext.page, instruction.selector, elementTimeout)
      await locator.dblclick()
      break
    }

    case 'right': {
      // "right click [selector]"
      if (!instruction.selector) throw new Error(`right click: no selector specified on line ${instruction.lineNumber}`)
      const locator = await findElement(currentContext.page, instruction.selector, elementTimeout)
      await locator.click({ button: 'right' })
      break
    }

    case 'hover': {
      // "hover over [selector]"
      if (!instruction.selector) throw new Error(`hover: no selector specified on line ${instruction.lineNumber}`)
      const locator = await findElement(currentContext.page, instruction.selector, elementTimeout)
      await locator.hover()
      break
    }

    case 'scroll': {
      if (args[0] === 'to' && args[1] === 'bottom') {
        await currentContext.page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
      } else if (args[0] === 'to' && args[1] === 'top') {
        await currentContext.page.evaluate('window.scrollTo(0, 0)')
      } else if (args[0] === 'down') {
        const pixels = parseInt(args[1], 10) || 300
        await currentContext.page.evaluate(`window.scrollBy(0, ${pixels})`)
      } else if (args[0] === 'to' && instruction.selector) {
        const locator = await findElement(currentContext.page, instruction.selector, elementTimeout)
        await locator.scrollIntoViewIfNeeded()
      }
      break
    }

    // ── Checkboxes ──────────────────────────────────────────────────────────
    case 'check': {
      if (!instruction.selector) throw new Error(`check: no selector specified on line ${instruction.lineNumber}`)
      const locator = await findElement(currentContext.page, instruction.selector, elementTimeout)
      await locator.check()
      break
    }

    case 'uncheck': {
      if (!instruction.selector) throw new Error(`uncheck: no selector specified on line ${instruction.lineNumber}`)
      const locator = await findElement(currentContext.page, instruction.selector, elementTimeout)
      await locator.uncheck()
      break
    }

    // ── Waiting ─────────────────────────────────────────────────────────────
    case 'wait': {
      // "wait N seconds"
      if (args[0] !== 'for' && args[1] === 'seconds') {
        const secs = parseFloat(args[0])
        await currentContext.page.waitForTimeout(secs * 1000)
        break
      }

      // "wait for network to be idle"
      if (args[1] === 'network' && args[3] === 'idle') {
        await currentContext.page.waitForLoadState('networkidle', { timeout: waitTimeout })
        break
      }

      // "wait for url to contain/equal <value>"
      if (args[1] === 'url' && args[2] === 'to' && args[3] === 'contain') {
        await currentContext.page.waitForURL((url) => url.toString().includes(args[4]), { timeout: waitTimeout })
        break
      }
      if (args[1] === 'url' && args[2] === 'to' && args[3] === 'equal') {
        await currentContext.page.waitForURL(args[4], { timeout: waitTimeout })
        break
      }

      // "wait for page to contain <text>"
      if (args[1] === 'page' && args[2] === 'to' && args[3] === 'contain') {
        const searchText = args[4]
        await currentContext.page.waitForFunction(
          `document.body.innerText.includes(${JSON.stringify(searchText)})`,
          { timeout: waitTimeout }
        )
        break
      }

      // "wait for [selector] to be visible/hidden"
      if (instruction.selector && args[0] === 'to' && args[1] === 'be') {
        const state = args[2] as 'visible' | 'hidden'
        const locator = await findElement(currentContext.page, instruction.selector, elementTimeout)
        await locator.waitFor({ state, timeout: waitTimeout })
        break
      }

      // "wait for [selector] to have text <expected>"
      if (instruction.selector && args[0] === 'to' && args[1] === 'have' && args[2] === 'text') {
        const expected = args[3]
        const locator = await findElement(currentContext.page, instruction.selector, elementTimeout)
        await locator.waitFor({ state: 'visible', timeout: waitTimeout })
        const actual = await locator.textContent()
        if (!actual?.includes(expected)) {
          throw new Error(`wait for [${instruction.selector.value}] to have text "${expected}" — got "${actual ?? ''}"`)
        }
        break
      }

      break
    }

    // ── Assertions ──────────────────────────────────────────────────────────
    case 'assert': {
      await executeAssertion(currentContext.page, instruction, store, { elementTimeout: options.elementTimeout })
      break
    }

    // ── Screenshots ─────────────────────────────────────────────────────────
    case 'screenshot': {
      // "screenshot <name>" or "screenshot fullpage <name>"
      const isFullPage = args[0] === 'fullpage'
      const nameArg = isFullPage ? args[1] : args[0]
      const name = resolveValue(nameArg ?? 'screenshot', store)
      await takeScreenshot(currentContext.page, name, screenshotDir, isFullPage)
      break
    }

    // ── Variables ───────────────────────────────────────────────────────────
    case 'set': {
      applySet(instruction, store)
      break
    }

    // ── Frame switching ─────────────────────────────────────────────────────
    case 'switch': {
      // "switch to frame [selector]" or "switch to main frame"
      if (args[0] === 'to' && args[1] === 'main') {
        currentContext.page = page
      } else if (args[0] === 'to' && args[1] === 'frame' && instruction.selector) {
        // FrameLocator is returned from page.frameLocator(); we switch to it
        // by replacing currentContext.page — note: FrameLocator has similar API
        // For simplicity, we use the page's frame by selector
        const frameLocator = page.frameLocator(
          instruction.selector.type === 'css'
            ? instruction.selector.value
            : `[name="${instruction.selector.value}"]`
        )
        // We can't directly replace Page with FrameLocator in the same slot,
        // so we use a workaround: locators from frameLocator work on it directly.
        // The context.page remains the main page; frame commands use frameLocator.
        // This is a simplified implementation — attach the frameLocator to context.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(currentContext as any).frame = frameLocator
      }
      break
    }

    // ── Ignore already-consumed control flow tokens ─────────────────────────
    case 'if':
    case 'end':
    case 'repeat':
      break

    default:
      throw new Error(`Unknown command "${instruction.command}" on line ${instruction.lineNumber}`)
  }
}

// ── Execution plan runner ─────────────────────────────────────────────────────

interface ExecutionState {
  steps: StepResult[]
  screenshots: string[]
  stepIndex: number
  shouldStop: boolean
}

async function runPlan(
  plan: ExecutionItem[],
  page: Page,
  store: VariableStore,
  options: RunOptions,
  state: ExecutionState,
  onStepComplete?: (step: StepResult) => void
): Promise<void> {
  const screenshotDir = options.screenshotDir ?? './qsl-screenshots'
  const errorMode = options.errorMode ?? 'fail-fast'
  const currentContext = { page }

  for (const item of plan) {
    if (state.shouldStop) break

    // ── If block ────────────────────────────────────────────────────────────
    if ('kind' in item && item.kind === 'if') {
      const conditionMet = await evaluateCondition(page, item.condition, store)
      if (conditionMet) {
        await runPlan(item.body, page, store, options, state, onStepComplete)
      }
      continue
    }

    // ── Repeat block ────────────────────────────────────────────────────────
    if ('kind' in item && item.kind === 'repeat') {
      for (let iter = 0; iter < item.count; iter++) {
        if (state.shouldStop) break
        await runPlan(item.body, page, store, options, state, onStepComplete)
      }
      continue
    }

    // ── Regular instruction ─────────────────────────────────────────────────
    const instruction = item as QSLInstruction
    const startTime = Date.now()
    const stepIndex = state.stepIndex++

    // Handle screenshot command specially to track the path in RunResult.screenshots
    if (instruction.command === 'screenshot') {
      try {
        const args = resolveArgs(instruction.args, store)
        const isFullPage = args[0] === 'fullpage'
        const nameArg = isFullPage ? args[1] : args[0]
        const name = nameArg ?? 'screenshot'
        const filePath = await takeScreenshot(page, name, screenshotDir, isFullPage)
        state.screenshots.push(filePath)

        const step: StepResult = {
          stepIndex,
          text: instruction.raw.trim(),
          status: 'passed',
          durationMs: Date.now() - startTime,
          errorMessage: null,
          screenshotPath: null,
        }
        state.steps.push(step)
        onStepComplete?.(step)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const step: StepResult = {
          stepIndex,
          text: instruction.raw.trim(),
          status: 'failed',
          durationMs: Date.now() - startTime,
          errorMessage: msg,
          screenshotPath: null,
        }
        state.steps.push(step)
        onStepComplete?.(step)
        if (errorMode === 'fail-fast') {
          state.shouldStop = true
          return
        }
      }
      continue
    }

    try {
      await executeInstruction(instruction, page, store, options, currentContext)

      const step: StepResult = {
        stepIndex,
        text: instruction.raw.trim(),
        status: 'passed',
        durationMs: Date.now() - startTime,
        errorMessage: null,
        screenshotPath: null,
      }
      state.steps.push(step)
      onStepComplete?.(step)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)

      // Attempt failure screenshot
      let screenshotPath: string | null = null
      try {
        const ts = Date.now()
        const name = `fail-step-${stepIndex}-${ts}`
        screenshotPath = await takeScreenshot(page, name, screenshotDir)
        state.screenshots.push(screenshotPath)
      } catch {
        // Screenshot failed — don't mask the original error
      }

      const step: StepResult = {
        stepIndex,
        text: instruction.raw.trim(),
        status: 'failed',
        durationMs: Date.now() - startTime,
        errorMessage: msg,
        screenshotPath,
      }
      state.steps.push(step)
      onStepComplete?.(step)

      if (errorMode === 'fail-fast') {
        state.shouldStop = true
        return
      }
    }
  }
}

// ── Public entry ──────────────────────────────────────────────────────────────

/**
 * Executes a list of parsed QSL instructions against a Playwright Page.
 * Returns all step results and collected screenshots.
 */
export async function executeScript(
  instructions: QSLInstruction[],
  page: Page,
  store: VariableStore,
  options: RunOptions,
  onStepComplete?: (step: StepResult) => void
): Promise<{ steps: StepResult[]; screenshots: string[] }> {
  const plan = buildExecutionPlan(instructions)

  const state: ExecutionState = {
    steps: [],
    screenshots: [],
    stepIndex: 0,
    shouldStop: false,
  }

  await runPlan(plan, page, store, options, state, onStepComplete)

  return { steps: state.steps, screenshots: state.screenshots }
}
