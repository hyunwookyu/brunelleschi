# SKETCH2SPACE — 작업 지침 (CLAUDE.md)

투시 작도 기반 3D 모델러. **현행 계획서는 [`docs/wireframe_plan.md`](docs/wireframe_plan.md)**(코드명 W).
원 사양 [`sketch2space_plan.md`](sketch2space_plan.md)은 배경 문서로 남되, 충돌하면 계획서가 이긴다.
이론 근거는 [`docs/perspective_theory.md`](docs/perspective_theory.md).

**제품 정의**: 카메라를 먼저 세우고, 그 위에서 투시 작도로 3D를 직접 구축한다.
SketchUp의 선 도구와 메커니즘이 같다. 유일한 차이는 카메라의 출처 — SketchUp은 3D 앱이라
처음부터 알고, 여기서는 초반 입력이 그것을 정한다.

**핵심 원리**: 카메라가 확정되면 커서 픽셀 하나가 3D 점 하나를 유일하게 결정한다
(눈에서 커서로 나가는 광선 ∩ 시작점+t·축방향 직선의 최근접점). **추론이 사라지고 계산만 남는다.**

> 2026-08-14 전환. 이전 접근(완성 스케치 → 형태 추론)은 폐기됐다. 왜 바꿨는지는
> [`docs/archive/stage_v_spec.md`](docs/archive/stage_v_spec.md) 머리말과 `assumptions.md`
> "접근 전환으로 무효" 절에 있다. 측정 산출물은 `stage0/out/archive_pre_W/`에 보존.

---

## 1. 자료구조 (계획서 §5.1)

```
Vertex  { id, position: Vec3, provenance }
Edge    { id, v0, v1, direction: VP1|VP2|VP3|screen|free }
Face    { id, edges[], normal, plane }
Camera  { vps[], principal, f, locked }
```

- 구 IR(volumes/anchors/openings/…)은 **폐기**. 루트 필드 제한 규칙만 유지한다.
- provenance는 남되 단순해진다: `measured / setting / default`.
  measured = 사용자가 그은 것에서 나온 값. setting = 슬라이더·프리셋. default = 미조작 기본값.
- **자료구조 변경은 사람에게 올린다**(A-3 예외 4항 중 하나).

---

## 2. 진행 규칙 — 무중단 자율 진행

W-A → W-0 → W-1 → … → W-8까지 멈추지 않고 완주한다. **중간 보고 없음. 확인 요청 없음.**

```
각 단계 완료 시:
  테스트 실행 → selfcheck 실행 → 리뷰어 호출 → 지적 대응 → 커밋 → 다음 단계
```

### A-2. 막혔을 때 — 멈추지 말고 우회한다
1. **재시도** — 같은 접근으로 최대 3회, 매번 다른 가설로
2. **우회** — 더 단순한 구현으로 대체(예: 면 생성 경계가 어려우면 사각형 면만 우선).
   사실과 원래 목표를 `DEFERRED.md`에 기록
3. **격리** — 해당 기능을 끄고 나머지 진행. 전체가 의존하면 최소 대체물
4. **다음 단계로** — 어떤 경우에도 다음 W로 넘어간다

**중단하는 유일한 경우**: 획→엣지 매핑이 성립하지 않을 때. 이 방식 전체의 전제가
무너지므로 보고하고 멈춘다. 그 외에는 어떤 이유로도 멈추지 않는다.

W-0에서 **무엇을 재는지가 바뀌었다**(DECISIONS D-01). 원래 지시는 "1획=1엣지 비율 0.5"였으나
그 값은 검출기가 **둔감할수록 오른다**(코너를 놓치면 런이 하나가 된다). 대체 후보였던
덮임률은 반대로 **과민할수록 오른다**. 둘 다 한쪽으로만 속는다.

