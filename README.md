# QSL

> Plain-English browser automation scripts powered by Playwright.

## Install

```bash
npm install qsl-runner playwright
npx playwright install chromium
```

## Quick Start

```typescript
import { run } from 'qsl-runner'

const result = await run(`
  navigate to $url
  type "user@test.com" into @email
  type "secret" into @password
  click @submit
  assert url contains "/dashboard"
`, {
  url: 'https://staging.myapp.com',
})

if (result.status === 'PASSED') {
  console.log('All steps passed')
} else {
  console.error('Failed:', result.errorMessage)
}
```

## Features

- **Plain-English scripting** — readable by anyone, writable by developers
- **Three-strategy element finding** — `[Label]`, `{css-selector}`, `@shorthand`
- **Full TypeScript support** — ships with types, fully typed API
- **Two error modes** — fail-fast or collect all failures
- **Live step callbacks** — `onStepComplete` hook for real-time progress
- **Screenshot on failure** — automatic screenshots when a step fails
- **Variable system** — `set $var = "value"` and `$var` substitution
- **Built-in assertions** — `assert` commands with clear error messages

## License

MIT
