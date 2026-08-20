// web2 빌드 — base는 상대 경로(하위 경로 배포 대응, web/과 같은 이유)
import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  test: {
    include: ['test/**/*.test.ts'], // e2e는 playwright가 돈다
  },
})
