/**
 * QSL — All TypeScript interfaces and type aliases.
 * This module contains no runtime logic.
 */

// ── Status types ─────────────────────────────────────────────────────────────

/** Overall outcome of a script run. */
export type RunStatus = 'PASSED' | 'FAILED' | 'ERROR'

/** Outcome of a single executed step. */
export type StepStatus = 'passed' | 'failed'

// ── Selector ──────────────────────────────────────────────────────────────────

/** A parsed element selector with its strategy type and value. */
export interface QSLSelector {
  /** The selector strategy to use for element-finding. */
  type: 'label' | 'css' | 'shorthand'
  /** The selector value (label text, CSS string, or shorthand alias). */
  value: string
}

// ── Parsed instruction ────────────────────────────────────────────────────────

/** A single parsed QSL instruction produced by the parser. */
export interface QSLInstruction {
  /** 1-indexed line number in the original script. */
  lineNumber: number
  /** The original raw line text before comment stripping. */
  raw: string
  /** The command keyword, lowercased (e.g. 'navigate', 'click', 'assert'). */
  command: string
  /** Remaining tokens after the command keyword (excludes the selector token). */
  args: string[]
  /** Parsed selector, if this instruction targets a DOM element. */
  selector?: QSLSelector
}

// ── Variable store ────────────────────────────────────────────────────────────

/** Internal variable store: maps variable names (without $) to string values. */
export type VariableStore = Map<string, string>

// ── Run options ───────────────────────────────────────────────────────────────

/** Options passed to `run()`. */
export interface RunOptions {
  /**
   * The URL to test against.
   * Injected as $url and $base_url built-in variables.
   * Required.
   */
  url: string

  /**
   * Run the browser in headless mode.
   * @default true
   */
  headless?: boolean

  /**
   * Directory where screenshots are saved.
   * Both explicit `screenshot` commands and automatic failure screenshots are written here.
   * @default './qsl-screenshots'
   */
  screenshotDir?: string

  /**
   * Error collection mode.
   * - 'fail-fast' — stop execution on the first failed step (default)
   * - 'collect'   — continue running all steps and collect all failures
   * @default 'fail-fast'
   */
  errorMode?: 'fail-fast' | 'collect'

  /**
   * Called after each step completes (pass or fail).
   * Use this for live progress reporting.
   */
  onStepComplete?: (step: StepResult) => void

  /**
   * Browser launch timeout in milliseconds.
   * @default 30000
   */
  launchTimeout?: number

  /**
   * Default timeout for element-finding operations in milliseconds.
   * Applies to label and CSS selectors.
   * @default 5000
   */
  elementTimeout?: number

  /**
   * Default timeout for wait commands in milliseconds.
   * Applies to all `wait for ...` commands.
   * @default 15000
   */
  waitTimeout?: number

  /**
   * Additional variables available in the script.
   * Merged with built-in variables ($url, $base_url, $timestamp).
   * User-defined variables override built-ins if names conflict.
   */
  variables?: Record<string, string>

  /**
   * Slow down each Playwright action by this many milliseconds.
   * Useful for debugging.
   * @default 0
   */
  slowMo?: number

  /**
   * Viewport size.
   * @default { width: 1280, height: 720 }
   */
  viewport?: { width: number; height: number }
}

// ── Step result ───────────────────────────────────────────────────────────────

/** The result of a single executed step. */
export interface StepResult {
  /** Zero-indexed position of this step in the executed instruction list. */
  stepIndex: number
  /** The raw text of this step as written in the script. */
  text: string
  /** Whether this step passed or failed. */
  status: StepStatus
  /** How long this step took to execute, in milliseconds. */
  durationMs: number
  /** Error message if this step failed. Null if passed. */
  errorMessage: string | null
  /**
   * Path to the failure screenshot, if one was taken.
   * Only set when status is 'failed'. Null otherwise.
   */
  screenshotPath: string | null
}

// ── Run result ────────────────────────────────────────────────────────────────

/** The object returned by `run()`. */
export interface RunResult {
  /**
   * Overall script outcome.
   * - 'PASSED'  — all steps passed
   * - 'FAILED'  — one or more steps failed
   * - 'ERROR'   — unexpected error (browser crash, invalid script, etc.)
   */
  status: RunStatus

  /**
   * Results for each executed step, in order.
   * In 'fail-fast' mode, contains steps up to and including the first failure.
   * In 'collect' mode, contains all steps.
   */
  steps: StepResult[]

  /**
   * Human-readable error message for the first failure.
   * Null if status is 'PASSED'.
   */
  errorMessage: string | null

  /** Total execution time in milliseconds, from browser launch to close. */
  durationMs: number

  /**
   * Paths to all screenshots captured during the run.
   * Includes both explicit `screenshot` commands and automatic failure screenshots.
   */
  screenshots: string[]
}

// ── Validation ────────────────────────────────────────────────────────────────

/** A single syntax error from `validate()`. */
export interface ValidationError {
  /** 1-indexed line number where the error occurred. */
  line: number
  /** 1-indexed column (if available). */
  column?: number
  /** Human-readable error description. */
  message: string
  /** The raw line text that caused the error. */
  raw: string
}

/** Return value of `validate()`. */
export interface ValidationResult {
  /** Whether the script has no syntax errors. */
  valid: boolean
  /** List of syntax errors. Empty if valid is true. */
  errors: ValidationError[]
}
