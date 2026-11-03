import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  reporter: 'list',
  // Filet contre la charge : au-delà, WebKit affamé fait durer les ressorts (pas borné à 50 ms) bien plus que les
  // attentes des tests. Pas de `retries`, qui masquerait les vrais défauts.
  workers: 4,
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
