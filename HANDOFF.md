# HANDOFF.md — 세션 인계

다음 세션은 이 문서를 읽고 이어서 진행한다. 사람의 개입은 그 한 줄뿐이다.

## 현재 단계 — **2026-08-17 7차 지시(실획 첫 표본 대응) 전부 완료. 다음 사람 지시 대기**

7차 지시는 넷이었다: ① 확정 뷰 pose null(근본 원인 의심) ② 끝점 스냅 전무 ③ 같은 면
깊이 산포 ④ real_ink 측정. **①②는 수정·병합됐고(PR #1 → main), ③은 별도 결함 없음 판정 — 단 조건부다**(①②의 귀결 +
y-down 규약 확인. 다음 표본에서 end_snapped·vertex_gap이 안 움직이면 다시 연다 — DEFERRED
트리거), **④는 표본 파일이 저장소에 없어 지표 정비까지**(파일이 `sessions/`에 오면 vitest
한 번으로 지시 4의 지표 전부가 나온다).
리뷰어 3회(1-R′ 14건 · 2-R″ 13건 · 3·4-R 16건 — 마지막 대응 표는 progress 맨 끝 3·4-R).

프로그램 이름 **Brunelleschi**, 확장자 **`.brnl`**(JSON). 배포: <https://hyunwookyu.github.io/brunelleschi/>

## ⚡ 착수 전에 `PITFALLS.md` 상단 "최근 다섯"부터 읽는다

읽은 증거는 걸리는 번호를 `progress.md`에 적는 것. ⚠ 7차 실증: **#42 ②(완료 대조)가
같은 세션에서 또 재발했다** — 항목 2 완료 대조가 착수 표에 없는 #30·#25를 두고 "정합"이라
적었고(2-R″ [2]), 항목 1 대조는 원장에 없는 #3·#30을 원장 인용으로 적었다(2-R″ [9]).
**grep은 스펙이 아니라 원장 전문을, 대조는 grep 결과와 표를 실제로 견줘서** 한다.

## 핵심 설계 변경 (7차, D-L68~D-L69)

```
D-L68  확정 뷰 자세 — pose null은 설계 표식(자세 항등)이고 "저장 누락"은 반증됐다.
       실결함: ① applyDoc2가 무대 카메라를 재수립 안 함(새로고침 뒤 three 기본 자세
       (3.2,2.4,3.6)·비핀 — 그리드 숨음·궤도 기본 자세 출발·유령 뷰) → 재핀/setPose
       (+#22 크기 자가 치유) ② unpin/flyTo가 궤도 진입에서 렌즈를 FREE 45°·중심 주점으로
       교체(화면 점프) → 확정 내적 이어받기(stage.freeIntrinsics — 렌더·배치 단일 출처,
       2점 [W/2,지평선]=16.2+A-4 · 3점 수심=6.3 그대로). 저장 무결성: 확정 뷰(pose null)
       정확히 1 + 유한 자세 아니면 serializeDoc2가 던지고 실패 기록(doc2PoseIntegrity).
D-L69  겨냥 거리 정의 교체(aimDistPx) — 옛 판은 on_face의 정의상 0(cand.dist)로 오염,
       프로브 분기는 죽어 있었다(실획 첫 표본 전부 0. D-L56의 "40px 프로브 배선"은 적힌
       시점에 거짓 — 정정 병기됨). 새: 스냅 성패 무관·스냅 전 원시 시작점·40px 안 최근접
       정밀 대상(on_face 제외)·없으면 null. 7차 이전 저장본의 0은 legacy로 갈라 센다.
       물음 억제는 vpdir(기존 소실점 지지)만 — ⚠ ortho 강제는 stepRule P1 가드(D-L53,
       10.1°→31.6° 붕괴 실측)를 우회해 기각(리뷰어 2-R″ [1]이 잡음).
스냅 캐시  snapPre(끝점·정점·중점·교차점 — 뷰 좌표)의 캐시 키가 시점(frame().poseKey)이
       됐다 — 옛 판은 기하 변경에만 무효화해 뷰 왕복 뒤 첫 획의 정밀 후보가 낡은 좌표계로
       투영됐다(어긋남 실측 293~341px — "snapEnd 전무·시작 전부 on_face"의 기전).
```

## ⚠⚠ 지금 서 있는 사실 — 다음 세션이 먼저 알아야 할 것

