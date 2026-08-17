# HANDOFF.md — 세션 인계

다음 세션은 이 문서를 읽고 이어서 진행한다. 사람의 개입은 그 한 줄뿐이다.

## 현재 단계 — **2026-08-17 3차 지시(0~7) 전부 완료. 다음 사람 지시 대기**

이번 세션(3차)의 사람 지시는 **"지우는 것이 주 작업"**이었다: 0 낡은 인용 정리 ·
1 설계 확정(상태 넷) · 2 폐기 코드 제거 · 3 상태 표시 제거 · 4 Line2 · 5 결함 수정 ·
6 기본 흐름 종단 시험 · 7 H(오스냅)·I(분할+지우개)·J(잔여)·K(실획 준비). **전부 끝났다.**
지시문의 "나중(지금 하지 않는다)": **렌더 층 통합 · 하단바 정리** — 손대지 않았다.

프로그램 이름 **Brunelleschi**, 확장자 **`.brnl`**(JSON).
배포: <https://hyunwookyu.github.io/brunelleschi/> — 이 세션의 병합 셋(`2e1ec78`·`671f894`·마지막 커밋)
중 마지막의 Actions 상태는 푸시 직후라 **다음 세션이 초록을 확인한다**.

## ⚡ 착수 전에 `PITFALLS.md` 상단 "최근 다섯"부터 읽는다

