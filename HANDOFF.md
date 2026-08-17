# HANDOFF.md — 세션 인계

다음 세션은 이 문서를 읽고 이어서 진행한다. 사람의 개입은 그 한 줄뿐이다.

## 현재 단계 — **⛔ 중단. 신설 게이트 `rule_gate`가 첫 실행에서 실패했다(CLAUDE.md §2)**

8차 지시의 **사정거리 항목(a·b)만 완료**했고, 그 결과가 **중단 조건**이다.
나머지 항목은 아래 §"지시 전제가 저장소와 어긋난다"의 사유로 못 했다.

프로그램 이름 **Brunelleschi**, 확장자 **`.brnl`**(JSON). 배포: <https://hyunwookyu.github.io/brunelleschi/>

## ⚠⚠ 다음 세션이 **가장 먼저** 알아야 할 것 — 지시 전제가 저장소와 어긋난다

8차 지시 메시지는 **이미 끝난 작업 위에서** 쓰였는데 **그 작업이 저장소에 없다.**
전수 확인했다(작업 트리 · `origin` 6브랜치 전부 · `git log` · 컨테이너 `find`):

| 지시가 전제한 것 | 저장소의 사실 |
|---|---|
| "항목 1 판단 승인 — 술어를 한 곳으로 모아 불변으로 잠갔다" | **그 변경이 없다** |
| "리뷰어가 잡은 셋 승인 — 화각 임계가 소실점 간 거리에 붙어 있었다" | **그 결함도 수정도 없다.** 현행 `camera.gate(f,W)`는 `f/W`(시거리)이고 `axis.angleWiden`도 `hypot(m−principal)/f`(시거리)다 |
| "커밋 둘을 푸시한다" | **그 커밋이 없다.** 세션 시작 시 HEAD = `origin/main` = 7차 마감(b438e04) |
| "실획 파일을 이 지시와 함께 전달한다" | **파일이 없다.** `sessions/`는 README뿐 · 컨테이너 `find` 0건 · `/mnt/attach` 빔 |
| 항목 3·5·8·9·10·12 | **본문이 없다.** 메시지가 내용을 인용한 것은 1·2·4·11뿐이고 나머지는 번호만 나온다 |

⇒ **사람에게 다시 받아야 하는 것**: ① 8차 지시 **전문**(항목 1~12) ② `.brnl` 표본 파일
③ 잃어버린 커밋 둘(있다면). 추측해 만들지 않았다(A-3 범위 금지).

## 8차에 실제로 한 것 — 사정거리 a·b

```
D-L70  게이트 원장은 **사정거리**를 스스로 적는다(`scope_note`). 확정 규칙 경로는 **별도 게이트**다.
       a. `rule_gate.json` 신설 — 획 → resolve2dCore → stepRule → recoverCamera → liftAll → 형태 오차.
          대역은 **같은 하네스의 `truth_vps` 팔**(#27). 배수는 CLAUDE §2와 같은 1.1×·2.1×.
       b. `camera_gate.json`에 `scope_note` — 지나는 구간·**안 지나는 구간**·"부동은 안전의 증거가
          아니다". PITFALLS **#43** 신설(최근 다섯 갱신 — #38이 밀려났다, 본문에는 그대로).
       먹이기(`runRules`)를 `rule_camera.test.ts` → **`web/test/ruleFeed.ts`로 옮겼다**(복사 아님).
       옮기기 검증: `rule_camera.json` 재실행 `diff` **바이트 동일**.
       `Gate` 타입에 `mechanism` 추가 — 실패한 게이트가 기전을 남기게 한다.
```

## ⛔ 중단 사유 — 수치는 `stage0/out/rule_gate.json`을 **그 자리에서 읽는다**

판정 `passed: false`. **다섯 구도 전부**가 조용히 틀림에서 떨어진다(형태는 넷 — 1점 구도
한 칸만 선 안이고 그 칸은 ⓑ 사유로 근거에서 뺀다). 판정 팔은 `rule_drawn`.

**기전 — 차수가 P1에 갇힌다.** 판정 팔 300실행의 차수 분포 **P1 243 · P2 24 · P3 33**,
3점 구도에서도 P1이 40~47/60. P1은 **불가역**(D-L53)이라 한 획이 그림 전체를 1점에 가둔다.
**잡음의 산물이 아니다** — 가장 깨끗한 층(`by_jitter.jit_0`)에서 판정 팔은 **P1 60/60**이다.

