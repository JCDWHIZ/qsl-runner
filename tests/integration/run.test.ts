/**
 * Integration smoke tests for QSL run().
 *
 * These tests launch a real browser against a real URL and are skipped by default.
 * To run them: set TEST_INTEGRATION=true in your environment.
 *
 * Example:
 *   TEST_INTEGRATION=true npx jest tests/integration
 */

import { run } from '../../src/runner'

const RUN_INTEGRATION = process.env['TEST_INTEGRATION'] === 'true'
const itIntegration = RUN_INTEGRATION ? it : it.skip

describe('run() — integration', () => {
  itIntegration(
    'navigates to example.com and asserts page contains "Example"',
    async () => {
      const result = await run(`
        navigate to $url
        assert page contains "Example Domain"
      `, {
        url: 'https://example.com',
        headless: true,
        errorMode: 'fail-fast',
      })

      expect(result.status).toBe('PASSED')
      expect(result.steps).toHaveLength(2)
      expect(result.steps[0].status).toBe('passed')
      expect(result.steps[1].status).toBe('passed')
      expect(result.errorMessage).toBeNull()
      expect(result.durationMs).toBeGreaterThan(0)
    },
    60000
  )

  itIntegration(
    'returns FAILED status when assertion fails',
    async () => {
      const result = await run(`
        navigate to $url
        assert page contains "This text does not exist on the page 12345"
      `, {
        url: 'https://example.com',
        headless: true,
        errorMode: 'fail-fast',
      })

      expect(result.status).toBe('FAILED')
      expect(result.errorMessage).not.toBeNull()
      expect(result.steps[1].status).toBe('failed')
    },
    60000
  )

  itIntegration(
    'collects all failures in collect mode',
    async () => {
      const result = await run(`
        navigate to $url
        assert page contains "Does not exist"
        assert page contains "Also does not exist"
      `, {
        url: 'https://example.com',
        headless: true,
        errorMode: 'collect',
      })

      expect(result.status).toBe('FAILED')
      const failed = result.steps.filter((s) => s.status === 'failed')
      expect(failed.length).toBe(2)
    },
    60000
  )

  itIntegration(
    'returns ERROR status when url is missing',
    async () => {
      const result = await run('navigate to $url', { url: '' })
      expect(result.status).toBe('ERROR')
    },
    10000
  )
})