| | 재는 것 | 임계 | 표본 | 측정값 |
|---|---|---|---|---|
| **현행 게이트** | `optimal_rate` — 검출 엣지 수 == 허용오차를 지키는 **최소** 엣지 수인 획 비율 | **0.5** (원 조건의 임계를 그대로 옮김) | Quick,Draw raw 폐곡선 n=1819, 정답 라벨 불요 | **0.7125** ✅ |
| 참고(게이트 아님) | 1획=1엣지 | — | 같음 | 0.294 |

`optimal_rate`는 **양방향**이다 — 잘게 쪼개면 detected가 늘고, 놓치면 조각이 허용오차를
못 지켜 minimal이 늘어난다. 파라미터 격자에서 내부 최댓값을 가진다(과민 끝 0.451,
채택 0.703, 둔감 끝 0.501). 산출: `stage0/out/edge_fidelity.json`.

> ⚠ **이 게이트는 아직 약하다.** 격자 12개 중 0.5 미만은 양 극단 2개뿐이라 사실상 잘 발동하지
> 않고, 전제(획이 엣지로 해석되는가)와 구현 품질(검출기가 좋은가)이 한 수치에 섞여 있으며,
> 개수만 비교해 과분할과 미분할이 상쇄된다. 리뷰어 지적이며 **해소되지 않았다**.
> W-3에서 곡선 제외분·위치 오차·`straight_tol` 스윕을 재고 게이트를 다시 정한다(DECISIONS D-01).

### A-3. 판단 규칙 (사람에게 묻지 않는다)
- 측정이 가리키는 방향을 우선한다
- 사전 예상과 어긋나면 **측정을 따르고**, 예상을 `assumptions.md`에 반증으로 기록한다
- 선택지가 여럿이면 **가장 단순한 것**을 고른다. 복잡한 대안은 `DEFERRED.md`
- 계획 문서와 실제가 어긋나면 **실제를 따르고 문서를 갱신한다**
- 범위를 넓히지 않는다. 넓히고 싶으면 `DEFERRED.md`
- 선택 근거와 **기각 사유**를 `progress.md`에, 잠정 결정은 `DECISIONS.md`에

사람에게 올릴 것은 없다. 프로토타입 완성 후 한 번에 검토한다.

### A-4. 품질 하한 (타협하지 않는다)
- 기존 테스트가 깨진 채로 다음 단계에 가지 않는다
- 새 기능마다 테스트를 쓴다(반례 테스트 포함 — 아래 §4)
- selfcheck를 매 단계 돌린다
- 리뷰어를 매 단계 호출한다. 지적을 2회까지 대응하고 남으면 `DEFERRED.md`로 옮긴 뒤 진행
- 커밋을 잘게 나눈다. 되돌릴 수 있어야 한다
- `progress.md`를 매 단계 갱신한다

### A-1. 세션 인계
컨텍스트가 차면 `HANDOFF.md`를 갱신하고 종료한다. 다음 세션은 그 한 줄로 시작한다:
`"HANDOFF.md를 읽고 이어서 진행하라."` **이 문장이 유일한 사람 개입이다.**

---

## 3. 리뷰어 서브에이전트

`.claude/agents/reviewer.md`. **각 W 단계 완료 시** 호출한다. 지적이 나오면 대응 후 재호출,
2회 반복 후에도 남으면 `DEFERRED.md`에 올리고 진행한다.

리뷰어는 **코드를 보지 않는다**(문서·수치만). 이 프로젝트에서 세션 밖에서 잡힌 결함
(마우스 precise vs Quick,Draw 대표성 충돌, jitter_ratio 단위 혼동의 Track 2 파급,
이론서 8.8이 2I 결론을 뒤집은 것, 4.6%가 PCA 프레임 값이었던 것)이 전부
**"테스트 통과"에 설득당하지 않는 위치**에서 나왔기 때문이다.

---

## 4. 자기검증 규칙

각 단계 완료 시 자동 점검하고 `progress.md`에 기록한다.

