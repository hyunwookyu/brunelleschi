# HANDOFF.md — 세션 인계

다음 세션은 이 문서를 읽고 이어서 진행한다. 사람의 개입은 그 한 줄뿐이다.

## 현재 단계 — **2026-08-17 5차 지시(이월 3 + 사용 시험 8) 전부 완료. 다음 사람 지시 대기**

5차 지시는 이월 셋(6-R 재검 · 하네스 앱 동작점 · horizon_pitch 재목적)과 사용 시험 8건이었다:
① **1점 확정 시 화면 소실**(최중요 — 수리 D-L64) ② 회전 시 뷰 튐(D-L65) ③ 스냅 수평선
무물음 확정 ④ 궤적선 숨김 ⑤ 지우개 크기 슬라이더 ⑥ 프로크리에이트식 배치 ⑦ 시점 저장 +
실행취소 분리 ⑧ 뷰 큐브. **전부 끝났고 전부 푸시됐다**(`3d72c78`…`3277ebf` + 마지막 리뷰
대응 커밋). 리뷰어 4회(이월-1 재검 13행 · 이월-2 18건 · 항목 1·2 15건 · 항목 3~8 — 마지막
호출의 대응 표는 progress 맨 끝).

프로그램 이름 **Brunelleschi**, 확장자 **`.brnl`**(JSON). 배포: <https://hyunwookyu.github.io/brunelleschi/>

## ⚡ 착수 전에 `PITFALLS.md` 상단 "최근 다섯"부터 읽는다

읽은 증거는 걸리는 번호를 `progress.md`에 적는 것. ⚠ 5차 실증: **#42(완료 시 원장 인용 대조)가 같은 세션에 여덟 자리에서 재발했다**(이월-2·항목 1·2 + 항목 3~8 다섯 — 8-R′ 집계. 특히 다섯 원장의 gate.reachability가 인용한 #40을 다섯 번 다 놓쳤다 — **완료 대조 grep은 원장 전문을 대상으로 한다**). **수치를 문서에 적기 전에 원장을 그 자리에서 읽는다** — "0.0000°"
오기(원장 0.241°)도 이 세션에서 났다.

## 핵심 설계 변경 (5차, D-L63~D-L65)

```
D-L64  확정 전 획은 언제나 확정 뷰 소속(viewForDrawing) — 옛 판은 가짜 자유 뷰를 만들어
       일괄 풀이가 빈 목록을 받고(lifted 0) 확정 순간 그린 획이 화면에서 통째로 사라졌다.
       standCamera는 confirmView() 대상. 회귀 팔 p1_invariance.json
D-L65  궤도 중심 = 경계 상자 중심의 **시선 투영**(stage.retarget — D-L62 개정). target을
       중심 그대로 놓으면 update()가 재조준해 첫 프레임이 튄다(실측 9.78° → 0.24°)
D-L63  합성 하네스가 앱의 확정 전 2D 판정(resolve2dCore — mainL과 같은 함수 #17)을 통과한
       선을 잰다. 판정: 스냅 입력이 31.6°를 구제하지 않는다(위약 대조 — 원인은 스냅 방향)
지시 3  방향 스냅이 걸린 선은 묻지 않고 그 축으로 확정(스냅이 곧 선언 — 자유 선만 판정)
지시 4~8  liveHidden(궤적 숨김) · ERASER.px(4~60, 좌측 사이드바) · #tools 우상단 묶음 ·
       시점 저장/flyTo 복귀/실행취소는 그림만(restoreSnap 시점 불변) · 뷰 큐브(spinYaw)
```

## ⚠⚠ 지금 서 있는 사실 — 다음 세션이 먼저 알아야 할 것

1. **rule_camera는 두 동작점의 기록이다**: 이월-2 시점(물음 오라클 판 — 번갈아 스냅 29.66°)과
   지시 3 이후(무물음 선언 판 — 스냅 팔 전부 35.00°). 현행 원장은 후자다. 갈라 적은 표가
   progress "재검 [3-1] 정정" 절에 있다. **합성은 지시 3 설계의 판정자가 아니다**(AS-L25 —
   합성 잉크는 수평 의도가 없다). **실획(K)이 최종 판정자**라는 위치는 그대로다.
