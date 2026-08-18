/**
 * QSL Selectors — Three-strategy element finding.
 *
 * Strategies:
 *   1. Label   [Text]     — 6-step fallback chain using Playwright semantic locators
 *   2. CSS     {selector} — direct CSS selector with configurable timeout
 *   3. Shorthand @alias   — semantic alias mapped to multiple CSS selectors
 */

import type { Page, Locator } from 'playwright'
import type { QSLSelector } from './types'

// ── Shorthand map ─────────────────────────────────────────────────────────────

/** Maps shorthand alias names to ordered lists of CSS selectors to try. */
const SHORTHAND_MAP: Record<string, string[]> = {
  email: ['[type="email"]', '[name="email"]', '[placeholder*="email" i]'],
  password: ['[type="password"]'],
  submit: [
    '[type="submit"]',
    'button:has-text("Submit")',
    'button:has-text("Save")',
    'button:has-text("Confirm")',
    'button:has-text("Sign in")',
    'button:has-text("Log in")',
  ],
  username: ['[name="username"]', '[name="user"]', '[placeholder*="username" i]'],
  search: ['[type="search"]', '[role="searchbox"]', '[placeholder*="search" i]'],
  phone: ['[type="tel"]', '[name="phone"]', '[placeholder*="phone" i]'],
  name: ['[name="name"]', '[name="fullname"]', '[placeholder*="name" i]'],
  'url-input': ['[type="url"]'],
}

// ── Individual timeout used when trying multiple fallback strategies ───────────
const LABEL_STRATEGY_TIMEOUT_MS = 2000
const SHORTHAND_STRATEGY_TIMEOUT_MS = 2000

// ── Label fallback chain ──────────────────────────────────────────────────────

/**
 * Attempts to find an element by label text using a 6-step fallback chain.
 * Each strategy is tried with a short individual timeout.
 * The first strategy that resolves a visible element wins.
 */
export async function findByLabel(
  page: Page,
  label: string,
  _timeout?: number
): Promise<Locator> {
  const strategies: Array<() => Locator> = [
    () => page.getByLabel(label),
    () => page.getByRole('button', { name: label }),
    () => page.getByRole('link', { name: label }),
    () => page.getByPlaceholder(label),
    () => page.getByText(label),
    () => page.getByAltText(label),
  ]

  const strategyNames = [
    'getByLabel',
    'getByRole(button)',
    'getByRole(link)',
    'getByPlaceholder',
    'getByText',
    'getByAltText',
  ]

  for (const strategy of strategies) {
    try {
      const locator = strategy()
      await locator.waitFor({ state: 'visible', timeout: LABEL_STRATEGY_TIMEOUT_MS })
      return locator
    } catch {
      // Try next strategy
    }
  }

  throw new Error(
    `Element with label "${label}" not found.\nTried: ${strategyNames.join(', ')}`
  )
}

// ── CSS selector ──────────────────────────────────────────────────────────────

/**
 * Finds an element by CSS selector with a configurable timeout.
 */
export async function findByCss(
  page: Page,
  selector: string,
  timeout = 5000
): Promise<Locator> {
  const locator = page.locator(selector)
  try {
    await locator.waitFor({ state: 'visible', timeout })
  } catch {
    throw new Error(`Element "{${selector}}" not found within ${timeout}ms.`)
  }
  return locator
}

// ── Shorthand alias resolution ────────────────────────────────────────────────

/**
 * Resolves a shorthand alias to an element by trying each of its mapped CSS selectors.
 */
export async function findByShorthand(
  page: Page,
  alias: string,
  _timeout?: number
): Promise<Locator> {
  const selectors = SHORTHAND_MAP[alias]

  if (!selectors) {
    throw new Error(
      `Unknown shorthand alias "@${alias}". Known aliases: ${Object.keys(SHORTHAND_MAP).join(', ')}`
    )
  }

  for (const cssSelector of selectors) {
    try {
      const locator = page.locator(cssSelector)
      await locator.waitFor({ state: 'visible', timeout: SHORTHAND_STRATEGY_TIMEOUT_MS })
      return locator
    } catch {
      // Try next
    }
  }

  throw new Error(
    `Element "@${alias}" not found. Tried CSS selectors: ${selectors.join(', ')}`
  )
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

/**
 * Picks the correct element-finding strategy based on the selector type
 * and returns a resolved Playwright Locator.
 */
export async function findElement(
  page: Page,
  selector: QSLSelector,
  timeout?: number
): Promise<Locator> {
  switch (selector.type) {
    case 'label':
      return findByLabel(page, selector.value, timeout)
    case 'css':
      return findByCss(page, selector.value, timeout)
    case 'shorthand':
      return findByShorthand(page, selector.value, timeout)
    default: {
      const _exhaustive: never = selector.type
      throw new Error(`Unknown selector type: ${String(_exhaustive)}`)
    }
  }
}
