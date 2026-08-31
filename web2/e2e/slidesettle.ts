// web2-40 2번 — **겹은 이제 밀려 들어온다**(`LAY_SLIDE_MS` = 300 ms).
//
// 그래서 「겹을 얹고 **곧바로** 픽셀을 읽는」 팔은 **덜 온 종이**를 읽는다 —
// PITFALLS #71 ㉤의 형태 그대로다(겹에 한 단계를 끼우면 그 겹을 읽던 팔이 «사라졌다»로
// 읽는다). 그 팔들이 재는 것은 «얹힌 뒤의 화면»이므로 동작을 그 자리에서 끝내고 잰다.
//
// 부르는 것은 앱이 「획이 들어오면」 부르는 것과 **같은 함수**다(`settleSlides` — #54).
// ⚠ 이것을 **한 파일에 둔다**: 스펙마다 `diag.slideSettleForTest()`를 손으로 적으면
//   새 스펙이 그것을 «안 적는 것»이 기본값이 된다(PITFALLS #90 ㉠). 여기 한 줄을
//   부르면 그 까닭이 함께 온다.
// ⚠⚠ 동작 자체의 게이트는 `slide40.spec.ts`가 진다 — 여기서 끝내는 것은 «다른 것을
//   재는 팔»의 조건이지 그 동작의 면제가 아니다.

import type { Page } from '@playwright/test'

export const settleSlide = (page: Page): Promise<unknown> =>
  page.evaluate(() => (window as any).__b2.diag.slideSettleForTest())
