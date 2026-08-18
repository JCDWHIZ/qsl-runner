/**
 * QSL Assertions — Implements all `assert` commands.
 * Each assertion either resolves (pass) or throws an Error (fail) with a clear message.
 */

import type { Page } from 'playwright'
import type { QSLInstruction, VariableStore, RunOptions } from './types'
import { findElement } from './selectors'
import { resolveValue } from './variables'

// ── Individual assertion handlers ─────────────────────────────────────────────

async function assertPageContains(page: Page, text: string): Promise<void> {
  const content = await page.content()
  if (!content.includes(text)) {
    throw new Error(
      `Assertion failed — expected page to contain "${text}" but it did not.`
    )
  }
}

async function assertPageNotContains(page: Page, text: string): Promise<void> {
  const content = await page.content()
  if (content.includes(text)) {
    throw new Error(
      `Assertion failed — expected page NOT to contain "${text}" but it did.`
    )
  }
}

async function assertElementVisible(
  page: Page,
  instruction: QSLInstruction,
  options: Pick<RunOptions, 'elementTimeout'>
): Promise<void> {
  if (!instruction.selector) {
    throw new Error('assert [selector] is visible — no selector provided')
  }
  const locator = await findElement(page, instruction.selector, options.elementTimeout)
  const visible = await locator.isVisible()
  if (!visible) {
    throw new Error(
      `Assertion failed — expected element "${instruction.selector.value}" to be visible but it is not.`
    )
  }
}

async function assertElementHidden(
  page: Page,
  instruction: QSLInstruction,
  _options: Pick<RunOptions, 'elementTimeout'>
): Promise<void> {
  if (!instruction.selector) {
    throw new Error('assert [selector] is hidden — no selector provided')
  }
  // For hidden assertions we try to find it but expect it to not be visible
  const locator = page.locator(
    instruction.selector.type === 'css'
      ? instruction.selector.value
      : `text=${instruction.selector.value}`
  )
  const visible = await locator.isVisible()
  if (visible) {
    throw new Error(
      `Assertion failed — expected element "${instruction.selector.value}" to be hidden but it is visible.`
    )
  }
}

async function assertElementHasText(
  page: Page,
  instruction: QSLInstruction,
  text: string,
  options: Pick<RunOptions, 'elementTimeout'>
): Promise<void> {
  if (!instruction.selector) {
    throw new Error('assert [selector] has text — no selector provided')
  }
  const locator = await findElement(page, instruction.selector, options.elementTimeout)
  const actual = await locator.textContent()
  if (!actual?.includes(text)) {
    throw new Error(
      `Assertion failed — expected element "${instruction.selector.value}" to have text "${text}" but got "${actual ?? ''}".`
    )
  }
}

async function assertElementHasValue(
  page: Page,
  instruction: QSLInstruction,
  value: string,
  options: Pick<RunOptions, 'elementTimeout'>
): Promise<void> {
  if (!instruction.selector) {
    throw new Error('assert [selector] has value — no selector provided')
  }
  const locator = await findElement(page, instruction.selector, options.elementTimeout)
  const actual = await locator.inputValue()
  if (actual !== value) {
    throw new Error(
      `Assertion failed — expected element "${instruction.selector.value}" to have value "${value}" but got "${actual}".`
    )
  }
}

async function assertUrlContains(page: Page, substring: string): Promise<void> {
  const currentUrl = page.url()
  if (!currentUrl.includes(substring)) {
    throw new Error(
      `Assertion failed — expected URL to contain "${substring}" but got "${currentUrl}".`
    )
  }
}

async function assertUrlEquals(page: Page, url: string): Promise<void> {
  const currentUrl = page.url()
  if (currentUrl !== url) {
    throw new Error(
      `Assertion failed — expected URL to equal "${url}" but got "${currentUrl}".`
    )
  }
}

async function assertTitleEquals(page: Page, title: string): Promise<void> {
  const actual = await page.title()
  if (actual !== title) {
    throw new Error(
      `Assertion failed — expected title to equal "${title}" but got "${actual}".`
    )
  }
}