**반사실이 보인 것**(#39·#16 · `rule_drawn_no_ortho_force`): 화면 직교 스냅의
`forced="screen"`이 `stepRule`의 P1 가드를 우회한다(`mainL`의 `snapForced`, 앱과 같은 배선 #17).
끄면 P1 243 → 181 · P3 33 → 75로 **차수는 풀린다. 그런데 옳게 놓인 획은 하나도 안 는다** —
놓인 획 932 → 1175(+243)인데 절단 0.2 **안**은 **85 → 85**, 절단 0.1 안은 **44 → 44**이고
**시드 여섯 전부에서 같다**(14/14·20/20·15/15·15/15·10/10·11/11, `by_seed`).
⇒ **기여가 아니라 재분배다** — 배치 정확도 기여가 **0**이다. PITFALLS **#16**의 형태 그대로다.
(초판은 "기여이지 지배항이 아니다"라 적었다 — 리뷰어 [3]이 절대수 읽기를 짚어 정정했다.)

**축 오차는 1pt를 뺀 층**(`headline_no_identity`)에서 읽는다: 판정 팔 **35** → 반사실 **31.61**.
초판의 "35 → 24.87"은 1점 구도의 **구성 항등 0**이 섞인 표제 값이었다(리뷰어 [8]).
분포도 연속이 아니라 구도 yaw에 뭉친 **범주**라, 중앙 이동은 크기 감소가 아니라 비율 이동이다.

**세 가지 유보 — 판정은 안 바뀌고 크기는 바뀐다**
- ⓐ **모집단 혼합**(리뷰어 [4] · #40 누수 ③): 판정 팔의 조용히 틀림 분모가 구도별로
  27/9/30/236/**630**이라 **1점이 67.6%**(대역 팔은 619/530/643/717/707로 고르다).
  규칙 팔이 3점에서 획을 거의 못 놓기 때문이고 그 분모는 **최대 연결 성분**이다.
  ⇒ **표제 배수(형태 9.4배)를 경로 전체의 대표값으로 인용하지 않는다.**
- ⓑ **1점 대역이 부풀려져 있다**(리뷰어 [5] · #34): 그 구도 `truth_vps` 형태 중앙 **0.3515**
  대 다른 넷 0.05~0.14. 소실점 하나면 f가 **임의값**(960 대 참 1000px)이고 이 원장의 지표는
  그 깊이 배율에 반응한다 — `rule_camera`의 f 면책이 **승계되지 않는다.**
  ⇒ 유일한 `passed:true` 칸을 근거로 세지 않는다.
- ⓒ **신호의 성질인지 기준의 성질인지 갈리지 않았다**(#35 — 리뷰어 [1], 높음):
  초판의 "신호의 성질이고 기준의 성질이 아니다"는 **근거가 항등이었다**(대역 팔이 통과선 안
  = 1.0 ≤ 1.1). **비오라클 팔이 선 안에 들어올 수 있다는 것은 안 보였다** — 셋 중 최선인
  `rule_grouped`가 형태 3.4배·조용히 틀림 2.1배 밖이다. **그 단정을 철회하고 기준은 안 낮춘다.**

**중단 사유 재확인**(#41 ②): 프레임 동일 · 모집단은 등록문대로(단 ⓐ의 가중 불균형) ·
ⓐⓑ로 좁혀도 **다섯 구도 전부가 조용히 틀림에서 떨어진다.** 판정은 실패다. ⇒ **멈춘다.**

**안 한 것**: 확정 규칙을 고치지 않았다 — 반사실이 **배치 기여 0**을 냈으므로 그 우회
제거로는 이 게이트를 못 지나고, 확정 규칙은 CLAUDE.md가 "고유한 것 둘"로 못 박은 자리다(A-3).
지시 **항목 11이 그 자리인데 본문이 없다**(DEFERRED 8차 절).

**리뷰어 1회**(17건 · 높음 4 / 중간 8 / 낮음 5) 전건 대응했다 — 대응 표는 progress 8차 절 끝.
재검은 다음 리뷰어가 한다(관례 절차).

## 다음에 할 일

| 순서 | 내용 |
|---|---|
| **1. 사람 입력** | 8차 지시 전문 · `.brnl` 표본 · 잃어버린 커밋 둘 |
| **2. 지배항 규명** | `rule_gate`의 남는 몫(교점 조건수)이 어디서 오는가 — 첫 짝 각차(`firstSep`)와 형태 오차의 관계를 팔로 낸다. 그 전에는 항목 2·4를 올려도 35° 카메라 위에 얹는 것이다 |
| **3. 항목 11 판단** | P1 가드 우회 제거(반사실 팔이 이미 실측) — 물음 증가가 대가다. 항목 11 본문과 함께 |
| 4. 3·4-R 재검 | 7차 3·4-R 대응 표 16건(progress 7차 절 끝)을 다음 리뷰어가 재검한다(관례) |
| 5. Pages 배포 | `deploy`는 **main 병합 뒤에만** 돈다(아래 CI 절) |

## CI (Actions run 32050549209 · `workflow_dispatch`로 이 브랜치에 돌렸다)

**`build` 초록**(tsc · 빌드 · `static_deploy.spec.ts` · artifact 업로드) ·
**`measure` 초록**(`npx vitest run` — CI에는 `data/quickdraw`·`sessions/`가 없어 셋이 skip) ·
**`deploy` 빨강 — 이것은 결함이 아니라 브랜치 제한이다.** `pages.yml`은 `push: [main, master]`
트리거이고 `github-pages` 환경이 main으로 제한돼 있다(4차 브랜치가 같은 것을 기록했다:
`git log origin/claude/vanishing-point-rules-overhaul-qxrqga` → "deploy는 브랜치 제한으로 막힌다").
⇒ **배포는 main 병합이 있어야 돈다.** 이 브랜치에서 확인할 수 있는 초록은 build·measure 둘이다.

⚠ 지시가 "화각 임계 수정이 배포되어야 사용자가 그 구도에서 경고를 본다"고 했는데
**그 수정이 저장소에 없다**(상단 표) — 이 푸시에 배포할 화각 변경은 들어 있지 않다.

## 검증 현황 (마지막 커밋 기준)

Playwright **47 통과 · 1 실패 · 2 건너뜀** — ⚠ **실패는 이 세션의 것이 아니다**:
`touch_route.spec.ts` dpr 2 회전 비교가 `|az−one| = 2.11e-6 > 1e-6`으로 깨진다.
**base 커밋(b438e04)을 별도 worktree에 꺼내 돌려 같은 실패를 재현**했고(이 세션의 diff는
`web/src`·`web/e2e`를 한 줄도 안 건드린다), 그 테스트의 주석이 이미 예고한 상황이다 —
"환경 간 밴드가 다르다(원인 미상)". 잡는 대상(dpr 오배선)의 신호는 **0.5 rad**이라 2.11e-6은
여전히 다섯 자리 아래다. **임계를 넓히지 않았다**(#26의 반대편 문) — DEFERRED에 등재했다.

vitest **466 통과 · 3 건너뜀**(74파일 — ⚠ 7차 HANDOFF의 "75파일"은 낡은 수였다. 실측
`ls web/test/*.test.ts | wc -l` = 74, 신설 `rule_gate.test.ts` 포함) · tsc·빌드 통과 ·
pytest **73** · selfcheck **STALE 0** · `scan_gate_reachability` 게이트 블록 **35** ·
플래그 **1**(기지의 `elevation_flow`) — 신설 `rule_gate.json:gate`는 **값 대조를 지났다**
(⚠ 도달 가능성을 두 지표로 적으면 출처도 **그 둘을 담은 자리**를 가리켜야 한다 — 한 지표의
경로를 가리켰다가 selfcheck가 "적은 값 ≠ 원장"으로 잡았다. 그 검사가 실제로 일한 자리다) ·
상수 해시 **509615a1**(8차는 SHARED_CONSTANTS를 안 건드렸다).
⚠ `rule_gate.json`의 의심 플래그들은 원장 `selfcheck_flag_origins`에 원인이 적혀 있다
(`truth_vps`의 0은 **보장**, `cut_*.rate = 1`은 **정말로 전부 틀린 것** — 자명한 1이 아니다).
⚠ `stage0/out/tube_render.json`의 `build_ms_*`가 바뀐 것은 **컨테이너 성능 차**다(측정 결론 무관).

## ✋ 브라우저

`cd web && npm run dev:5222` → `/l.html`. `window.S2S`: `snap(p)` `stage.freeIntrinsics()`
`pathStats()` `orbitCenter()` `cubeSpin(rad,ms)` `viewCube()` `askStats()` `doc()` `cam`
`order()` `standing()` `snap2d(p)` `pickVp(p)` `switchView(id)` 등.
⚠ 이 컨테이너의 Playwright는 `PW_EXECUTABLE=/opt/pw-browsers/chromium`이 필요하다.

## 개발 명령

```bash
cd web && npx vitest run && npx tsc --noEmit && npm run build && \
  PW_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test
```
```bash
python3 -m pytest tests/ -q && python selfcheck.py
```
⚠ `playwright` 앞에 `npm run build`. ⚠ `progress.md`는 루트 하나.
⚠ **새 컨테이너는 `cd web && npm ci`와 `pip3 install pytest numpy opencv-python-headless`가
먼저다** — 안 하면 vitest가 "Cannot find package 'vite'"로 **exit 0**을 내며 조용히 통과한다.

## 반드시 읽는 것

1. `CLAUDE.md` 2. **`PITFALLS.md`**(#43이 새로 최근 다섯에) 3. `docs/line_plan.md` 4. 이 문서
5. `progress.md` 맨 끝(8차 절) · `DECISIONS.md`(~**D-L70**) · `DEFERRED.md`(2026-08-17 8차 절) ·
`assumptions.md` · `QUESTIONS.md`
