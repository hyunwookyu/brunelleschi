// web2-54 §1㉡ — **dpr2가 필요한 스펙의 목록**. 조건과 결과가 한 파일에 산다(원칙 a).
//
// 판별(지시 문면): **픽셀을 값으로 읽는 스펙**만 dpr2가 필요하다 — 스크린샷을 찍거나,
// 칠해진 픽셀을 세거나, 해시하는 스펙. dpr는 래스터의 눈금이므로 픽셀을 안 읽는 스펙
// (DOM·좌표·저장·관문)은 dpr1과 dpr2가 같은 것을 잰다 — 두 번 돌면 시간만 는다.
//
// **조건이 정본이고 목록은 그 산출물이다.** 갈리면 목록이 아니라 조건을 고친다(지시 ㉡).
// `test/dpr2list54.test.ts`가 매 단위 실행에서 조건을 e2e/*.spec.ts에 다시 돌려
// 이 목록과 대조한다 — 새 스펙이 픽셀을 읽기 시작하면 그 시험이 빨개져서 여기 등재를
// 강제한다(목록 갱신을 사람 기억에 안 맡긴다).
//
// **이 목록이 덮는 것과 안 덮는 것**(#89): 덮는 것은 «스펙 파일 원문이 픽셀 읽기 API
// (screenshot( · getImageData · readPixels · toDataURL)를 부르는가»다. 안 덮는 것 둘 —
// ㉠ 앱 «안»의 진단 값이 내부적으로 픽셀에서 유도된 경우(스펙은 숫자만 받는다 — 조건에
// 안 걸린다) ㉡ dpr가 래스터 밖(장치 픽셀 좌표 반올림 등)으로 새는 결함. 그 둘은
// **밤 실행(e2e:night)이 전량 dpr2를 돌아서 지킨다** — 목록 밖 스펙이 dpr2에서만
// 깨지면 목록이 아니라 이 조건이 틀린 것이고, 그때 조건을 넓힌다. 목록은 짐작이 아니라
// **감시받는 가설**이다.

/** 판별 조건 — 스펙 원문에 이 패턴이 있으면 픽셀을 값으로 읽는 스펙이다.
 *  `test/dpr2list54.test.ts`가 같은 정규식을 e2e 전 스펙에 돌려 아래 목록과 대조한다. */
export const DPR2_NEED_RE = /screenshot\(|getImageData|readPixels|toDataURL/

/** 계측 스펙 넷(§1㉠) — 회귀 시험이 아니라 **추세 측정**이고 워커 수가 그 수를 바꾼다
 *  (#99와 같은 뿌리). 초록 실행에서 빠지고 밤(e2e:night)·원장(e2e:ledger)에만 돈다. */
export const MEASURE_SPECS = ['cost18', 'cost20', 'cost22', 'brushperf'] as const

/** 조건이 낸 목록(2026-09-02 · e2e 74스펙 중 47) — 갱신은 조건을 다시 돌려서만 한다. */
export const DPR2_SPECS = [
  'axisproj', 'brush', 'brush51', 'dimwrite29', 'draftgate', 'drafting', 'draw',
  'entry17', 'extacq', 'eyelayer27', 'face', 'files43', 'flow', 'gesture',
  'grain26', 'grain30', 'grain40', 'graphite', 'icons', 'inklayer', 'input',
  'level', 'materials', 'mats46', 'mats52', 'nums47', 'own3d', 'paint45',
  'paint48', 'paint50', 'paper', 'papericon31', 'press26', 'rep49', 'rollpose',
  'roundsave', 'slide40', 'snapghost', 'turn31', 'ui34r7', 'underlay', 'view42',
  'waitfade', 'waitink37', 'yellow', 'yellowfree', 'zones',
] as const
