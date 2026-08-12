# assumptions.md

계획(sketch2space_plan.md)·지시서(stage_v_spec.md)의 **전제**를 항목화한다(§13 자기검증 2).
각 단계 완료 시 관측과 부합하는지 재확인하고, 어긋나면 그 전제에 의존하는 판정 기준을
함께 갱신한다. 상태: ✅부합 · ⚠️갱신됨 · ❌위반(판정 함께 수정) · ⏳미검증

---

## 파서·아키텍처

| # | 전제 | 출처 | 관측 | 상태 |
|---|---|---|---|---|
| A1 | 파서는 결정론적·소규모 → TS 이식 타당 | spec §1.3 | `parse_strokes` 결정론적, tol 스칼라뿐 | ✅ |
| A2 | SolveSpace 바인딩이 유일한 난점, 솔버는 폐합만 | spec §1.3/§1.4 | **SolveSpace 미사용**. 폐합은 `recognize_rectilinear`가 자체 수행 | ❌→이식 난도↓, 표 "폴리곤 폐합" 자체구현 확인 |
| A3 | 기본 분할 = DP + 축클러스터 + 스냅 (분리 단계) | spec §1.4 표 | 기본=PaleoSketch `recognize_rectilinear`(프레임+스냅 융합). DP는 폴백 | ⚠️ 포팅 우선 paleo, 표는 DP경로 |
| A4 | tolerance는 10 스칼라 | plan §6.4 | `DEFAULT_TOL` 10 + `PALEO` 6 + stage1 상수(CANON_DIAG/FIT_MAX/LINE_CAP) | ⚠️ TS 이식은 PALEO+stage1 상수도 포함 |

## 스키마

| # | 전제 | 출처 | 관측 | 상태 |
|---|---|---|---|---|
| S1 | IR 루트 6필드 | spec 전제 | **7필드**(relations+openings, 지난 세션) | ❌→판정 G "27테스트"→**32**, §10 동일, TS 스키마 7필드 |
| S2 | 앵커 하나로 전체 절대치수 확정 | plan §3.3 | `apply_ops` 스케일 전파 동작 | ✅ |
| S3 | 관계 4종 | plan | 코퍼스 실측 **5종**(+aligned) | ⚠️(반영됨) |

## 표시·confidence (판정 D 핵심)

| # | 전제 | 출처 | 관측 | 상태 |
|---|---|---|---|---|
| D1 | 30% 완성에 저confidence **볼륨이 존재**해 파선 표시로 D 만족 | spec §0.2 D/§3.5 | **30%→parseable 0.017**(볼륨 없음), 50%→0.23. 그릴 볼륨 자체가 없음 | ❌→**D 교체**: 표시층 tentative hint(획뭉치 bbox/hull 파선상자, IR밖) |
| D2 | 중간 confidence 볼륨이 흔함 | plan §3.5 | 파서 결정적 → tentative 볼륨 희소(완전 아니면 미형성) | ❌→D1과 동일 해법 |
| D3 | confidence 임계 0.8/0.5가 실 값과 정합 | spec §3.5 | 완성 precise 0.83~0.89(≥0.8), coarse 0.63(0.5~0.8), 부분 <0.5 | ✅ |

## 측정 정합 (자기참조·자명 점검)

| # | 전제 | 출처 | 관측 | 상태 |
|---|---|---|---|---|
| M1 | multiplex 명명 결합률이 실제 성능 | score m_multiplex | **named_rate=1.0은 자기참조**: make_multi가 deixis 위치를 볼륨 중심에 둠→항상 최근접 자명 | ❌→비자기참조 테스트(중심에서 벗어난 deixis) 추가 필요 |
| M2 | query scale 최상위율 1.0이 유의 | score m_query_loop | scale 무앵커 시 산출물 미결정→항상 최고. 1.0은 정의상. 측정 대상=랭킹 정합(정상) | ⚠️ 정상이나 "1.0" 확인함 |
| M3 | opening_pos impact 0.0 | stage6 | pos가 산출물(부피)에 무영향→정확히 0. 이 경우 정상(조용히 채움) | ✅(확인함) |
| M4 | 카메라 fit_error | stage3 | 무노이즈 1.5e-16은 자기참조 → **폐기**, 노이즈 조건 재측정(p95 0.013~0.105) | ⚠️(해결됨) |

## 캡처 (V-5 대비)

| # | 전제 | 출처 | 관측 | 상태 |
|---|---|---|---|---|
| C1 | capture가 Pointer Events + pressure/tilt 저장 | spec §5.1/§5.3 | index.html: pressure·tilt 획득하나 **저장 포맷에 tiltX/Y·seq 없음** | ⚠️→V-5에서 추가 |

## 성능 (V-3/V-8 대비)

| # | 전제 | 출처 | 관측 | 상태 |
|---|---|---|---|---|
| P1 | 획→3D p95 <150ms 달성 가능 | spec §0.2 A/§8 | 뷰어 미구현 | ⏳ V-3/V-8 측정 |
| P2 | TS·Python 파서 f1 차이 <0.01 | spec §9 V-1 | TS 미구현 | ⏳ V-1 parity |
