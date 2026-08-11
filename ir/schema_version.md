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