1. **의심 수치 자동 점검** — `python selfcheck.py`가 `stage0/out/*.json`을 스캔한다.
   1e-10 미만 오차 / 정확히 1.0·0.0 비율 / 이전 대비 완전 불변 / 0 고정 카운터 /
   단일 범주 분포 / 비결정 시드 정적 탐지. 의심≠오류 — 각 플래그의 원인을 확인한다.
   **측정은 반드시 `stage0/out/`에 JSON으로 남긴다.** 원장 밖 측정은 규칙이 있어도 안 걸린다.
2. **assumptions.md** — 매 단계 관측과 대조. 어긋나면 의존 판정도 갱신.
3. **새 지표엔 반례 테스트** — 그 지표가 의도한 것을 재는지 확인한다.
   (전례: `named_rate` 1.0이 자기참조였던 것, 재투영 오차 0.0이 항등이었던 것)

**재현성**: 시드에 `hash(str)`를 쓰지 않는다(PYTHONHASHSEED 무작위화). `stable_seed` 사용.
시드 변동폭 때문에 **유효 자릿수는 2자리**로 본다.

---

## 5. 디렉토리 구조

```
SKETCH2SPACE/
  CLAUDE.md                이 문서
  HANDOFF.md               세션 인계 (A-1) — 매 단계 갱신
  DECISIONS.md             잠정 결정과 근거 (A-3)
  DEFERRED.md              우회·단순화·미룬 항목 (A-2)
  progress.md              단계별 진행·측정 기록
  assumptions.md           전제 대장
  checkpoints.md           (구) 사람 확인 항목 — W 전환 후 신규 등록 없음
  docs/
    wireframe_plan.md      현행 계획서
    perspective_theory.md  이론서 (전 구간 참조)
    archive/               폐기된 계획서 + 폐기 사유
  web/                     프로토타입 본체 (TypeScript + Vite + Three.js)
    src/capture/           잉크 캡처 (Pointer Events, 마우스 1급, 팜 리젝션)
    src/wire/              [W-0~] 획→엣지, 카메라 누산기, 추론 엔진, 기하
    src/parser/            geometry/linalg/paleosketch/grade — 유지되는 원시 유틸
    src/data/              Quick,Draw 실획 로더
    test/                  vitest
  stage_perspective/       카메라 수학 (Python 기준 구현)
    viewdist.py            6.2 f²=|PV₁||PV₂|, 6.3 수심, 18.4 화각, 8.7/8.8 시거리
    camera_unified.py      소실점 개수별 통합 복원 + 자유도 회계(5.3)
    repetition.py          등간격 반복 (9.5/9.6)
    project.py             합성 투영 (검증용)
    noise.py               실측 코너오차 등급 + stable_seed
  stage3/                  camera.py(4점 적합) synth.py(합성 장면)
  common/                  normalize_core(획 원시처리) paleosketch inknoise session_io grammar
  stage0/                  통계 하네스 + out/ (측정 산출물, archive_pre_W/에 구 접근 보존)
  selfcheck.py
  tests/                   pytest
```

---

## 6. 이론서 참조 지도

W-1 이후가 직접 쓰는 절만 추린다.

| 절 | 내용 | 쓰는 곳 |
|---|---|---|
| 2.3 | 1/2/3점 투시는 하나의 이론 | W-1 누산기 설계 |
| 5.3 | 자유도 회계 | W-1 상태 표시 = 자료구조 |
| 6.2 | f² = \|PV₁\|\|PV₂\| | W-1 2점 해 |
| 6.3 | 주점 = 수심 | W-1 3점 해 |
| 6.5 | 예각 조건 (둔각이면 f²<0) | W-1 실시간 유효성 |
| 7.7 | 실척으로 읽히는 방향 | W-1 부분 확정 상태에서의 작도 |
| 9.5·9.6 | 등간격 반복 | W-2 스냅 힌트 |
| 16.2 | 주점 = 이미지 중심 가정 | W-1 2점 경로(가정임을 명시) |
| 18.4 | 화각 임계 | W-1 구도 경고 |