async function assertElementEnabled(
  page: Page,
  instruction: QSLInstruction,
  options: Pick<RunOptions, 'elementTimeout'>
): Promise<void> {
  if (!instruction.selector) {
    throw new Error('assert [selector] is enabled — no selector provided')
  }
  const locator = await findElement(page, instruction.selector, options.elementTimeout)
  const enabled = await locator.isEnabled()
  if (!enabled) {
    throw new Error(
      `Assertion failed — expected element "${instruction.selector.value}" to be enabled but it is disabled.`
    )
  }
}

async function assertElementDisabled(
  page: Page,
  instruction: QSLInstruction,
  options: Pick<RunOptions, 'elementTimeout'>
): Promise<void> {
  if (!instruction.selector) {
    throw new Error('assert [selector] is disabled — no selector provided')
  }
  const locator = await findElement(page, instruction.selector, options.elementTimeout)
  const enabled = await locator.isEnabled()
  if (enabled) {
    throw new Error(
      `Assertion failed — expected element "${instruction.selector.value}" to be disabled but it is enabled.`
    )
  }
}

async function assertElementChecked(
  page: Page,
  instruction: QSLInstruction,
  options: Pick<RunOptions, 'elementTimeout'>
): Promise<void> {
  if (!instruction.selector) {
    throw new Error('assert [selector] is checked — no selector provided')
  }
  const locator = await findElement(page, instruction.selector, options.elementTimeout)
  const checked = await locator.isChecked()
  if (!checked) {
    throw new Error(
      `Assertion failed — expected element "${instruction.selector.value}" to be checked but it is not.`
    )
  }
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

/**
 * Dispatches an `assert` instruction to the correct assertion handler.
 * Throws an Error if the assertion fails; resolves if it passes.
 */
export async function executeAssertion(
  page: Page,
  instruction: QSLInstruction,
  store: VariableStore,
  options: Pick<RunOptions, 'elementTimeout'>
): Promise<void> {
  // args after 'assert' command, with variables resolved
  const rawArgs = instruction.args
  const args = rawArgs.map((a) => resolveValue(a, store))

  // Determine assertion type from args pattern
  // "assert page contains <text>"
  if (args[0] === 'page' && args[1] === 'contains') {
    await assertPageContains(page, args[2])
    return
  }

  // "assert page does not contain <text>"
  if (args[0] === 'page' && args[1] === 'does' && args[2] === 'not' && args[3] === 'contain') {
    await assertPageNotContains(page, args[4])
    return
  }

  // "assert [selector] is visible"
  if (instruction.selector && args[0] === 'is' && args[1] === 'visible') {
    await assertElementVisible(page, instruction, options)
    return
  }

  // "assert [selector] is hidden"
  if (instruction.selector && args[0] === 'is' && args[1] === 'hidden') {
    await assertElementHidden(page, instruction, options)
    return
  }

  // "assert [selector] is enabled"
  if (instruction.selector && args[0] === 'is' && args[1] === 'enabled') {
    await assertElementEnabled(page, instruction, options)
    return
  }

  // "assert [selector] is disabled"
  if (instruction.selector && args[0] === 'is' && args[1] === 'disabled') {
    await assertElementDisabled(page, instruction, options)
    return
  }

  // "assert [selector] is checked"
  if (instruction.selector && args[0] === 'is' && args[1] === 'checked') {
    await assertElementChecked(page, instruction, options)
    return
  }

  // "assert [selector] has text <text>"
  if (instruction.selector && args[0] === 'has' && args[1] === 'text') {
    await assertElementHasText(page, instruction, args[2], options)
    return
  }

  // "assert [selector] has value <value>"
  if (instruction.selector && args[0] === 'has' && args[1] === 'value') {
    await assertElementHasValue(page, instruction, args[2], options)
    return
  }

  // "assert url contains <substring>"
  if (args[0] === 'url' && args[1] === 'contains') {
    await assertUrlContains(page, args[2])
    return
  }

  // "assert url equals <url>"
  if (args[0] === 'url' && args[1] === 'equals') {
    await assertUrlEquals(page, args[2])
    return
  }

  // "assert title equals <title>"
  if (args[0] === 'title' && args[1] === 'equals') {
    await assertTitleEquals(page, args[2])
    return
  }

  throw new Error(
    `Unknown assertion: "assert ${rawArgs.join(' ')}"${instruction.selector ? ` [selector: ${instruction.selector.value}]` : ''}`
  )
}
