// S-10 종단 검증 설정. **실제 앱을 띄우고 실제 포인터 이벤트로 그린다** —
// 지금까지의 모든 측정은 하네스가 함수를 부른 것이고, 여기서만 DOM·렌더·저장소가 함께 돈다.
//
// 서버는 개발 서버를 그대로 쓴다(`npm run dev:e2e`, HTTP). 빌드본이 아니라 개발본을 재는
// 이유는 **지연이 개발 조건에서 더 나쁘기 때문**이다(모듈이 안 묶여 있다) — 상한을 본다.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,                 // 저장소(IndexedDB)를 공유하므로 순서대로 돈다
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5223",
    // **창 크기를 고정한다** — 캔버스 크기가 화각·무한원 판정의 기준이라(AS-11)
    // 크기가 흔들리면 소실점 셋이 둘로 읽힌다.
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    trace: "off",
    // **컨테이너에 이 판이 쓰는 브라우저 빌드가 없을 수 있다** — 있으면 그것을 쓴다.
    // 없으면 이 줄은 `undefined`라 기본 동작이다(로컬·CI에서 동작이 안 바뀐다).
    launchOptions: { executablePath: process.env.PW_EXECUTABLE || undefined },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // **vite를 직접 부른다** — `npm run`을 거치면 래퍼(node -e spawnSync)가 먼저 끝난 것으로
    // 보여 Playwright가 "서버가 일찍 죽었다"고 판단한다(실제로 걸렸다).
    command: "npx vite --port 5223 --strictPort",
    env: { S2S_HTTP: "1" },              // HTTP — 자체 서명 인증서를 신뢰할 필요가 없다
    url: "http://localhost:5223",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
