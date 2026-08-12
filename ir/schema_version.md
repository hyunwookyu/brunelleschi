# IR 스키마 변경 이력 (§10 고정)

매 단계 종료 시 스키마를 문서로 고정. 이 문서가 다음 단계의 사양(§10, §447).
필드 = 루트 최상위 키. 12 초과 시 멈춤(§13).
스키마 변경 후 SketchGraphs 홀드아웃 일치율이 떨어지면 잘못 자란 것(§10) → 되돌린다.

---

## v1.0 — 0단계 (2026-08-11)

루트 최상위 키 5개: `volumes, anchors, views, unresolved, notes` (§3.2 초기 최소형 그대로).

- `relations` 미포함 (§3.2: 1차 제외, 5단계 대상).
- `volumes[].height` 는 nullable. 앵커 없으면 None = 무차원(§3.5 기본값 금지).
- `unresolved` = 핵심 필드. 추정 않고 남김.
- 홀드아웃 f1 기준선(참조): precise 0.543 / medium 0.383 / coarse 0.416.
- 상태: **사용자 확정 대기(CP-0.5).** 0단계 unmappable 집계 없음 → 승격 필드 0.

변경 없음(초기 정의).

## 1·2·3단계 — 변경 없음 (2026-08-12)

- 1단계(평면→압출): `Volume.footprint` + `height=None` 사용. 필드 추가 0.
- 2단계(발화 앵커): `Anchor`(set/range/min) + `Note`(relate/충돌) 사용. 필드 추가 0.
- 3단계(카메라): `View.camera` dict + `fit_error` 사용. 필드 추가 0.
- unmappable 승격 집계: 0건. 루트 필드 5 유지(≤12).
- 홀드아웃 f1 불변(precise 0.543) → 스키마가 잘못 자라지 않음(§10 점검 통과).

## PaleoSketch + 라벨러 도입 (2026-08-12) — 스키마 변경 없음

- 분할기 교체(PaleoSketch)는 파서 내부 변경 — IR 스키마 불변. 루트 5키 유지.
- **unmappable 원장 가동**(`ir/unmappable.py`): 그전까지 승격 집계 로직 부재 → "승격 0건"은 라벨러 미작동이었음(수정됨).
- 실증 스캔: `opening` 3회 → 승격 후보 트리거 작동. **실제 승격은 실세션 데이터 대기**(데모 집계로 필드 추가 금지). 승격 시 projected 6키(≤12).
- paleo 재측정 후 f1 상승(precise 0.543→0.715) → 스키마 정합성 유지(§10, 하락 아님).

## 4단계 — Volume.label 추가 (2026-08-12)

- `Volume.label: str = ""` 추가(명명, §7 4단계). **중첩 필드 — 루트 최상위 키 5개 불변**(§13 계수규칙).
- 명명은 7문법(§3.6) 밖 IR 조립 메타(§3.7 식별≠기하). 문법·루트 스키마 불변.
- from_dict 하위호환(label 없는 기존 JSON → 기본 ""). 홀드아웃 f1 불변.
- **다음 잠재 변경**: 5단계 relations. §3.2가 제외한 필드로, unmappable 승격 규칙(§13) 통과 시 루트에 추가.

## 5단계 — relations 필드 추가, 루트 6키 (2026-08-12)

- **`IR.relations: list[Relation]` 추가 → 루트 최상위 키 6개**(≤12, §13). 사용자 승인.
- 승격 근거: 유튜브 22자막 관계 발화 97건(원장 집계). "relation" 카테고리 3회 훨씬 초과.
- **관계 유형 5종**(RELATION_TYPES): adjacent/above_below/penetrate/separated/**aligned**.
  - 계획 4종(인접·상하·관입·이격) → 코퍼스에서 aligned(정렬) 13회 검출 → **데이터 근거로 5종 확장**(사용자 지시 "넘으면 스키마를 그에 맞춘다").
- `Relation{a,b,type,src}`. src=geometry|utterance. grammar.RELATE_TYPES에 separated 추가, GRAMMAR_TO_CANON 매핑.
- 기하 추론: adjacent/separated/aligned/penetrate(XY). above_below는 Z 필요 → 발화로만.
- 부분 획 방어(§task1): confidence≥0.5 볼륨만.
- from_dict 하위호환(relations 없는 기존 JSON → []). 홀드아웃 불변.

## 5단계(2차) — openings 필드 추가, 루트 7키 (2026-08-12)

- **`IR.openings: list[Opening]` 추가 → 루트 최상위 키 7개**(≤12). 사용자 승인("루트 7 허용").
- 승격 근거: 유튜브 22자막 개구부 발화 63건, **하위유형 3종 각 ≥3**(door 20/window 7/opening 6) → typed 필요.
- `Opening{target, type, wall, pos, w, h, src}`. **type 3종**: window/door/opening(OPENING_TYPES).
  pos/w/h=None → 미지정(§3.7) = 질의 대상(§6 6단계). `unresolved_props()`.
- 원장 정합: opening_* / rel_* 키는 openings/relations 필드의 값(realized), 신규 루트 키 아님. pending 신규필드 0, projected 루트 7/7.
- Volume.confidence 산출 변경(둘레지지율²·적합도) — 스키마 필드 불변, 값 의미만.

## 필드 현황 (2026-08-12)
루트 7키: volumes/anchors/views/unresolved/notes/relations/openings. 여유 5. 스키마 하락 없음.
