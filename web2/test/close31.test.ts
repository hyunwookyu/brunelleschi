// web2-31 **마감 원장** — 전량 검증과 「선재 결함」의 A/B를 값으로 남긴다.
//
// ⚠⚠ **왜 이 파일이 있나**(마감 리뷰어 [3] · #25): 31 마감은 「main 트리에서 같은 팔을
//   돌려도 똑같이 2 failed였다」만 적고 **그 실측값을 아무 데도 안 남겼다**. 원장 밖 측정은
//   규칙이 있어도 안 걸린다(CLAUDE.md §5.1) — 「선재 결함」이라는 판정의 근거가 문장뿐이면
//   다음 세션은 그것을 확인할 방법이 없다. 그래서 **전/후/대조군을 한자리에** 세운다.
//
// ⚠ 이 파일은 **기록 원장**이다 — 값을 새로 «계산»하지 않는다. 값의 출처는 전부
//   실행 로그이고 각 칸에 `source`로 적었다. 이 파일이 하는 계산은 **셈의 아귀**뿐이다
//   (470 + 2 = 472 · 769 + 7 = 776 · 전/후가 실제로 다르다 · main과 이 트리가 같다).
//   그 단언들이 이 파일의 반증 조건이다(D-3): 아귀가 안 맞으면 여기가 빨개진다.
//
// 원장: LEDGER=1 npx vitest run test/close31.test.ts  →  stage0/out/close31_web2.json

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/** 전량 e2e — 마감 세션이 실제로 돌린 한 벌(`--workers=1` · dpr1 + dpr2). */
const FULL_E2E = {
  command: 'npx playwright test --workers=1 (dpr1+dpr2)',
  tree: 'db3d7dc (web2-31 마감 — 이 대응 «전»)',
  cases: 472,
  passed: 470,
  failed: 2,
  wall_min: 34.1,
  failed_arms: [
    'ui34.spec ④ 「접힌 지우개가 지금 크기를 말한다」 — dpr1 · dpr2 각 한 칸',
  ],
  source: '실행 요약 「2 failed · 470 passed (34.1m)」',
}

/** **선재 결함의 A/B** — 같은 팔의 실측 `bw`(각인 글자의 잉크 상자 · 사용자단위). */
const AB = {
  metric: "e2e/ui34.spec.ts 34-3 ④의 `getBBox().width` (id `fold-erase-pencil-text` · 각인 «28»)",
  gate_before: 6.6,
  gate_before_source: '팔이 **손으로 든 상수**였다(#88) — 창 rect에서 베낀 수',
  this_tree_before: 6.839224815368652,
  main_tree: 6.839224815368652,
  main_tree_commit: 'c4932ab (web2-34 마감 검증)',
  main_tree_how: (
    '`git worktree add --detach <임시> c4932ab`로 **그 트리를 그대로 꺼내** 같은 명령을 돌렸다'
    + '(`PW_PORT=5351 npx playwright test e2e/ui34.spec.ts -g "34-3 ④" --workers=1`, dpr1·dpr2). '
    + '⚠ 포트를 갈랐다 — `reuseExistingServer: true`가 고정 포트에 걸리면 **남의 트리를 잰다**(#70의 평행 판).'
  ),
  after: 6.599998950958252,
  gate_after: 6.6,
  gate_after_source: "창 rect `fold-erase-pencil-win`의 `getBBox().width` — **대상에서 읽는다**",
  verdict: (
    '**선재다.** `main`(c4932ab) 트리와 이 트리(db3d7dc)의 실측이 **소수점 아래 전부 같다**'
    + '(6.839224815368652) — dpr1·dpr2 넷 칸 모두. 31의 어떤 항목도 이 수를 안 움직였다는 뜻이고, '
    + '그래서 「31이 깨뜨린 것이 아니다」가 문장이 아니라 **값**으로 선다.'
  ),
}

