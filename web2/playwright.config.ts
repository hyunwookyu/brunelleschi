import { defineConfig } from '@playwright/test'

// dpr 1과 2 둘 다에서 확인한다 — dpr 1에서만 보면 안 걸린다
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5301',
    viewport: { width: 1200, height: 800 },
  },
  projects: [
    { name: 'dpr1', use: { deviceScaleFactor: 1 } },
    { name: 'dpr2', use: { deviceScaleFactor: 2 } },
  ],
  webServer: {
    command: 'npm run dev',
    port: 5301,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
