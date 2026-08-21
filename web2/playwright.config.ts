import { defineConfig } from '@playwright/test'

// dpr 1과 2 둘 다에서 확인한다 — dpr 1에서만 보면 안 걸린다
//
// PW_CHROMIUM_EXE — 브라우저를 이미 깔아 둔 환경(컨테이너 등)에서 그것으로 돌리는 통로.
// 안 주면 평소대로 playwright가 받은 것을 쓴다(CI는 그대로다).
const exe = process.env.PW_CHROMIUM_EXE

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5301',
    viewport: { width: 1200, height: 800 },
    ...(exe ? { launchOptions: { executablePath: exe } } : {}),
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