/** **왜 넘쳤나** — `textLength`는 «전진폭»을 묶고 `getBBox()`는 «잉크»를 낸다. */
const WHY = {
  advance_under_old_impl: 6.6,
  ink_under_old_impl: 6.839224815368652,
  ink_without_textlength: 9.708766,
  advance_without_textlength: 9.369167,
  note: (
    '옛 판은 `textLength = 창 폭`을 걸었다. 전진폭은 **정확히** 6.600000이 되는데 잉크는 '
    + '6.839225로 남는다 — 글리프가 자기 전진폭 밖으로 삐져나오기 때문이다. '
    + '고친 판은 **잉크를 재고 그 비로 전진폭을 되민다**(`textLength = 전진폭 × 창폭 / 잉크`).'
  ),
  scale_dependence: {
    what: (
      '⚠⚠ **같은 글자·같은 글꼴인데 «그려지는 배수»에 따라 잉크가 갈린다** — D-1이 잡은 두 번째 갈림. '
      + '`.tool.on svg`가 고른 도구에 `scale(1.14)`를 얹으므로(index.html) 「28」의 잉크가 갈린다. '
      + '그래서 «고른 채로» 맞춘 각인이 «놓은 뒤»에는 창을 넘었다 — 34-3 ④가 빨갰던 마지막 자리다.'
    ),
    ink_when_on: 9.364343643188477,
    adv_when_on: 9.36434268951416,
    ink_when_off: 9.708765983581543,
    adv_when_off: 9.36916732788086,
    fix: '`transitionend`(propertyName transform)에서 넷을 다시 맞춘다 — 배수가 다 움직인 뒤의 상태로.',
  },
}

/**
 * **글꼴 대조군** — 이 기기(HeadlessChrome 151 · Windows 10)에서 실제로 잰 값.
 * 각인 「28」 · font-size 8.5 · `textLength` 없음. `over` = 잉크 ÷ 전진폭.
 *
 * ⚠ 34-3이 컨테이너에서 잰 6.60은 **그 기기의 `system-ui`**가 낸 수다. 아래 표가 보이듯
 * `over`는 글꼴마다 1.000 ~ 1.049로 갈리므로 「전진폭만 묶는 판」은 **기기 따라** 빨개진다.
 * 고친 판은 잉크에서 되밀므로 **이 표의 어느 줄에서도** 창 안이다(D-5 — 대역을 덮는다).
 */
const FONTS: Record<string, { ink: number; adv: number; over: number }> = {
  'system-ui,sans-serif': { ink: 9.708766, adv: 9.369167, over: 1.036246 },
  'Segoe UI': { ink: 9.609185, adv: 9.162928, over: 1.048703 },
  Arial: { ink: 9.754408, adv: 9.457556, over: 1.031388 },
  Tahoma: { ink: 9.667276, adv: 9.280779, over: 1.041645 },
  Verdana: { ink: 11.059298, adv: 10.812844, over: 1.022793 },
  Georgia: { ink: 9.82093, adv: 9.82093, over: 1 },
  'Courier New': { ink: 10.203946, adv: 10.203946, over: 1 },
  'sans-serif': { ink: 9.708766, adv: 9.369167, over: 1.036246 },
  serif: { ink: 10.056632, adv: 10.056632, over: 1 },
  monospace: { ink: 8.799553, adv: 8.799554, over: 1 },
}