1. **실획 첫 표본 `.brnl` 파일은 저장소에 없다**(작업 트리·origin 전 브랜치·이슈 0건).
   지시문의 수치(지평선 y=157 · Δ0.0~1.7° · 획 5 · asked 6 등)는 **사람 보고**로만
   기록했다(#25 — 원장 표본 0 유지, AS-C1 7차 주석). **파일이 오면 `sessions/`에 넣고
   `npx vitest run test/real_ink.test.ts`** — snap_use(끝점 스냅률)·vp_dir_err_deg(사람
   보고 Δ 재현)·snap_dist_legacy_zero(그 표본의 0은 옛 정의 산물이라 갈려 나감) 포함
   지시 4의 지표 전부가 나온다.
2. **그 표본으로 잡은 결함 둘의 사람 보고**(원장 밖·미검증 — 기준선이 아니다, 3·4-R [8]):
   끝점 스냅 0/획 5 · 물음 6회/획 5. 수정(캐시 시점 키·vpdir 억제)이 실사용에서 효과가
   있는지는 **다음 표본이 판정**한다(합성에서 vpdir 강제 발동은 15px 팔 0 — 불변은
   미발동이다. r40 팔 13 · asks −0.046, osnap_vpdir_forced 카운터).
3. **rule_camera 게이트(규칙 ≤ 검출)는 여전히 `passed:false`** — 7차 개정판은 6차와
   15px 팔 완전 동일(초판의 asks 감소는 ortho 우회의 양이었고 제거됨). CLAUDE §2 중단
   조건의 판정 주체는 종전대로 `camera_gate.json`의 `deg_0.25` 행(통과선 안).
4. **핀 상태 런타임 리사이즈에 재핀이 없다**(7차 파생 발견 — DEFERRED): fit()이 카메라를
   다시 푸는데 핀 투영 훅은 옛 주점·f를 계속 쓴다. 복원 경로는 막았고(자가 치유 후 재핀)
   창 크기 변경 경로가 남았다. P3(주점=수심)의 freeIntrinsics 동작점 실측도 없다(DEFERRED).
5. `restore_pose.json`·`snap_cache.json`의 near-zero 의심 플래그들은 **보장의 배선
   확인**(원장 what_not_say에 원인 명시 — 의심≠오류). 게이트 의심 1건은 기지의
   elevation(음성 대조 count).
6. 수는 적지 않는다 — **`selfcheck.json`의 `coverage`를 그 자리에서 읽는다.**

## 다음에 할 일 — **사람 지시 대기.** 그 전에 할 수 있는 것

| 항목 | 내용 |
|---|---|
| **실획 표본 파일** | `.brnl`이 오면 **다른 일보다 먼저** `sessions/`에 넣고 real_ink 재실행 — 7차 수정 전 저장본이므로 legacy 분리가 자동으로 돈다. 수정 후 앱으로 **새로 그린 두 번째 표본**이 진짜 판정자다(끝점 스냅률·물음 빈도·vertex_gap) |
| **3·4-R 재검** | 3·4-R 대응 표 16건(progress 맨 끝)을 다음 리뷰어가 재검한다(관례 절차) |
| **Actions 초록** | 병합 커밋(PR #1)의 Pages 실행 확인 |
| **iPad 실기** | 복원 재핀·궤도 렌즈 유지·끝점 스냅의 실기 확인 — 두 번째 표본과 같은 문 |

## 검증 현황 (마지막 커밋 기준)

vitest **465 통과 · 3 건너뜀**(75파일 — 건너뜀 = quickdraw 2·sessions 1, 데이터 의존) ·
tsc·빌드 통과 · Playwright **48 통과 · 2 건너뜀**(신설: restore_pose 4 · snap_cache 1) ·
pytest **73** · selfcheck STALE 0 · 게이트 의심 1(위 사실 5) · 상수 해시 **509615a1**
(7차는 SHARED_CONSTANTS를 안 건드렸다).

## ✋ 브라우저

`cd web && npm run dev:5222` → `/l.html`. `window.S2S` 7차 변경분: `snap(p)`이 시점
좌표로 정정(핀 밖에서도 옳다) · `stage.freeIntrinsics()`. 기존: `pathStats()` `orbitCenter()`
`cubeSpin(rad,ms)` `viewCube()` `askStats()` `doc()` `cam` `order()` `standing()`
`snap2d(p)` `pickVp(p)` `switchView(id)` 등.
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
⚠ 이 컨테이너는 pytest·numpy·cv2를 pip로 새로 깔아야 했다(`pip3 install numpy opencv-python-headless`).

## 반드시 읽는 것

1. `CLAUDE.md` 2. **`PITFALLS.md`** 3. `docs/line_plan.md` 4. 이 문서
5. `progress.md` 맨 끝(7차 절 전부 — 항목 1~4·1-R′·2-R″·3·4-R) ·
`assumptions.md`(AS-C1·AS-L14의 7차 대조 주석) · `DECISIONS.md`(~**D-L69**) ·
`DEFERRED.md`(2026-08-17 7차 절) · `QUESTIONS.md`
