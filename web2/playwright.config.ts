import { defineConfig } from '@playwright/test'

// dpr 1과 2 둘 다에서 확인한다 — dpr 1에서만 보면 안 걸린다
//
// PW_CHROMIUM_EXE — 브라우저를 이미 깔아 둔 환경(컨테이너 등)에서 그것으로 돌리는 통로.
// 안 주면 평소대로 playwright가 받은 것을 쓴다(CI는 그대로다).
const exe = process.env.PW_CHROMIUM_EXE

// PW_PORT — **평행 세션**의 통로(web2-35). 기본은 5301이라 CI·평소 실행은 그대로다.
// ⚠⚠ 왜 필요한가(PITFALLS #70): `reuseExistingServer: true`는 그 포트에 **누가 띄운
// 서버든** 그대로 쓴다. 작업 트리가 둘이면 «내 트리를 잰다」가 조용히 «남의 트리를
// 잰다»가 된다 — #70이 이름 붙인 그 결함의 **평행 세션 판**이다. 자기 포트를 주면
// 그 길이 막힌다: `PW_PORT=5331 npx playwright test …`
const port = Number(process.env.PW_PORT ?? 5301)

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1200, height: 800 },
    ...(exe ? { launchOptions: { executablePath: exe } } : {}),
  },
  projects: [
    { name: 'dpr1', use: { deviceScaleFactor: 1 } },
    { name: 'dpr2', use: { deviceScaleFactor: 2 } },
  ],
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    port,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