**41개**다. 읽은 증거는 걸리는 번호를 `progress.md`에 적는 것. ⚠ 이번 세션 실증:
착수 표의 "해당 없음" 판정이 **세 번 틀렸다**(#37 두 번·#40/#38 한 번) — 리뷰어가 잡았다.
**"해당 없음"이라고 적기 전에 그 번호의 본문을 다시 읽는다.**

## 핵심 설계 (2026-08-17 3차, D-L53~56)

```
상태 넷:  NONE(축 부족·3D 안 섬) · P1(가로선 확정·임의 f) · P2(f=√|PV₁||PV₂|) · P3(수심)
전이:     NONE→P1(가로선) · NONE→P2(다른 소실점 둘) · P2→P3(기울어진 수직선 답)
원칙:     차수·잠금을 저장하지 않는다 — perspectiveOrder(rules)·standing()이 계산한다
          후보 개념 없음. P1 불가역. 확정·승격 자동(승격만 알린다 — 형태가 움직인다)
```
- **소실점이 하나 있을 때 가로선은 묻는다**(조용한 P1 가둠 방지 — 몰아 긋기 회귀를 측정이 잡았다)
- 표시: 상태 패널은 **물음·승격 알림·최소 안내 하나**뿐(지시 3). fSource도 화면에 안 낸다
- 3D 선: Line2(화면 px 굵기 — `LINE_PX`). 색은 채널이 정한다(결과선 #111 · 보조선 #4a4a4a 실선)
- 격자: 부챗살 삭제 — 지면 정사각 격자 투영만(9.5 잠금 시험 있음). 토글 기본 켬
- 오스냅: 앱 조리개 **15px**(D-L56 — 측정은 반대를 가리킴·대가 기록) · 종류 토글 · 4~40px 설정
- 지우개: 조각(교차점 사이)·부분(지나간 자리). 분할 기하 `split.ts`. **앵커는 3D 점이 본체**
  (조각 이관·끊김 규칙 — split.ts `reanchorId` 머리말). 자동 분할은 **그리는 시점 미배선**(DEFERRED)

## 다음에 할 일 — **사람 지시 대기.** 그 전에 할 수 있는 것

| 항목 | 내용 |
|---|---|
| **다음 세션 리뷰어 재검** | 항목 7의 리뷰어 15건 대응(progress 맨 끝 표)을 **재호출 없이 기록만 했다**(컨텍스트 마감) — 다음 세션이 그 표를 리뷰어로 재검한다 |
| **Actions 초록 확인** | 마지막 푸시의 `Pages` 실행 |
| **실획**(K) | `sessions/`에 `.brnl`이 들어오면 **다른 일보다 먼저** `real_ink` — snapDistPx(40px 프로브)·askStats·조각 구분(pieceOf)까지 이번에 심었다. **오스냅 15px의 판정(D-L56)이 여기 달려 있다** |
| **나중(지시문)** | 렌더 층 통합 · 하단바 정리 — 사람이 열면 |

## 지금 서 있는 사실

1. **원장 값이 같은 해시 아래서 움직인다** — 하네스 재실행 시 알고리즘 변경분이 값을 옮기고
   해시(509615a1)는 그대로다(#1의 사람 자리). **수치를 쓰기 전에 원장을 그 자리에서 읽고,
   재실행했으면 전체 `.md`를 grep으로 훑는다**(이번 세션에 그 규칙을 네 번 어기고 네 번 잡혔다).
2. **동결 리터럴**: `DRAFT_TOL`·`SENS_TOL`(constants.ts)·`HORIZON_TOL.min_vp_sep_ratio`는 죽은
   코드의 값이지만 전역 해시 안정성 때문에 남았다(D-L54). `OSNAP`·`SPLIT_TOL`·`P1_F_RATIO`·
   `GESTURE_TOL`은 반대로 **넣지 못했다** — 의존 집합별 해시(DEFERRED)가 서야 정리된다.
3. **`horizon.json`·`draft_recover.json`·`guide_budget.json`은 재실행 수단이 없다**(하네스 삭제) —
   그 인용 9건의 해시 통과는 "영원히 안 움직인다"는 뜻이다(DEFERRED).
4. **rule_camera 게이트(규칙 ≤ 검출)는 여전히 `passed:false`**이고 삭제는 그 위에서 지시로 진행됐다
   (D-L54가 CLAUDE A-4를 덮은 사실을 명시). CLAUDE §2 중단 조건의 판정 주체는 `camera_gate.json`의
   `deg_0.25` 행이고 **통과선 안**이다(#41 확인 그대로).
5. **간헐 실패의 뿌리 둘을 이번에 캤다**: 핀 상태 `getAzimuthalAngle()` 미정의(→ `camPose`가 핀에서 0)
   · 저장 복원 경쟁(→ 픽스처가 DB를 지우고 시작). 스크린샷 회귀는 잉크 비트맵 비교다(DOM AA ±1).

## 검증 현황 (마지막 커밋 기준)

vitest **417 통과 · 1 건너뜀** · tsc·빌드 통과 · Playwright **29 통과 · 2 건너뜀** ·
pytest **73** · selfcheck STALE 0 · 상수 해시 **509615a1** · 인용 **131건 플래그 0** ·
게이트 블록 **16**. ⚠ 수를 인용하기 전에 `stage0/out/selfcheck.json`의 `coverage`를 그 자리에서
다시 읽는다. ⚠ 건너뜀: vitest `real_ink`(sessions 비어 있음 — **대기 원장에 K 지표 정의 있음**) ·
Playwright `coords` dpr1 양성 채널·`stage` 하나.

## ✋ 브라우저

`cd web && npm run dev:5222` → `/l.html` (⚠ 기본 **HTTPS**(자가서명) — HTTP는 `S2S_HTTP=1`).
`window.S2S` 주요 손잡이: `doc()` `cam` `order()` `standing()` `rules()` `feedLine()` `snap(p)`
`endSnap()` `osnap()`/`setOsnap()` `eraseSegmentAt(p)` `erasePart(path)` `cutsOf(id)`
`confirmNow()`(하네스용 확정) `promoteOrderNow(before?)`(하네스용 승격) `showGrid()` `camPose()`
`palm()` `channels()` `revertToOrder(n)`. ⚠ `orderCandidate`·`distance`·`lens`·`unlockGuides`는
**없어졌다**(D-L53·54).

## 개발 명령

```bash
cd web && npx vitest run && npx tsc --noEmit && npm run build && npx playwright test
```
```bash
python -m pytest tests/ -q && python selfcheck.py
```
⚠ `playwright` 앞에 `npm run build`. ⚠ `progress.md`는 루트 하나.

## 반드시 읽는 것

1. `CLAUDE.md`(§1·§2에 3차 주석 반영) 2. **`PITFALLS.md`** 3. `docs/line_plan.md`
4. 이 문서 5. `progress.md` 맨 끝(3차 절 전부) · `assumptions.md`(AS-L21까지) ·
`DECISIONS.md`(~**D-L56**) · `DEFERRED.md`(2026-08-17 절 — 이번에 여덟 항목 추가) · `QUESTIONS.md`
