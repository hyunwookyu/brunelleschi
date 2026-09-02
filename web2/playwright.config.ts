import { defineConfig } from '@playwright/test'
// **원장 쓰기 관문**(RUN.md §1) — `LEDGER=1`이 없으면 `stage0/out`에 한 바이트도 안 쓴다.
// ⚠ 설정 파일은 **워커 프로세스에서도 로드된다** — 그래서 이 한 줄이 스펙 전부에 걸린다.
import './tools/ledgerguard'
import { DPR2_SPECS, MEASURE_SPECS } from './e2e/dpr2list'

// web2-54 §1 — **실행이 셋으로 갈린다**(둘은 요구가 정반대다: «안 깨졌는가» vs «값을 남긴다»).
//
//   e2e:green    병렬 4 · 계측 넷 제외 · dpr2는 목록만(e2e/dpr2list.ts)   매 푸시 · CI
//   e2e:night    전량 · dpr2 전부 · 계측 포함 · 병렬 4                     밤 · 태그
//   e2e:ledger   LEDGER=1 · 워커 1 · 스펙 하나씩                           #99 무변
//
// 모드는 E2E_MODE로 들어온다(넣는 자리는 tools/e2e.mjs — npm run e2e:green 등).
// **E2E_MODE가 없으면 종전 그대로다**(전량 · 워커는 CLI가 정한다) — 원장 정본 명령
// `LEDGER=1 npx playwright test e2e/x.spec.ts --workers=1`이 한 글자도 안 바뀐다(#99).
//
// ⚠ 계측 넷(cost18·cost20·cost22·brushperf)은 회귀 시험이 아니라 **추세 측정**이고
// **워커 수가 그 수를 바꾼다** — 병렬 실행에 남기면 빨라진 만큼 그 값이 못 쓰게 된다(㉠).
// 시험을 지우거나 skip하는 것이 아니다 — 밤·원장 실행에 전부 남는다.
const MODE = process.env.E2E_MODE // 'green' | 'night' | undefined(종전)
const measureIgnore = MEASURE_SPECS.map(s => `**/${s}.spec.ts`)
const dpr2Match = DPR2_SPECS.map(s => `**/${s}.spec.ts`)

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
  // green·night는 워커 4로 «명시»한다(기계·CI마다 기본값이 달라지면 게이트 1·2의
  // 「같은 실행」 전제가 흔들린다). 모드 없음 = 종전(CLI의 --workers가 정한다 — 원장은 1).
  ...(MODE === 'green' || MODE === 'night' ? { workers: 4 } : {}),
  // 초록 실행은 계측 넷을 안 돈다(㉠ — 밤·원장에는 전부 남는다)
  ...(MODE === 'green' ? { testIgnore: measureIgnore } : {}),
  // 게이트(통과 집합 대조)용 JSON — E2E_JSON이 준 파일로 결과를 남긴다
  ...(process.env.E2E_JSON
    ? { reporter: [['line'], ['json', { outputFile: process.env.E2E_JSON }]] as any }
    : {}),
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1200, height: 800 },
    ...(exe ? { launchOptions: { executablePath: exe } } : {}),
  },
  projects: [
    { name: 'dpr1', use: { deviceScaleFactor: 1 } },
    // 초록 실행의 dpr2는 **픽셀을 값으로 읽는 스펙만**(㉡ — e2e/dpr2list.ts가 조건과
    // 목록의 정본). 밤·종전 실행은 전량 dpr2다 — 목록 밖 스펙이 dpr2에서만 깨지면
    // 목록(조건)이 틀린 것이고 그때 조건을 넓힌다.
    { name: 'dpr2', use: { deviceScaleFactor: 2 }, ...(MODE === 'green' ? { testMatch: dpr2Match } : {}) },
  ],
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    port,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
