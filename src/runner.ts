/**
 * QSL Runner — top-level orchestrator.
 * Owns browser lifecycle, calls parser → variable store → executor in order.
 * Does not throw — all errors are captured and returned in RunResult.
 */

import { chromium } from 'playwright'
import { parseQSL } from './parser'
import { createVariableStore } from './variables'
import { executeScript } from './executor'
import type { RunOptions, RunResult } from './types'

/**
 * Executes a QSL script against a real Playwright browser.
 *
 * @param script - The QSL script text to execute
 * @param options - Run configuration (url is required)
 * @returns A RunResult object — never throws
 */
export async function run(script: string, options: RunOptions): Promise<RunResult> {
  const startTime = Date.now()

  // Validate required options
  if (!options.url) {
    return {
      status: 'ERROR',
      steps: [],
      errorMessage: 'RunOptions.url is required.',
      durationMs: Date.now() - startTime,
      screenshots: [],
    }
  }

  // Parse the script
  let instructions
  try {
    instructions = parseQSL(script)
  } catch (parseErr) {
    return {
      status: 'ERROR',
      steps: [],
      errorMessage: `Script parse error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
      durationMs: Date.now() - startTime,
      screenshots: [],
    }
  }

  // Build variable store with built-ins + user-provided variables
  const builtins: Record<string, string> = {
    url: options.url,
    base_url: options.url,
    timestamp: String(Date.now()),
    ...options.variables,
  }
  const store = createVariableStore(builtins)

  // Set defaults
  const resolvedOptions: RunOptions = {
    headless: true,
    screenshotDir: './qsl-screenshots',
    errorMode: 'fail-fast',
    launchTimeout: 30000,
    elementTimeout: 5000,
    waitTimeout: 15000,
    slowMo: 0,
    viewport: { width: 1280, height: 720 },
    ...options,
  }

  let browser = null
  try {
    // Launch browser
    browser = await chromium.launch({
      headless: resolvedOptions.headless ?? true,
      slowMo: resolvedOptions.slowMo ?? 0,
      timeout: resolvedOptions.launchTimeout ?? 30000,
    })

    const page = await browser.newPage()

    // Set viewport
    if (resolvedOptions.viewport) {
      await page.setViewportSize(resolvedOptions.viewport)
    }

    // Execute the script
    const { steps, screenshots } = await executeScript(
      instructions,
      page,
      store,
      resolvedOptions,
      resolvedOptions.onStepComplete
    )

    // Determine overall status
    const failedStep = steps.find((s) => s.status === 'failed')
    const status = failedStep ? 'FAILED' : 'PASSED'
    const errorMessage = failedStep?.errorMessage ?? null

    return {
      status,
      steps,
      errorMessage,
      durationMs: Date.now() - startTime,
      screenshots,
    }
  } catch (err) {
    return {
      status: 'ERROR',
      steps: [],
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startTime,
      screenshots: [],
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
