# HANDOFF.md — 세션 인계

다음 세션은 이 문서를 읽고 이어서 진행한다. 사람의 개입은 그 한 줄뿐이다.

## 현재 단계 — **2026-08-17 6차 지시(시점 정리) 전부 완료. 다음 사람 지시 대기**

6차 지시는 이월(8-R′ 재검·Actions 초록)과 셋이었다: ① **3D 뷰 큐브**(D-L66) ② **1점 투시
화면 좌표 직접 3D**(D-L67) ③ **실획 준비**(측정 항목 추가). **전부 끝났고 전부 푸시·병합됐다.**
리뷰어 3회(8-R″ 11건 · 1-R′ 11건+재검 · 2-R′ 15건+재검 — 마지막 대응 표는 progress 맨 끝 2-R′).

프로그램 이름 **Brunelleschi**, 확장자 **`.brnl`**(JSON). 배포: <https://hyunwookyu.github.io/brunelleschi/>

## ⚡ 착수 전에 `PITFALLS.md` 상단 "최근 다섯"부터 읽는다

읽은 증거는 걸리는 번호를 `progress.md`에 적는 것. ⚠ 6차 실증: **#42 ⑤(정정은 제자리에도)가
그 규칙을 만든 같은 세션에서 두 번 더 재발했다**(1-R′ [A-1]·[A-3] — 정정을 대응 표에만 적고
초판 완료 절·착수 표를 안 고쳤다). **#40 ①(지표 불일치)도 재발** — elevation 게이트가 통과
기준 자체(direct_min=4)를 도달 가능성으로 등록했다(2-R′ [B-1]이 잡음). 수치를 문서에 적기
전에 원장을 그 자리에서 읽는다.

## 핵심 설계 변경 (6차, D-L66~D-L67)

```
D-L66  3D 뷰 큐브 — 직교 투영 큐브가 카메라를 따라 돈다. 면(4)=1점 시점(피치 0)·위/아래는
       중앙 한정("손이 잘 안 감")·모서리=2점·꼭짓점=3점. 절대 스냅은 stage.snapToDir
       (궤도 중심 조준·거리 유지·280ms), 상대 회전(드래그·화살표)은 spinYaw(#17).
       **재탭 = 가장 가까운 1점**(retap_cos 30° — 보고 있는 특징의 재탭은 무이동이므로
       ±X·±Z 정렬+피치 0으로 간다. 지시 1-1과 1-3의 충돌을 이 규칙 하나로 풂).
D-L67  1점 직접 좌표 — onePointFrame(시점 축이 기저의 부호 있는 순열 — **잔차 노름** 판정,
       |내적|은 각의 2차라 0.5° 틀림을 통과시킴)이면 축 스냅 획은 directSegment(화면축
       z₀/f 배율·깊이축 역)로 투영 없이 3D. 무스냅 시작은 궤도 중심 깊이 평면
       (placeUnanchored — ⚠ 확정 뷰 지평선 아래는 지면 스냅이 먼저 받는다). **미승격 없음.**
       손 정렬(2° 안)은 궤도 종료(터치·마우스)·감쇠 정착 후 **자동 정렬**(자동형은 이
       프로젝트의 판단 — Blender Alt+궤도는 수정자형). frame()/viewPlaceCtx가 axisDirs를
       시점으로 넘긴다 — 옛 판은 돌린 시점에서 무한원 축(1점의 화면평행 축 둘)을 잃었다.
지시 3  .brnl에 pathStats(direct/lift/twoPoint) 저장 · real_ink에 vp_confirm_source
       (교점 대 찍기 — rules.slots[*].source)·path_use(1점 직접 사용 비율) 지표 추가.
```

## ⚠⚠ 지금 서 있는 사실 — 다음 세션이 먼저 알아야 할 것

1. **1점 직접 경로의 동등성은 보장, 판정력은 음성 대조다**(`one_point_direct.json@509615a1`):
   동등성 두 프레임 72표본 max 3.0e-14/8.1e-14 · 음성(요·피치 2° 합성 틀림) **min 0.0244·
   max 0.942·획 길이 대비 최대 0.589**. ⚠ 한 축 회전 섭동은 그 축이 구성상 항등(min 정확히
   0)이라 합성으로 틀었다 — 음성 팔의 보수 통계는 min이다.
2. **elevation_flow의 게이트 의심 플래그 1건은 확인된 원인이다** — reachability_value가
   정확히 1(자유 시점 lift 수 — 음성 대조 count). 원인 확인 문장이 원장 reachability 안에
   있다(의심≠오류). selfcheck 게이트 hits 1이 그것이다.
