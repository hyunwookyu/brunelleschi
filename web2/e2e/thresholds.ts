// web2-12 e2e 임계의 단일 출처(D-C4 — 흩어지면 STALE이 안 잡힌다).
// 값의 근거는 각 스펙 주석·AS-C37·AS-C38이고, 실측은 stage0/out의 해당 원장이 정본(#47).
// draftgate가 이 객체를 원장의 thresholds 블록으로 그대로 내보낸다 — 원장과 코드가 안 갈린다.

/** 합성 화면 diff의 채널 문턱 — AA 가장자리(차 10~45)는 걸리고 압축·반올림 요동(±2)은 안 걸린다 */
export const PIXEL_DIFF_CH = 8

/** 재료 가시성(materials.spec) — 상자 20×60 CSS px · «선이 보인다»의 하한(AS-C37) */
export const VISIBLE_FLOOR = 20

/** 뗌 게이트(draftgate.spec) — 상자 20×50 CSS px (AS-C38) */
export const GATE = {
  /** 절대 상한: release_diff < stroke_px × 이 값. 새 경로 실측 대역 위 · 옛 경로 실측
   *  최저(classic dpr1 — 원장 release.classic_hb) 아래에 둔다. 실측이 움직이면 여기부터 다시 잰다. */
  ABS: 0.15,
  /** 판별 상대: release_diff < classic(옛 경로) diff × 이 값 — 옛 경로로 되돌리면 잡힌다 */
  REL: 0.6,
  /** 연장 카나리아: grown_front_diff < 상자 «전체 픽셀»(획 아님) × 이 값 — 상한 회귀 감시용.
   *  시드 판별이 아니다(그 판별은 release·강제 재그리기 팔 — AS-C38 관측 ②). */
  GROW_CANARY: 0.5,
}
