# HANDOFF.md — 세션 인계

다음 세션은 이 문서를 읽고 이어서 진행한다. 사람의 개입은 그 한 줄뿐이다.

## 현재 단계 — **2026-08-17 4차 지시(사용 시험 8건) 전부 완료. 다음 사람 지시 대기**

4차 지시는 사용 시험에서 나온 8건이었다: ① 초기 화면 2D 오스냅 ② 소실점 방향 스냅(확정 전)
③ **소실점 = 그린 두 선의 교점**(대각선-격자 어긋남) ④ 지평선은 결과(빈 종이) ⑤ 관계 스냅
(정렬 가이드) ⑥ 하단바 재배치 ⑦ 회전 중심(경계 상자) ⑧ 선 굵기(1.5/1.3px). **전부 끝났다.**
이월분(3차 항목 7의 리뷰어 재검)도 처리했다(7-R — D-L56 수치가 잘못된 층(`by_radius_all`)에서
온 것 등 12건 정정).

병합: 1·2·3은 `b49da3f`로 푸시 완료(Actions 확인은 다음 세션). 4·5·6은 `73488a3`,
7·8과 마지막 리뷰 대응은 **이 세션의 마지막 커밋**이다.

프로그램 이름 **Brunelleschi**, 확장자 **`.brnl`**(JSON).
배포: <https://hyunwookyu.github.io/brunelleschi/>

## ⚡ 착수 전에 `PITFALLS.md` 상단 "최근 다섯"부터 읽는다

읽은 증거는 걸리는 번호를 `progress.md`에 적는 것. ⚠ 4차 실증: **착수 표의 "해당 없음"
오판이 다섯 항목 연속으로 났고 전부 리뷰어가 잡았다**(#41·#40·#37·#12·#24 — "해당 없음"이라
적기 전에 그 번호의 **본문**을 다시 읽는다). 리뷰어 7회 호출, 지적 합계 ~80건.

## 핵심 설계 변경 (4차, D-L57~D-L62)

```
2D 오스냅   확정 전에도 대기 획의 끝점·중점·교차점에 붙는다(snap2d.ts · D-L57). 3D가 이긴다
vp_dir     소실점만 있으면(카메라 안 서도) 그 방향으로 스냅(axisSnap.vpDirSnap · D-L58)
소실점     ⚠⚠ 첫 소실점 = 그린 두 깊이선의 실제 교점(two_lines 부활 · D-L59).
           한 선은 depthLines에 대기. 끝점 이음(ㄱ자) 교점은 제외. 지평선 = 소실점 y(롤 0)
지평선     결과다 — 확정 전엔 화면에 없다(D-L60). 둘째 경로: 대각선 위 점 찍기(pickVpAt)
정렬       관계 스냅(alignAxes · resolve2d 통합 · D-L61). 확정 전 전용, 오스냅이 이긴다
하단바     도구·채널 왼쪽 / 표시·스냅 접이식 / 궤도·확정시점 마우스 전용(pointer:coarse 숨김) / 파일 오른쪽
궤도 중심   3D 경계 상자 중심, 궤도 시작 시 갱신(D-L62). LINE_PX 1.5/1.3
```

## ⚠⚠ 지금 서 있는 사실 — 다음 세션이 먼저 알아야 할 것

1. **D-L59의 대가가 합성 원장에 크게 찍혔다**: rule_camera headline 축 오차 몰아 14.42°→**31.61°**·
   번갈아 9.82°→**27.85°**, axis_snap 배치 1322→**820**. 합성 잉크는 짝을 의도하지 않아 이 설계에
   불리하고(사람은 X 교차·연장 수렴으로 짝을 긋는다), **하네스는 스냅 전 원시 선을 먹인다**
   (앱은 2D 오스냅·직교·vp_dir·정렬로 스냅된 선 — 갈림은 DEFERRED "스냅 반영 하네스").
   사유·되돌림 길은 **D-L59**에 있다. 실획(K)이 최종 판정자다.
