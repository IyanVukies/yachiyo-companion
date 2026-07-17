import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'output/playwright/results',
  reporter: [['list'], ['html', { outputFolder: 'output/playwright/report', open: 'never' }]],
  timeout: 45_000,
  expect: { timeout: 8_000 },
  workers: 1,
  retries: 0,
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
})
