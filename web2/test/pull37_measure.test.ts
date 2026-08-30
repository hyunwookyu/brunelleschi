// 원장 — web2-37 6번(오스냅의 당김을 **재기만 한다**).
//
// 이 원장이 재는 것 넷:
//  ① **시작점 오스냅의 획득 반경** — 값·정의된 자리·단위, 그리고 줌이 걸리면 어디서 나뉘는가.
//  ② **당김의 기준선** — 획 40개 이상의 도면에서 「허공에서 시작하려 했는데 물어 간」 비율.
//     분자/분모로 적고 시드 셋을 나란히 낸다(#14 — 유효 자릿수 2자리).
//  ③ **반증**(D-3) — 반경 0인 위약 판·오스냅을 끈 위약 판에서 0으로 떨어진다.
//  ④ **다음 라운드가 볼 곡선** — 반경을 제품 값의 배수로 훑은 당김 비율. ⚠ 값은 안 바꿨다.
//
// 실행: LEDGER=1 npx vitest run test/pull37_measure.test.ts

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  busy37, inkBox, screenBox, area, run, probe, aimedControl, allKindsOff, confirmCommit,
  type Box, type PullStat,
} from './pull37scene'
import { defaultOsnap, intersections3, OSNAP_ORDER } from '../src/core/osnap'
import { C } from '../src/core/constants'

const HERE = dirname(fileURLToPath(import.meta.url))
const r6 = (v: number) => Number(v.toFixed(6))
const nn = (v: number) => (Number.isFinite(v) ? r6(v) : null)
const N = 1200
const SEEDS = [0x37a1, 0x5c2b, 0x9d07]

const brief = (p: PullStat) => ({
  band: p.band, seed: p.seed, radius_px: p.radius,
  trials: p.trials, acquired: p.acquired, pulled: p.pulled,
  moved_median_px: nn(p.moved_median), moved_p90_px: nn(p.moved_p90), moved_max_px: nn(p.moved_max),
  by_kind: p.by_kind, bins: p.bins,
})

