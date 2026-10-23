/**
 * QSL Runner — top-level orchestrator.
 * Owns browser lifecycle, calls parser → variable store → executor in order.
 * Does not throw — all errors are captured and returned in RunResult.
 */

import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { parseQSL } from './parser'
import { createVariableStore } from './variables'
import { executeScript } from './executor'
import type { RunOptions, RunResult } from './types'

// ── Friendly error message formatter ─────────────────────────────────────────

/**
 * Converts raw Playwright error messages into human-readable descriptions.
 * Strips internal stack frames and normalises timeout messages.
 */
function formatFriendlyError(rawMessage: string): string {
  const msg = rawMessage.trim()

  if (msg.includes("Cannot read properties of null (reading 'innerText')")) {
    return 'Timed out waiting for page content to appear (page redirected or refreshed)'
  }

  const timeoutMatch = msg.match(
    /(?:waitForFunction|waitFor|waitForURL):\s*Timeout\s*(\d+)ms\s*exceeded/i
  )
  if (timeoutMatch) {
    const sec = Math.round(parseInt(timeoutMatch[1], 10) / 1000)
    return `Timed out waiting ${sec}s for condition to be met`
  }

  if (msg.includes('\n    at ') || msg.includes(' at eval (')) {
    return msg
      .split('\n')[0]
      .replace(/^(?:page|locator)\.\w+:\s*/, '')
      .trim()
  }

  return msg
}

// ── Main run function ─────────────────────────────────────────────────────────

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
    recordVideo: false,
    videoDir: './qsl-videos',
    ...options,
  }

  let browser = null
  let context = null

  try {
    // ── Browser launch with channel fallback ───────────────────────────────
    try {
      browser = await chromium.launch({
        headless: resolvedOptions.headless ?? true,
        slowMo: resolvedOptions.slowMo ?? 0,
        timeout: resolvedOptions.launchTimeout ?? 30000,
      })
    } catch (launchErr: unknown) {
      const errMsg = launchErr instanceof Error ? launchErr.message : String(launchErr)
      let fallbackSuccess = false

      if (
        errMsg.includes("Executable doesn't exist") ||
        errMsg.includes('playwright install') ||
        errMsg.includes('Failed to launch')
      ) {
        for (const channel of ['chrome', 'msedge']) {
          try {
            browser = await chromium.launch({
              headless: resolvedOptions.headless ?? true,
              slowMo: resolvedOptions.slowMo ?? 0,
              channel,
            })
            fallbackSuccess = true
            break
          } catch {
            // try next channel
          }
        }
      }

      if (!fallbackSuccess) {
        throw new Error(
          `Browser launch failed: ${errMsg}. ` +
            'Please install Playwright Chromium (npx playwright install chromium) ' +
            'or install Google Chrome / Microsoft Edge.'
        )
      }
    }

    // browser is guaranteed non-null here (either launched successfully or threw)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const activeBrowser = browser!

    // ── BrowserContext creation with video + FFmpeg fallback ───────────────
    const wantVideo = Boolean(resolvedOptions.recordVideo)
    const videoDir = resolvedOptions.videoDir ?? './qsl-videos'

    let page: Page

    try {
      context = await activeBrowser.newContext({
        recordVideo: wantVideo
          ? { dir: videoDir, size: { width: 1280, height: 720 } }
          : undefined,
      })
      page = await context.newPage()
      if (resolvedOptions.viewport) {
        await page.setViewportSize(resolvedOptions.viewport)
      }
    } catch (pageErr: unknown) {
      const errMsg = pageErr instanceof Error ? pageErr.message : String(pageErr)
      if (
        wantVideo &&
        (errMsg.includes('ffmpeg') || errMsg.includes('Video rendering requires ffmpeg'))
      ) {
        console.warn(
          '\u26a0\ufe0f  FFmpeg is missing on this machine. Continuing execution without video recording.'
        )
        if (context) await context.close().catch(() => {})
        context = await activeBrowser.newContext()
        page = await context.newPage()
        if (resolvedOptions.viewport) {
          await page.setViewportSize(resolvedOptions.viewport)
        }
      } else {
        throw pageErr
      }
    }

    // ── Execute the script ─────────────────────────────────────────────────
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
    const rawError = failedStep?.errorMessage ?? null
    const errorMessage = rawError ? formatFriendlyError(rawError) : null

    return {
      status,
      steps,
      errorMessage,
      durationMs: Date.now() - startTime,
      screenshots,
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    return {
      status: 'ERROR',
      steps: [],
      errorMessage: formatFriendlyError(raw),
      durationMs: Date.now() - startTime,
      screenshots: [],
    }
  } finally {
    if (context) {
      await context.close().catch(() => {})
    }
    if (browser) {
      await browser.close().catch(() => {})
    }
  }
}