3. **touch_route dpr2의 옛 임계(정밀도 12)는 환경 간 밴드 차로 죽었다** — 이 컨테이너에서
   관측 4회 전부 1e-10대(5차 환경 통과는 ≤5e-13이었다는 뜻 — 원인 미상). |Δaz| < 1e-6rad로
   개정(#28 — 오배선 신호는 비 2라 다섯 자리 여유). **5차 HANDOFF의 "간헐" 항목은 닫혔다.**
4. **rule_camera 게이트(규칙 ≤ 검출)는 여전히 `passed:false`.** CLAUDE §2 중단 조건의 판정
   주체는 `camera_gate.json`의 `deg_0.25` 행이고 6차 변경의 사정거리 밖(통과선 안 그대로).
   jit_0 조리개 동일값(47×3)은 **포화**다 — `aperture_note`(8-R″ [M6]).
5. `ONE_POINT_TOL`·`CUBE_TOL`은 constants.ts 밖(전역 해시 동결 — D-L49 계열). ⚠ **align_eps를
   바꾸면 one_point_direct.json을 손으로 재실행한다**(frame_judgment가 의존 — STALE이 못 잡음,
   DEFERRED 등재).
6. OrbitControls **감쇠 꼬리**는 여전히 카메라 측정을 오염시킨다 — settle은 스펙별 지역
   함수다(view_cube는 요+fy+위치, viewpoint_undo는 위치 3성분 — 8-R″ [M5]).
7. 수는 적지 않는다 — **`selfcheck.json`의 `coverage`를 그 자리에서 읽는다**(인용 157·게이트
   32는 이 마감 시점 값).

## 다음에 할 일 — **사람 지시 대기.** 그 전에 할 수 있는 것

| 항목 | 내용 |
|---|---|
| **2-R′ 재검** | 2-R′ 대응 표(progress 맨 끝 — 15건+4건)를 다음 리뷰어가 재검한다(관례 절차) |
| **Actions 초록** | 병합 커밋의 Pages 실행 확인 |
| **실획(K)** | `sessions/`에 `.brnl`이 오면 **다른 일보다 먼저** — 신규 지표(vp_confirm_source·path_use) 포함 AS-L23~25·D-L56·D-L59의 판정이 전부 여기 달려 있다 |
| **아이패드 실기** | 3D 뷰 큐브(108px)·1점 직접 경로·자동 정렬의 실기 확인 — K와 같은 문 |
| **DEFERRED 신규** | 손 정렬 자동 스냅 종단·화면 이동량 실측 · align_eps 재실행 조건 · eraser_size 원장 명시 |

## 검증 현황 (마지막 커밋 기준)

vitest **456 통과 · 3 건너뜀**(72파일 — 건너뜀 = quickdraw 데이터 2·sessions 1, 데이터 의존
조건부) · tsc·빌드 통과 · Playwright **43 통과 · 2 건너뜀**(새 팔 2: 3D 뷰 큐브 재작성 ·
네 입면 흐름) · pytest **73** · selfcheck STALE 0 · 게이트 의심 1(위 사실 2 — 확인된 원인) ·
상수 해시 **509615a1**(6차는 SHARED_CONSTANTS를 안 건드렸다).

## ✋ 브라우저

`cd web && npm run dev:5222` → `/l.html`. `window.S2S` 6차 추가분: `orbitCenter()`
`pathStats()`. 기존: `cubeSpin(rad,ms)` `cubeYaw()` `viewCube()` `askStats()` `doc()` `cam`
`order()` `standing()` `snap2d(p)` `pickVp(p)` `switchView(id)` 등.
⚠ 이 컨테이너의 Playwright는 `PW_EXECUTABLE=/opt/pw-browsers/chromium`이 필요하다
(playwright.config가 그 env를 읽는다).

## 개발 명령

```bash
cd web && npx vitest run && npx tsc --noEmit && npm run build && \
  PW_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test
```
```bash
python -m pytest tests/ -q && python selfcheck.py
```
⚠ `playwright` 앞에 `npm run build`. ⚠ `progress.md`는 루트 하나.

## 반드시 읽는 것

1. `CLAUDE.md` 2. **`PITFALLS.md`** 3. `docs/line_plan.md` 4. 이 문서
5. `progress.md` 맨 끝(6차 절 전부 — 8-R″·항목 1~3·1-R′·2-R′) ·
`assumptions.md`(AS-L11·AS-L15·AS-C4의 6차 대조 주석) · `DECISIONS.md`(~**D-L67**) ·
`DEFERRED.md`(2026-08-17 6차 신규) · `QUESTIONS.md`
