import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173/revision/',
  },
  projects: [
    {
      name: 'ipad',
      use: { ...devices['Desktop Safari'], viewport: { width: 1180, height: 820 }, hasTouch: true },
    },
    {
      name: 'iphone',
      use: { ...devices['Desktop Safari'], viewport: { width: 393, height: 852 }, hasTouch: true },
    },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173',
    url: 'http://localhost:4173/revision/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