/** 마감 검증 — **이 대응 뒤에** 다시 잰 값. */
const VERIFY = {
  unit: { command: 'npx vitest run (web2/)', files: 102, tests: 778, wall_s: 25.13, failed: 0 },
  unit_before_this_close: { files: 101, tests: 776, wall_s: 31.47 },
  unit_prev_row: 769,
  unit_delta_explained: (
    '**769 → 776 → 778.** 앞의 +7은 전부 31-2의 `test/lens31.test.ts`이고, 뒤의 +2는 '
    + '**이 마감 원장 자신**(`test/close31.test.ts` · 파일 101 → 102)이다. '
    + '⚠ `NOTES.md`의 31-2 「검증」 절이 **775건 · 이 항목이 6건**이라 적은 것이 한 건 모자랐다: '
    + '그 문장은 **게이트 다섯 + 원장 = 6**을 센 것이고, 그 뒤 **2차 리뷰어 [10] 대응으로 게이트 ⑥'
    + '(`gate6_zoomfit_under_lens`)이 붙으면서 7이 됐는데 검증 줄이 안 따라왔다.** '
    + '**그 +1의 정체가 게이트 ⑥이다**(마감 리뷰어 [8]). '
    + '⚠⚠ 벽시계 31.47s → 25.13s는 **팔이 는 쪽이 아니라 준 쪽**이다 — 두 실행의 차는 '
    + '부하의 몫으로 본다(web2-34가 같은 형태를 이미 적었다: 팔 +13에 벽시계 31.8 → 30.7s).'
  ),
  typecheck: { command: 'npx tsc --noEmit', errors: 0 },
  e2e_subset: {
    command: 'npx playwright test ui34 icons papericon31 sidebar ui34place zones flow --workers=1 (dpr1+dpr2)',
    cases: 60,
    passed: 60,
    failed: 0,
    note: (
      '⚠ **전량이 아니다** — 이 대응은 「전량 e2e는 돌리지 마라」를 받았다. '
      + '고친 자리에 걸리는 파일과 그 이웃만 돌렸고, `zones`·`flow`는 각인을 만지므로 목록에 더했다.'
    ),
  },
  e2e_full_delta: (
    '⚠⚠ **위 `full_e2e`(472칸 · 470 passed · 2 failed)는 이 대응 «전»의 트리 수다.** 이 대응이 바꾼 것 둘: '
    + '① 빨갛던 두 칸(`ui34 ④` dpr1·dpr2)이 초록이 됐다 '
    + '② 반증 팔 `ui34 ④′`를 하나 더해 **2칸이 늘었다**(1팔 × dpr 2). '
    + '그래서 이 트리의 전량은 **474칸**이 되고 그중 470 + 2 + 2가 초록일 «것»이다 — '
    + '**그 «것»을 통과로 적지 않는다**: 전량을 안 돌렸으므로 474의 결과는 **미측정**이다(#25 · #58). '
    + '병합하는 세션이 전량을 돌려 그 자리를 채운다.'
  ),
}