2. **찍기 경로가 측정에서 매우 강하다**(이월-3, `pick_vp.json`): pick_0 축 오차 2.67° 대
   two_lines 31.61°, 찍기 오차 ±120px에 평탄. 오라클(#35)이고 사람 찍기 정확도 표본 0(AS-L9).
   horizon_pitch는 은퇴(역사 기록 — 원장 what에 표시), AS-L19 폐기·AS-L23 신설.
3. **rule_camera 게이트(규칙 ≤ 검출)는 여전히 `passed:false`.** CLAUDE §2 중단 조건의 판정
   주체는 `camera_gate.json`의 `deg_0.25` 행이고 이번 변경의 사정거리 밖(통과선 안 그대로).
4. OrbitControls **감쇠(dampingFactor 0.12)의 꼬리**가 카메라 불변 측정을 오염시킨다 —
   e2e에서 정착 대기(settle)를 쓴다(viewpoint_undo·view_cube가 그렇게 한다).
5. `touch_route` dpr2 팔의 간헐(전체 실행에서 가끔, 단독 통과)은 여전하다 — 알려진 자리.
6. 수는 적지 않는다 — **`selfcheck.json`의 `coverage`를 그 자리에서 읽는다.**

## 다음에 할 일 — **사람 지시 대기.** 그 전에 할 수 있는 것

| 항목 | 내용 |
|---|---|
| **마지막 리뷰어 재검** | 8-R′ 대응 표(progress 맨 끝 — 항목 3~8 리뷰 11건 대응)를 다음 세션 리뷰어가 재검한다(3~5차의 같은 절차) |
| **Actions 초록** | `3277ebf`(+마감 커밋)의 Pages 실행 확인 |
| **실획(K)** | `sessions/`에 `.brnl`이 오면 **다른 일보다 먼저** — AS-L23(찍기)·AS-L24·AS-L25(스냅/선언)·D-L56·D-L59의 판정이 전부 여기 달려 있다 |
| **아이패드 실기** | 새 UI(#tools·#side·뷰 큐브)의 손 가림(6-e)·dpr 2 확인 — K와 같은 문 |
| **DEFERRED 신규** | LINE_PX 회귀 방어 · 접이식 #22 팔 · 옛 저장본 가짜 뷰 마이그레이션 · axis_snap 스냅 팔(실획 후) |

## 검증 현황 (마지막 커밋 기준)

vitest **445 통과 · 1 건너뜀**(70파일) · tsc·빌드 통과 · Playwright **42 통과 · 2 건너뜀**
(새 팔 7: p1_invariance·orbit_begin_invariance·snap_declare·trace_hidden·eraser_size·
viewpoint_undo·view_cube — p1·orbit_begin·snap_declare·trace_hidden·viewpoint_undo는 **버그 되살림으로 실패 확인**(값은 원장 밖 #25 — 원장 명시), eraser_size·view_cube는 팔 안 자체 대조가 배선 부재를 잡는다 — 8-R′) ·
pytest **73** · selfcheck STALE 0 · 게이트·인용 수는 **coverage를 그 자리에서 읽는다** ·
상수 해시 **509615a1**.

## ✋ 브라우저

`cd web && npm run dev:5222` → `/l.html`(S2S_HTTP=1 — ⚠ win spawnSync에 shell 수정이 들어갔다).
`window.S2S` 5차 추가분: `askStats()` `eraser()/setEraser(px)` `saveViewpoint()`
`cubeSpin(rad,ms)` `cubeYaw()` `viewCube()`. 기존: `doc()` `cam` `order()` `standing()`
`snap2d(p)` `pickVp(p)` `switchView(id)`(즉시 — 애니메이션은 목록 클릭만) 등.

## 개발 명령

```bash
cd web && npx vitest run && npx tsc --noEmit && npm run build && npx playwright test
```
```bash
python -m pytest tests/ -q && python selfcheck.py
```
⚠ `playwright` 앞에 `npm run build`. ⚠ `progress.md`는 루트 하나.

## 반드시 읽는 것

1. `CLAUDE.md` 2. **`PITFALLS.md`** 3. `docs/line_plan.md` 4. 이 문서
5. `progress.md` 맨 끝(5차 절 전부 — 이월 셋·항목 1~8·6-R′·7-R′·재검 [3-1] 정정 절) ·
`assumptions.md`(AS-L25까지 — AS-L3·L13·L19 병기 주석) · `DECISIONS.md`(~**D-L65**) ·
`DEFERRED.md`(2026-08-17 5차 신규) · `QUESTIONS.md`