2. **horizon_pitch 하네스의 조작 변수가 죽었다**(세 팔 동일값) — AS-L19 폐기, 재목적 트리거
   이월(DEFERRED). **찍기 경로(pickVpAt)의 정확도를 재는 팔이 원장에 없다.**
3. **D-L43 폐기·D-L45 휴면**(지시 4-e 확정 후 피치 끌기는 DEFERRED — D-L32의 실패 자리라
   전부 다시 풀기가 필요하다).
4. 수는 적지 않는다 — **`selfcheck.json`의 `coverage`를 그 자리에서 읽는다**(게이트·인용 수가
   이 세션에만 여러 번 낡았다).
5. rule_camera 게이트(규칙 ≤ 검출)는 여전히 `passed:false`(격차가 D-L59로 더 벌어졌다 —
   1.6배→3.4배). CLAUDE §2 중단 조건의 판정 주체는 `camera_gate.json`의 `deg_0.25` 행이고
   **이번 변경의 사정거리 밖**(그 원장은 안 움직였다)이라 통과선 안 그대로다.
6. `touch_route` dpr2 팔이 전체 실행에서 한 번 흔들렸다(단독·재실행 통과 — 알려진 간헐 자리).

## 다음에 할 일 — **사람 지시 대기.** 그 전에 할 수 있는 것

| 항목 | 내용 |
|---|---|
| **Actions 초록** | `b49da3f`·`73488a3`·마지막 커밋의 Pages 실행 확인 |
| **실획(K)** | `sessions/`에 `.brnl`이 오면 **다른 일보다 먼저** — D-L56(15px)·D-L59(교점 소실점)·D-L61(정렬 15px)의 판정이 전부 여기 달려 있다 |
| **마지막 리뷰어 재검** | 이 세션 마지막 리뷰(5-R 재검 + 항목 6·7·8)의 대응 표(progress 맨 끝)를 다음 세션이 재검한다 — 컨텍스트 사정으로 재호출을 생략했으면 그 표가 남는다 |
| **DEFERRED 신규** | 4-e 피치 끌기 · horizon_pitch 재목적 · 스냅 반영 하네스 · 2D 겨냥 기록 |

## 검증 현황 (마지막 커밋 기준)

vitest **444 통과 · 1 건너뜀**(69파일) · tsc·빌드 통과 · Playwright **35 통과 · 2 건너뜀** ·
pytest **73** · selfcheck STALE 0 · 게이트·인용 수는 **coverage를 그 자리에서 읽는다** ·
상수 해시 **509615a1**. basic_flow.spec에 4차 검증 넷(오스냅·vp_dir·교점·지평선)+관계 스냅·
회전 중심이 들어 있고 각자 원장(`snap2d_flow`·`vp_dir_flow`·`vp_two_lines`·`horizon_flow`·
`rel_snap_flow`·`orbit_center`)을 쓴다.

## ✋ 브라우저

`cd web && npm run dev:5222` → `/l.html`(S2S_HTTP=1이라 HTTP). `.claude/launch.json`에 "web" 항목 있음.
`window.S2S` 주요 손잡이(4차 추가분): `snap2d(p)` `pending2Targets()` `hover2d()` `vpDir(a,b)`
`pickVp(p)` `relSnap()/setRelSnap()` `horizon()`(이제 `visible` 포함). 기존: `doc()` `cam` `order()`
`standing()` `feedLine()` `snap()` `endSnap()` `osnap()/setOsnap()` `camPose()` `confirmNow()` 등.

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
5. `progress.md` 맨 끝(4차 절 전부 — 착수 표·완료·리뷰어 대응 표 1-R~5-R·7-R) ·
`assumptions.md`(AS-L22까지 — AS-L13·16·17·19에 D-L59 주석) · `DECISIONS.md`(~**D-L62**) ·
`DEFERRED.md`(2026-08-17 4차 절) · `QUESTIONS.md`