describe('web2-31 마감 원장 — 전량 검증과 선재 결함의 A/B', () => {
  it('셈의 아귀 — 이 원장이 스스로 반증되는 자리 (D-3)', () => {
    // ㉠ 전량의 셈
    expect(FULL_E2E.passed + FULL_E2E.failed).toBe(FULL_E2E.cases)
    // ㉡ **선재의 근거** — main 트리와 이 트리가 같은 값이다(다르면 「선재」가 무너진다)
    expect(AB.main_tree).toBe(AB.this_tree_before)
    // ㉢ **수리의 근거** — 전/후가 실제로 다르고, 후는 문 안 전은 문 밖이다
    expect(AB.this_tree_before).toBeGreaterThan(AB.gate_before + 1e-3)
    expect(AB.after).toBeLessThanOrEqual(AB.gate_after + 1e-3)
    // ㉣ 단위 팔의 셈 — 769 + 7(lens31) = 776 · + 2(이 파일) = 778
    expect(VERIFY.unit_prev_row + 7).toBe(VERIFY.unit_before_this_close.tests)
    expect(VERIFY.unit_before_this_close.tests + 2).toBe(VERIFY.unit.tests)
    expect(VERIFY.unit_before_this_close.files + 1).toBe(VERIFY.unit.files)
    // ㉤ 글꼴 대조군 — **어느 줄도 창 6.6에 그냥은 안 들어간다**(그래서 되밈이 필요하다)
    for (const [name, f] of Object.entries(FONTS)) {
      expect(f.ink, `${name} — 무압축 잉크는 창을 넘는다`).toBeGreaterThan(AB.gate_after)
      expect(f.over, `${name} — 잉크/전진폭`).toBeGreaterThanOrEqual(1)
    }
    // ㉥ 옛 판의 자리 — 전진폭은 창 폭인데 잉크는 넘는다
    expect(WHY.advance_under_old_impl).toBe(AB.gate_before)
    expect(WHY.ink_under_old_impl).toBeGreaterThan(WHY.advance_under_old_impl)
    // ㉦ 배수 갈림 — 고른 상태와 안 고른 상태의 잉크가 실제로 다르다
    expect(WHY.scale_dependence.ink_when_on).not.toBe(WHY.scale_dependence.ink_when_off)
  })

  it('원장 — stage0/out/close31_web2.json', () => {
    const payload = JSON.stringify({
      what: 'web2-31 **마감 원장** — 전량 e2e 한 벌 · 「선재 결함」의 A/B(main 트리 실측) · 글꼴 대조군 · 고친 뒤의 값.',
      why: (
        '마감 리뷰어 [3]: 「main 트리에서 같은 팔을 돌려도 똑같이 2 failed였다」만 있고 **그 실측 `bw`가 없었다**. '
        + '원장 밖 측정은 규칙이 있어도 안 걸린다(#25 · CLAUDE.md §5.1) — 그래서 전/후/대조군을 한자리에 세운다.'
      ),
      canonical_command: 'LEDGER=1 npx vitest run test/close31.test.ts',
      nature: (
        '⚠ **기록 원장이다** — 값을 새로 계산하지 않는다. 출처는 실행 로그이고 이 파일이 하는 계산은 '
        + '**셈의 아귀**뿐이다(위 팔 하나가 그것을 단언한다). 아귀가 안 맞으면 그 팔이 빨개진다 — 그것이 이 원장의 반증 조건이다.'
      ),
      full_e2e: FULL_E2E,
      pre_existing_ab: AB,
      why_it_overflowed: WHY,
      font_control: {
        what: '각인 「28」 · font-size 8.5 · `textLength` 없음 — 이 기기에서 실제로 잰 값',
        env: 'HeadlessChrome/151.0.7922.34 · Windows NT 10.0 · dpr 1',
        rows: FONTS,
        note: (
          '⚠ 34-3이 컨테이너에서 잰 **6.60**은 그 기기의 `system-ui`가 낸 수다. `over`(잉크÷전진폭)가 '
          + '**1.000 ~ 1.049**로 갈리므로 「전진폭만 묶는 판」은 **기기 따라** 빨개진다 — 그것이 이 회차가 '
          + '겪은 일이다. 고친 판은 잉크에서 되밀므로 이 표의 **어느 줄에서도** 창 안이다(D-5).'
        ),
      },
      verification_after_fix: VERIFY,
      selfcheck_flags_known: {
        pass_counters_zero: (
          '⚠ `verification_after_fix`의 `unit.failed`·`typecheck.errors`·`e2e_subset.failed`가 **0**으로 깔린다 — '
          + '「카운터 0」·「오차류 지표가 정확히 0」의 대상처럼 보인다. **셋 다 «통과했다»의 표기 자체다**: '
          + '이 원장은 계산이 아니라 **실행 결과의 기록**이고, 그 실행이 실패하면 이 파일에 적히는 수가 0이 아니게 된다'
          + '(직전 트리의 같은 자리가 `full_e2e.failed = 2`였다 — **같은 칸이 0이 아닌 실례가 이 원장 안에 있다**). '
          + '**임계를 안 건다** — 무엇도 이 0으로 판정하지 않는다.'
        ),
        no_gate_block: (
          '⚠ 이 원장에는 `gate` 블록이 **없다** — 게이트를 새로 세우는 원장이 아니라 **마감 기록**이기 때문이다. '
          + '도달 가능성에 해당하는 것은 위 팔 하나(「셈의 아귀」)이고, 그 팔이 빨개지는 조건이 이 원장의 반증 조건이다.'
        ),
        no_constants_snapshot: (
          '**web2 라인 전체의 유보다** — 이 라인은 `constantsSnapshot()`을 안 쓴다. 문서는 원장을 **이름으로** 가리킨다.'
        ),
      },
      pitfalls: ['#88', '#54', '#25', '#70', '#42', '#58'],
      pitfalls_note: (
        '#88 — 팔이 든 상수(`6.6`·`8.8`)를 **대상(창 rect)에서 읽게** 고쳤다. 이 회차가 #88 본문에 '
        + '「팔이 다른 요소의 좌표·치수를 옮겨 적는 형태」를 사례로 더한 근거가 이 원장이다. '
        + '#54 — 각인 셋이 한 함수(`fitMark`)를 쓴다. '
        + '#25 — 이 파일 자체가 그 조항의 대응이다(측정을 `stage0/out`에 JSON으로 남긴다). '
        + '#70 — main 트리를 잴 때 `PW_PORT`를 갈랐다(고정 포트면 남의 트리를 잰다). '
        + '#58 — **474칸의 전량은 미측정이다**. 병합 세션이 그 자리를 채운다.'
      ),
      command: 'LEDGER=1 npx vitest run test/close31.test.ts',
    }, null, 2)
    if (process.env.LEDGER === '1') {
      const out = resolve(HERE, '../../stage0/out')
      mkdirSync(out, { recursive: true })
      writeFileSync(resolve(out, 'close31_web2.json'), payload)
    }
    expect(payload.length).toBeGreaterThan(2000)
  })
})