describe('원장 — web2-37 6번(오스냅의 당김)', () => {
  it('반경의 출처 · 당김의 기준선 · 반증 · 반경 곡선', () => {
    const s = busy37()
    const R = s.app.osnap.radius                       // **제품에서 읽는다**(#88)
    const ink = inkBox(s)
    const scr = screenBox()
    expect(s.app.doc.strokes.length).toBeGreaterThanOrEqual(40)
    expect(s.app.view.s).toBe(1)                       // 문서 단위 = 화면 px인 판이라야 아래 수가 px다

    const bands: { name: string; box: Box }[] = [{ name: 'ink', box: ink }, { name: 'screen', box: scr }]
    const baseline = bands.flatMap(b => SEEDS.map(seed => run(s, b.name, b.box, seed, N)))
    const pool = (band: string) => {
      const rs = baseline.filter(x => x.band === band)
      return {
        band,
        trials: rs.reduce((a, x) => a + x.trials, 0),
        acquired: rs.reduce((a, x) => a + x.acquired, 0),
        pulled: rs.reduce((a, x) => a + x.pulled, 0),
      }
    }
    const inkPool = pool('ink'), scrPool = pool('screen')

    // ── 반증(D-3) — 팔 안에서만 만든 위약 둘. 제품 상수는 그대로다 ─────────────
    const placeboR0 = SEEDS.map(seed => run(s, 'ink', ink, seed, N, { radius: 0 }))
    const placeboOff = SEEDS.map(seed => run(s, 'ink', ink, seed, N, { kinds: allKindsOff(s) }))
    const placeboR0Sum = placeboR0.reduce((a, x) => a + x.acquired + x.pulled, 0)
    const placeboOffSum = placeboOff.reduce((a, x) => a + x.acquired + x.pulled, 0)
    // 위약을 되돌린 뒤 기준선이 그대로인가 — 갈아 끼움이 새면 위 수가 전부 오염이다
    const afterPlacebo = run(s, 'ink', ink, SEEDS[0]!, N)
    const base0 = baseline.find(x => x.band === 'ink' && x.seed === SEEDS[0]!)!

    // ── 반경 곡선 — **제품 값의 배수**로 훑는다(4·20 같은 수를 손에 안 든다 · #88) ──
    const sweep = [0, 0.5, 1, 1.5, 2, 2.5].map(k => {
      const st = run(s, `ink@${k}R`, ink, SEEDS[0]!, N, { radius: R * k })
      return { k, radius_px: r6(R * k), trials: st.trials, acquired: st.acquired, pulled: st.pulled }
    })

    // ── 대조군 · 탐침의 신빙성 ───────────────────────────────────────────────
    const aimed0 = aimedControl(s, 0)
    const aimedOff = aimedControl(s, C.TAP_MAX_PX + 1)
    const confirm = confirmCommit(probe(s, ink, SEEDS[0]! + 1, 24), SEEDS[0]! + 2)

    // ── 장면의 밀도 — 이 수의 크기를 정하는 것이 이것이다 ─────────────────────
    const density = {
      strokes: s.app.doc.strokes.length,
      lifted: s.app.lift.lifted.size,
      waiting: s.app.lift.waiting.length,
      intersections3: intersections3(s.app.lift).length,
      ink_box: ink,
      ink_area_px2: r6(area(ink)),
      screen_area_px2: r6(area(scr)),
    }

    const payload = JSON.stringify({
      what: (
        '**시작점 오스냅이 «허공에서 시작하려는 손»을 얼마나 물어 가는가** — 획 40개 이상의 '
        + '도면에서 잰 기준선. 이번 라운드는 **값을 안 바꾼다**(지시 문면): 재기만 한다.'
      ),
      why: (
        '소장의 지적 ㉡「무조건 선 위나 끝에 맞춰 그려야 한다」는 오스냅이 **필요해서** 생기는 '
        + '느낌이 아니라 **당겨서** 생기는 느낌이다. 37-1(허공 시작을 세우는 규칙)이 들어가도 '
        + '그 당김은 그대로 남는다. 값을 손보는 것은 실기기 확인 뒤 별도 라운드이고(D-2 — '
        + '유일한 시험은 실기기다), 그 라운드가 «무엇이 얼마나 바뀌었나»를 말하려면 '
        + '**지금 값에서의 수**가 있어야 한다. 이 원장이 그 기준선이다.'
      ),
      gesture_definition: {
        air_start: (
          '시작점을 **기존 기하와 무관한 분포**에서 뽑는다 — 작도 영역(또는 화면) 안 균일 난수'
          + `(\`rng32(seed)\` · x와 y를 다른 흐름에서 뽑아 LCG의 격자 짝지음을 끊는다). `
          + '그 점은 어떤 끝점·중점·교점도 겨냥하지 않았다: 손은 「여기서부터 쫙 긋는다」이지 '
          + '「저 끝점에 맞춘다」가 아니다. 겨냥한 몸짓은 따로 잰다(`aimed_control`).'
        ),
        acquired: '오스냅이 후보를 냈다 = 시작점이 그 후보 자리로 간다(`resolveStart`가 null이 아니다).',
        pulled: (
          `그 후보가 앱 자신의 «같은 점» 문(\`TAP_MAX_PX\` = ${C.TAP_MAX_PX} px)보다 **더 멀다** `
          + '= 사람이 찍은 자리가 실제로 옮겨졌다. **보수적인 셈**이고 이것이 소장이 말한 그 느낌이다. '
          + '두 셈을 같이 내는 이유: `acquired`만 내면 「끝점 위에 우연히 떨어진 칸」까지 당김으로 '
          + '세게 되고, `pulled`만 내면 「물리긴 했는데 안 움직인」 칸이 안 보인다.'
        ),
        threshold_note: `**새 문턱을 안 지었다**(#54) — 문은 앱이 이미 쓰는 \`TAP_MAX_PX\`(${C.TAP_MAX_PX})다.`,
        not_measured: (
          '「사람이 그 당김을 **불쾌하게** 느끼는가」는 이 팔이 못 잰다. 숫자를 봐도 손에서 '
          + '어떤지는 모른다(지시 문면) — 판정은 실기기다.'
        ),
      },
      radius: {
        value_px: C.OSNAP_RADIUS_PX,
        defined_at: 'web2/src/core/constants.ts — `C.OSNAP_RADIUS_PX: 8`',
        default_wiring: '`core/osnap.ts` `defaultOsnap().radius = C.OSNAP_RADIUS_PX` → `app/state.ts` `createApp`의 `osnap`',
        runtime_source: '`app.osnap.radius` — 화면의 반경 슬라이더(`#osnap-radius`, index.html: min 4 · max 20 · step 1)가 그 값을 그대로 쓴다. 즉 **사용자가 이미 4~20으로 바꿀 수 있다**.',
        unit: '**화면 css px**. `core/osnap.ts` 머리말: 「반경은 화면 px(포인터 정밀도의 문제라 선례가 절대 px)」.',
        where_zoom_divides: (
          '`osnap()`은 **문서 좌표**에서 잰다(후보가 문서 좌표다). 그래서 부르는 자리가 '
          + '`app.osnap.radius / viewScale(app)`으로 나눠서 넘긴다 — 그 결과 **줌·보기 렌즈와 '
          + '무관하게 「화면에서 8px」**이 유지된다. `viewScale = view.s × lensK`(state.ts).'
        ),
        conversion_sites_count: 8,
        conversion_sites: [
          'app/input.ts `osnapSet()` — 그리기 시작점·끝점·호버 : `/ viewScale(app)`',
          'app/input.ts `endDraft` — `C.OSNAP_RADIUS_PX / viewScale(app)`(연장 획득의 자) : `/ viewScale(app)`',
          'app/input.ts `endDraft` — `resolveCommit(..., app.osnap.radius / viewScale(app), ...)`(지평선 탭) : `/ viewScale(app)`',
          'app/main.ts — `pickTargetAt(..., radius / viewScale(app) * 2)` : `/ viewScale(app)`',
          'app/main.ts — `diag.osnapAt` : `/ viewScale(app)`',
          '⚠ app/state.ts `pickDimTarget` — `/ app.view.s`(아래 `divergence`)',
          '⚠ app/state.ts `measureTap` — `/ app.view.s`',
          '⚠ app/state.ts `defineByTouch` — `/ app.view.s`',
          '(하네스) test/session.ts `set()` — 앱과 **같은 식**이다',
        ],
        divergence: (
          '⚠ **`state.ts`의 세 자리는 `viewScale`이 아니라 `app.view.s`로 나눈다** — 보기 렌즈'
          + '(`viewF`)가 걸린 상태에서는 그리기 경로와 재기·치수 경로의 실효 반경이 `lensK` 만큼 '
          + '갈린다. `state.ts`의 `viewXf` 머리말이 「한 자리라도 `app.view`를 직접 읽으면 그 겹만 '
          + '렌즈를 안 탄다」고 적어 둔 바로 그 형태다(#54). **이 절은 그것을 안 고쳤다** — '
          + '`state.ts`는 이번 회차의 다른 절이 쓰고 있는 파일이고, 이 절의 지시는 「재기만 하라」다. '
          + '고칠 곳은 그리기 경로가 아니므로 이 원장의 수치에는 영향이 없다(팔의 `viewF`는 null).'
        ),
        this_round_changed_nothing: true,
      },
      conditions: {
        fixture: (
          '`test/pull37scene.ts`의 `busy37()` — 상자로 카메라를 닫고 격자·대각을 쌓은 도면. '
          + '30-11(`ext30.test.ts`의 `busy()`)과 같은 형태다: 지시가 「획 40개 이상의 장면에서 '
          + '잰다. 깨끗한 장면으로 재면 아무것도 못 본다」를 못 박았다(#71 · D-5).'
        ),
        density,
        path: (
          '**앱과 같은 경로다** — 장면은 `session().draw`가 그리고(오스냅·축 스냅·리프팅을 전부 '
          + '지난다), 시작점 판정은 `session().startHit`이 낸다. 그 손잡이는 `draw`가 부르는 '
          + '바로 그 호출이고, 반경 환산식을 팔이 다시 적지 않게 `session.ts`에 뒀다(#88).'
        ),
        trials_per_cell: N,
        seeds: SEEDS,
        bands: {
          ink: '작도 영역(그린 획들의 bbox) — 「이어서 긋는 손」이 실제로 머무는 대역',
          screen: `화면 전체 ${bands[1]!.box.x1}×${bands[1]!.box.y1} — 여백까지 섞은 대역`,
        },
        command: 'LEDGER=1 npx vitest run test/pull37_measure.test.ts',
        arm: 'npx vitest run test/pull37.test.ts',
      },
      constants: {
        OSNAP_RADIUS_PX: C.OSNAP_RADIUS_PX,
        TAP_MAX_PX: C.TAP_MAX_PX,
        OSNAP_LINE_RATIO: C.OSNAP_LINE_RATIO,
        OSNAP_ORDER,
      },
      constants_note: (
        '`OSNAP_LINE_RATIO`(선 후보의 넓은 띠)를 같이 싣되 **시작점에는 안 걸린다**: `ext`는 '
        + '후보 목록에 없고(web2-30 11번) `perp`는 시작점 3D가 있어야 나는데 시작점 판정에는 '
        + '`start`가 없다. 그래서 시작점의 이동량은 **반경을 못 넘는다**(팔 ⑤가 그 불변식을 진다).'
      ),
      baseline: {
        per_seed: baseline.map(brief),
        pooled: [inkPool, scrPool].map(p => ({
          band: p.band,
          acquired: `${p.acquired}/${p.trials}`,
          pulled: `${p.pulled}/${p.trials}`,
        })),
        seed_spread: (
          '⚠ **분자/분모로 읽는다**(#14). 시드 변동폭 때문에 유효 자릿수는 2자리다 — '
          + `ink 대역 세 시드의 당김은 ${baseline.filter(x => x.band === 'ink').map(x => `${x.pulled}/${x.trials}`).join(' · ')}이고 `
          + `screen 대역은 ${baseline.filter(x => x.band === 'screen').map(x => `${x.pulled}/${x.trials}`).join(' · ')}이다.`
        ),
        reference: { band: 'ink', seed: SEEDS[0], trials: base0.trials, acquired: base0.acquired, pulled: base0.pulled },
      },
      falsification: {
        what: 'D-3 — 「당김을 잰다」는 팔이 **당김이 없는 판**에서 0으로 떨어지는지 실제로 돌렸다.',
        placebo_radius_zero: {
          how: '팔 안에서 `app.osnap.radius`를 0으로 갈아 끼운다(사람이 반경 슬라이더를 내리는 것과 같은 자리). **제품 상수는 그대로다.**',
          rows: placeboR0.map(brief),
          verdict: `획득·당김의 합 ${placeboR0Sum} — 세 시드 ${SEEDS.length}×${N}칸 전부 0이다.`,
        },
        placebo_kinds_off: {
          how: '반경은 그대로 두고 **오스냅 종류를 전부 끈다**(화면의 종류 체크박스와 같은 자리).',
          rows: placeboOff.map(brief),
          verdict: `획득·당김의 합 ${placeboOffSum} — 반경이 8인데도 0이다. 즉 이 팔이 재는 것은 «반경»이 아니라 «오스냅»이다.`,
        },
        restore: {
          what: '위약을 되돌린 뒤 같은 시드로 다시 돌려 기준선이 **글자 그대로 복원**되는지 본다(갈아 끼움이 새면 위 수가 전부 오염이다).',
          before: `${base0.pulled}/${base0.trials}`,
          after: `${afterPlacebo.pulled}/${afterPlacebo.trials}`,
          radius_after: s.app.osnap.radius,
        },
      },
      aimed_control: {
        what: '**일부러 물리려는 손** — 장면의 끝점 82곳(그 자리 / 문 바로 밖). 이 판에서 획득이 안 나면 「당김이 없다」가 아니라 **팔이 아무것도 못 잰다**는 뜻이다.',
        at_endpoint: {
          acquired: `${aimed0.acquired}/${aimed0.trials}`,
          moved_median_px: nn(aimed0.moved_median),
          moved_max_px: nn(aimed0.moved_max),
          off_target: `${aimed0.offTarget}/${aimed0.trials}`,
        },
        beside_endpoint: {
          offset_px: C.TAP_MAX_PX + 1,
          acquired: `${aimedOff.acquired}/${aimedOff.trials}`,
          moved_median_px: nn(aimedOff.moved_median),
          off_target: `${aimedOff.offTarget}/${aimedOff.trials}`,
        },
        finding: (
          '⚠ **끝점 «그 자리»를 눌러도 시작점이 옮겨지는 칸이 있다**('
          + `${aimed0.offTarget}/${aimed0.trials} · 최대 ${nn(aimed0.moved_max)} px). `
          + '`OSNAP_ORDER`가 **거리가 아니라 종류**를 앞세우기 때문이다 — 반경 안에 `vertex`나 '
          + '`vp`가 있으면 0 px에 있는 `end`를 이긴다. 설계대로이고(osnap.ts 머리말 · Rhino 선례), '
          + '다음 라운드가 반경을 만질 때 **이 축도 같이 움직인다**는 것을 여기 적어 둔다.'
        ),
      },
      probe_is_the_app: {
        what: '탐침(`startHit`)이 예고한 시작점 = `draw`가 확정한 획의 `a`인가. 새 세션에서 장면을 다시 짓고 실제로 그어 대조했다.',
        checked: confirm.checked, same: confirm.same, worst_px: r6(confirm.worst),
        why: '다르면 이 원장의 수는 앱이 아니라 팔을 잰 것이다(`resolveCommit`은 일반 획의 `a`를 안 건드린다 — draft.ts).',
      },
      radius_sweep: {
        what: '**다음 라운드가 볼 곡선** — 반경을 제품 값의 배수로 훑었다. ⚠ 훑기는 팔 안의 일이고 **제품 값은 안 바뀌었다**.',
        note: `배수로 적는 이유(#88): 4·20 같은 수를 손에 들면 \`OSNAP_RADIUS_PX\`가 바뀔 때 이 표가 조용히 딴 것을 재게 된다. k=1이 현재 값(${R} px)이다.`,
        band: 'ink', seed: SEEDS[0], rows: sweep,
      },
      totals: {
        ink_acquired: inkPool.acquired, ink_pulled: inkPool.pulled, ink_trials: inkPool.trials,
        screen_acquired: scrPool.acquired, screen_pulled: scrPool.pulled, screen_trials: scrPool.trials,
        placebo_r0_total: placeboR0Sum,
        placebo_off_total: placeboOffSum,
        aimed_acquired: aimed0.acquired, aimed_trials: aimed0.trials,
        confirm_same: confirm.same, confirm_checked: confirm.checked,
      },
      gate: {
        '①반경': `시작점 오스냅의 획득 반경은 **${C.OSNAP_RADIUS_PX} 화면 css px**이고 자리는 \`core/constants.ts\`의 \`OSNAP_RADIUS_PX\` 하나다. 줌은 부르는 자리에서 \`/ viewScale(app)\`로 나뉜다(위 \`radius\`).`,
        '②기준선': (
          `획 ${density.strokes}개 도면의 작도 영역에서 허공 시작 ${inkPool.trials}칸 중 `
          + `**${inkPool.pulled}칸**이 «같은 점» 문보다 멀리 끌려갔고(획득은 ${inkPool.acquired}칸), `
          + `화면 전체 대역에서는 ${scrPool.pulled}/${scrPool.trials}이다. 대역을 안 적은 수는 뜻이 없다(#71).`
        ),
        '③반증': `반경 0 판 ${placeboR0Sum} · 오스냅 끔 판 ${placeboOffSum} — 둘 다 정확히 0이고, 되돌리면 ${afterPlacebo.pulled}/${afterPlacebo.trials}로 복원된다.`,
        '④대조군': `겨냥한 손은 ${aimed0.acquired}/${aimed0.trials} 전량 획득된다 — 팔이 «획득»을 못 재는 것이 아니다.`,
        '⑤탐침': `${confirm.same}/${confirm.checked}칸에서 확정 획의 시작점이 탐침과 **정확히 같다**(최악 ${r6(confirm.worst)} px).`,
        reachability: (
          '**무엇이 이 기준선을 움직이는가**(#35). 셋이다: '
          + `㉠ \`OSNAP_RADIUS_PX\`(위 \`radius_sweep\`이 그 곡선이다 — k=0에서 0, k=2.5에서 ${sweep[5]!.pulled}/${N}) `
          + `㉡ **오스냅 종류 목록**(전부 끄면 0 — \`placebo_kinds_off\`. 실제로 물어 가는 것의 대부분은 \`near\`다: ${JSON.stringify(base0.by_kind)}) `
          + `㉢ **장면의 밀도**(같은 앱·같은 반경인데 화면 전체 대역에서는 ${scrPool.pulled}/${scrPool.trials}로 내려간다). `
          + '⚠ 그래서 이 수의 «크기»는 픽스처가 정한다 — 부호(당김이 실재한다)만 기제의 것이다.'
        ),
        reachability_value: inkPool.pulled,
        reachability_source: 'totals/ink_pulled',
        reachability_value_fixture_determined: true,
        reachability_note: (
          `분모는 \`totals/ink_trials\`(${inkPool.trials} = 시드 ${SEEDS.length} × ${N})다 — 비율로 안 적는다(#14). `
          + '이 값이 0으로 내려오면 그것은 「당김이 없어졌다」일 수도 있고 **픽스처가 비었다**일 수도 '
          + `있다. 그 둘을 가르는 것이 \`aimed_control\`(겨냥한 손이 여전히 ${aimed0.acquired}/${aimed0.trials}인가)이다.`
        ),
      },
      what_this_does_not_say: [
        '**값이 옳은지 그른지 말하지 않는다.** 이번 라운드는 재기만 한다 — 8이 큰지 작은지는 실기기가 답한다(지시 문면 · D-2).',
        '**손의 분포를 안 잰다.** 허공 시작점을 균일 난수로 뽑았는데 실제 손은 그리던 자리 근처에 몰린다. 그 몰림은 후보 근처를 더 자주 지나므로 **실제 당김은 이 수보다 높을 것**이다 — 방향은 알고 크기는 모른다.',
        '**끝점 오스냅은 안 쟀다.** 소장의 지적 ㉡은 시작점의 것이고 지시도 시작점이라 적었다. 끝점 경로는 축 스냅·치수 스냅·연장 구속이 섞여 다른 팔이 필요하다.',
        '**37-1의 효과를 안 잰다.** 37-1이 들어가도 당김은 그대로 남는다는 것이 이 절의 전제이고, 「그대로인가」는 37-1이 든 뒤 이 팔을 다시 돌려 본다.',
        '**실기기 표본 0.** 마우스·헤드리스다. 손가락·펜의 눌림 자리 오차는 이 대역에 안 들어 있다.',
      ],
      selfcheck_notes: {
        'falsification의 두 위약 블록이 전부 0 (0 고정 카운터 · 분포 전체가 한 값)': (
          '**정상이고 그 0이 곧 결론이다** — D-3이 요구한 반증이다. 「당김을 잰다」는 팔이 '
          + '당김이 없는 판에서 0으로 떨어지는 것을 보이는 자리이므로, 여기서 0이 아니면 '
          + '그 팔은 아무것도 안 재는 것이다. 갈리는 수는 옆 블록(`baseline`)에 있다.'
        ),
        'aimed_control.at_endpoint.acquired가 82/82 (정확히 1.0 비율)': (
          '**정상이다** — 끝점 그 자리를 누르면 반경 0 px에 후보가 있으므로 전량 획득이 '
          + '**구성상 보장**에 가깝다. 이 줄이 재는 것은 비율이 아니라 «팔이 획득을 감지한다»이고 '
          + '임계를 안 건다. 같은 판의 갈리는 축은 `off_target`이다(전량이 아니다).'
        ),
        'probe_is_the_app.worst_px = 0 (1e-10 미만 오차)': (
          '**측정이 아니라 설계 보장의 확인이다**(자기참조 유형 3 · CLAUDE.md §5.1) — `draw`와 '
          + '탐침이 **같은 함수**를 부르고 `resolveCommit`이 일반 획의 `a`를 안 건드리므로 '
          + '값이 같은 것이 옳다. 그래서 임계를 안 걸고 «같은가/다른가»만 센다. 이 줄이 0이 '
          + '아니게 되면 그때는 팔이 앱을 안 재고 있는 것이다.'
        ),
        'radius_sweep의 k=0 행이 0': '**위약과 같은 칸이다**(반경 0). 곡선의 아래 끝을 곡선 안에 두려고 함께 실었다.',
        'aimed_control.at_endpoint.moved_median_px = 0 (0 고정 카운터)': (
          '**정상이고 그것이 이 줄의 뜻이다** — 끝점 «그 자리»를 눌렀으니 물린 자리도 그 자리다'
          + '(이동량 0). 「집계가 안 돈다」와 가르는 것은 같은 판의 `moved_max_px`와 `off_target`이다: '
          + '둘 다 0이 아니다(종류가 거리를 이기는 칸 — 위 `finding`). 그리고 옆 칸'
          + '(`beside_endpoint`)의 중앙값은 정확히 오프셋이다.'
        ),
        'constants/metric_defs 스냅샷 없음': (
          '**web2 라인 전체의 유보다** — 이 라인은 `constantsSnapshot()`을 안 쓰고 `constants` '
          + '블록을 손으로 적는다(`hold26.test`가 그 유보를 처음 적었고 `measure34_web2.json`도 같다). '
          + '문서는 이 원장을 **이름으로** 가리킨다(@해시 인용 ⛔).'
        ),
      },
      pitfalls: ['#88', '#86', '#85', '#84', '#71', '#54', '#42', '#40', '#35', '#36', '#14', '#12', '#47'],
      pitfalls_note: (
        '#88 — 팔이 반경·좌표를 손에 안 든다. 반경은 `app.osnap.radius`에서, 훑기는 그 값의 '
        + '**배수**로, 대역은 그린 획의 bbox에서, 문은 `C.TAP_MAX_PX`에서 읽는다. '
        + '#71 · D-5 — 깨끗한 장면으로 안 잰다(획 40개 이상). 그리고 「무는가」가 아니라 '
        + '**「무는 것이 어느 대역에서인가」**를 잰다: 같은 앱이 ink 대역과 screen 대역에서 다른 수를 낸다. '
        + '#54 — 새 임계를 안 지었다(`TAP_MAX_PX` 재사용). '
        + '#36 — 후보가 없는 칸의 중앙값은 분모가 0이라 **null**이다(1로 안 바꾼다). '
        + '#14 — 비율이 아니라 분자/분모로 적고 시드 셋을 나란히 낸다. '
        + '#12 — 반경은 동작점 하나가 아니다: 배수 여섯 줄을 낸다. '
        + '#47 — 문서가 인용하는 수는 낡는다. 정본은 이 파일이다. '
        + '#86 — 축을 둘로 갈랐다(획득 ↔ 실제로 옮겨졌는가): 비율 하나로는 두 방향을 못 가른다. '
        + '#85 — 위약만으로는 「팔이 죽은 판」과 안 갈린다. 그래서 대조군(겨냥한 손)을 **같은 실행**에 넣었다. '
        + '#84 ㉡ — 반증을 한 칸으로 안 한다: 손잡이 둘로 각각 무너뜨리고 되돌린 뒤 복원까지 본다.'
      ),
    }, null, 2)

    const out = resolve(HERE, '../../stage0/out/osnappull37_web2.json')
    if (process.env.LEDGER === '1') {
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, payload)
      console.log(`[원장] ${out}`)
    } else {
      console.log('[37-6] 원장은 LEDGER=1에서만 쓴다 — 팔은 그대로 돌았다')
    }
    console.log(
      `[37-6] 반경 ${C.OSNAP_RADIUS_PX}px · ink 당김 ${inkPool.pulled}/${inkPool.trials}`
      + `(획득 ${inkPool.acquired}) · screen ${scrPool.pulled}/${scrPool.trials}`
      + ` · 위약(반경0/오스냅끔) ${placeboR0Sum}·${placeboOffSum} · 겨냥 ${aimed0.acquired}/${aimed0.trials}`)

    // 원장이 스스로 서는 값(팔은 pull37.test.ts가 진다)
    expect(defaultOsnap().radius).toBe(C.OSNAP_RADIUS_PX)
    expect(inkPool.pulled).toBeGreaterThan(0)
    expect(placeboR0Sum).toBe(0)
    expect(placeboOffSum).toBe(0)
    expect(afterPlacebo.pulled).toBe(base0.pulled)
    expect(confirm.same).toBe(confirm.checked)
    expect(aimed0.acquired).toBe(aimed0.trials)
  }, 120000)
})
