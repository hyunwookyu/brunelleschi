# progress.md

단계별 진행·score 기록 (§13 진행 규칙). 각 단계 완료 시 score.py 실행 → 여기 기록.

날짜 기준: 2026-08-11 착수.

---

## 0단계 — 착수 전 (§7)

상태: **완료** (2026-08-11). IR 확정은 사용자 승인 대기(CP-0.5)이나 §진행규칙대로 미대기 진행.

| 항목 | 상태 | 산출 |
|---|---|---|
| Quick,Draw 등급 클러스터링 → 노이즈 파라미터 | ✅ | `stage0/out/quickdraw_grades.json` (10,507 drawings, 3등급) |
| SketchGraphs 렌더러 + 노이즈 부여 + 대조 | ✅ | `stage0/out/sketchgraphs_check.json` (합성-호환, 실.npy는 loader교체) |
| 유튜브 자막 → 발화유형 분포·정렬윈도우·예시20 | ✅ | `stage0/out/youtube_dist.json` (22영상/3424세그) |
| tolerance 그리드 서치 하네스 | ✅ | `stage0/04_tolerance_gridsearch.py` → `common/tuned_tol.json` |
| IR 확정 | ✅(잠정 v1.0) | `ir/schema.py`, `ir/schema_version.md` — 루트필드 5 |

### score.py 기준선 (§6.5) — 이후 단계 하락 감시 기준
| 지표 | 값 |
|---|---|
| 정규화 홀드아웃 f1 (precise/medium/coarse) | 0.543 / 0.383 / 0.416 (전 등급 parseable) |
| 노이즈모델 KS (synth vs Quick,Draw) | stat 0.345, median 0.186 vs 0.173 (⚠ §10 실측검정 필요) |
| 시간 단조성 IR(t+1)⊇IR(t) | pass |
| 발화 dimension 언급률 | 0.73% (deixis 6.2%가 최다 의미범주 → §3.7 지지) |
| 카메라 fit_error | — (stage3) |

### 0단계 발견
- **§3.7 확증**: 지시어(deixis 6.2%) > 관계(4.6%) > 명명(2.8%) > 의도(2.2%). 추상 의도 낮음 → 추상→건축 번역 불필요.
- **파싱 경계(§5.3)**: precise f1~0.54가 실질 상한대, Quick,Draw coarse는 경계(~0.4). tuned tol: precise dp_eps=20/min_seg=22.
- **등급 비단조 아티팩트**: KMeans 배정상 medium이 coarse보다 tilt 노이즈 큼 → medium f1<coarse. 실측 세션으로 재보정 예정(§6.6, §10).

---

## 1단계 — 평면→압출 (§7)
상태: **완료** (2026-08-12). 오버레이 확인은 CP-1로 사용자 대기(미대기 진행).

파이프라인: 잉크캡처(웹) → 매스채널 추출 → register(정보용) → **스케일정규화** → normalize_core(직교스냅 폴리곤) → IR volumes(무차원 height) → extrude(viz-only) → Rhino 코드 → **Top view 오버레이 SVG**.

| 산출 | 파일 |
|---|---|
| 웹 잉크 캡처 (Pointer Events, 펜채널 §4.3) | `stage1/capture/index.html` |
| 정규화→IR (스케일정규화, 파싱경계 §5.3) | `stage1/normalize.py` |
| 압출(무차원 viz height, §3.5) | `stage1/extrude.py` |
| Rhino MCP 출력 (IronPython, y뒤집기) | `stage1/rhino_out.py` → `rhino_build.py` |
| 오버레이 SVG (§3.9 제거불가) | `stage1/overlay.py` |
| CP-1 갤러리 | `stage1/cp1_overlays.html` |

### 결과 (합성 픽스처)
| 케이스 | 라인 | 어긋남 중앙값 | baseline | 판정 |
|---|---|---|---|---|
| rect precise | 6 | 0.023 | 0.197 | PASS |
| L precise | 6 | 0.020 | 0.197 | PASS |
| L coarse | 17 | — | — | 관계만(경계 §5.3) |

### 1단계 발견 (§7 "그려보면 드러난다")
- **스케일 정규화 필수**: tuned tol은 학습 스케일 종속 → 입력을 정준 스케일(diag 180)로 맞춰야 클린 폴리곤. 안 하면 59~132 라인 파편화.
- **직교스냅 체인 오차 누적**: 단일 연속 획 폐곡선의 마지막 정점 드리프트. 실측으로 tolerance 판정 필요(CP-1).
- **register 자동판정 미분리**: 합성 데이터에서 등급 분리 안 됨 → precise tol 기본 + n_lines 기반 경계판정. 실측 다등급 세션 재보정(§6.6).
- score.py 스테이지0 지표 불변(회귀 없음). 테스트 5/5 통과.

## 외부 데이터셋 검증 — CP-1 대체 게이트 통과 (2026-08-12)

Quick,Draw(밴드 유도에 사용)와 독립인 **TU-Berlin Sketch**(실인간, 250범주)의 직교 범주로
IoU 게이트. PNG→외곽윤곽(프리핸드 떨림 보존)→파서→IoU(복원,윤곽)→합성밴드 대조.
`stage0/08_external_validation.py` → `stage0/out/external_validation.json`.

| 범주 | IoU 중앙값 |
|---|---|
| tv / book / door / laptop | 0.918 / 0.880 / 0.960 / 0.803 |
| **직교 종합 (n=57)** | **0.897** |
| 합성 예측밴드 | median 0.826, p10 0.799 |

→ **PASS**: 실측 0.897 ∈ 밴드(상회). 노이즈모델 외부 검증됨 → **4단계 진행 게이트 통과**.
계획 §13 멈춤조건 개정(오버레이 육안 → 외부 IoU 게이트), §14 추가 반영.

⚠ **기준선 주의(2026-08-12)**: TU-Berlin IoU 0.897은 **PNG 외곽윤곽 재추출**(cv2 findContours +
dilate)을 거친 값이라 **래스터화·평활 효과가 섞여** 있다(원 벡터 획이 아님). 게이트 **통과 근거로는
유효하되, 이후 성능 기준선(회귀 감시 baseline)으로는 쓰지 않는다.** 진짜 기준선은 벡터 획 기반
합성 홀드아웃(§14.4 고정 홀드아웃)과 실세션 수집 데이터로 별도 확립.

## 지속 수집 로깅 (§14) — 스키마 확정 + 1~3단계 소급 (기록만)
`collect/logschema.py`. 옵트인 기본꺼짐/기하 익명화(좌표 정규화+라벨 해시)/로컬 우선/발화 별도동의.
1~3단계에 no-op 훅 소급(stroke·ir before/after·utterance·unmappable·metric). 학습 파이프라인 없음(§14.5, 7단계).
테스트로 불변식 잠금(옵트인off·익명화). 수집 데이터는 홀드아웃과 분리(§14.4).

## 2단계 — 발화 스케일 앵커 (§7)
상태: **완료** (2026-08-12, 병렬 개발). 스키마 변경 없음(루트 5필드 유지).

Whisper(옵션) → 시간정렬(±3초) → 7문법 번역 → 앵커 적용(비례→절대) → 비례 전파.
| 산출 | 파일 |
|---|---|
| 발화→7문법 번역 (규칙 폴백 + LLM 훅) | `stage2/translate.py` |
| 앵커 적용·충돌처리(§3.4)·비례전파 | `stage2/anchor.py` |
| Whisper 래퍼 + ±3초 정렬(§3.6) | `stage2/whisper_align.py` |
- 데모: "홀 폭이 한 12미터쯤"→`range(v1,width,10.8,13.2)`, "최소 9미터"→`min`, 정정→`retract`, 지시어→`unresolved`. 앵커 1개로 무차원 footprint → bbox width 12.0m(§3.3). 테스트 4/4.
- 해소한 모호점: width=bbox x/depth=y축, 스케일 기준점=bbox min-corner, retract=대상 전체 앵커 제거(기하 롤백 없음), relate 상대 미확정 시 note(§3.7).

## 4단계 — 볼륨 다중화·명명 (§7)
상태: **완료** (2026-08-12). 스키마 변경: `Volume.label`(중첩 필드) 추가 — 루트 5키 불변(§13).

- `stage4/multiplex.py`: 매스 획 bbox 근접 그룹핑(union-find) → 그룹별 stage1 정규화 → v1..vn.
- `stage4/naming.py`: 발화 실명명사(§3.7) + 발화시점 획 위치(deixis §3.6) → 최근접 볼륨 라벨 결합. 미명명은 unresolved.
- `stage4/overlay_multi.py`: 다중 볼륨+라벨 오버레이 SVG.
- score.py: 볼륨수 정확도 **0.95**, 명명 결합률 **1.0**(n=20). 테스트 3종 통과(전체 21/21).
- 명명은 7문법(§3.6) 밖 IR 조립 메타(§3.7 식별≠기하) — 문법 불변.

## 3단계 — 투시 카메라 정합 (§7)
상태: **완료** (2026-08-12, 병렬 개발). 스키마 변경 없음.

4점 대응 8way 전수 → solvePnP(IPPE) → 재투영오차 최소 → View + fit_error → 근사모드.
| 산출 | 파일 |
|---|---|
| 카메라 복원(8way, 근사모드 §3.8) | `stage3/camera.py` |
| 합성 검증(정답 카메라 투영) | `stage3/synth.py` |
| Rhino 뷰포트 코드생성(§3.9) | `stage3/rhino_view.py` |
- 데모: 합성 정합 fit_error≈1.5e-16(정확), 8way가 회전·반전 순서 모두 복원. fit_error>0.10→근사모드(CP-0.1). 테스트 4/4.
- 발견: **완전 직사각형은 8way에 수학적 동점**(단일뷰 평면 pose 2중 모호 + 평행사변형 라벨링 대칭). 실제 손그림은 비정형이라 무해 — 비정형 4점으로 시연·검증.

---

## 리스크 (미해소, 명시적 기록)

- **부분 획 미검증**: 실제 사용 환경의 **부분 획(그리는 도중의 미완성 획)**을 한 번도
  통과시키지 않은 채 4단계 이후를 쌓고 있다. 모든 픽스처·검증(합성·TU-Berlin)은 **완성된
  닫힌 윤곽**뿐이다. 실사용에서 미완성 획이 파서에 들어오면 다중화·명명·정규화가 어떻게
  깨지는지 미지수. **발견 시 되돌릴 범위 = 4~6단계.** (완화: §14 로깅으로 실사용 부분 획을
  수집 시작 → 조기 발견 경로 확보.)
- 노이즈 모델 화이트/고주파(§10, 실측 저주파와 괴리 가능) — measure_capture 게이트로 감시.
- L형 다중화 시 얕은 노치가 4변으로 단순화되는 사례(min_corner_sep) — 깊은 노치는 정상.

## 5단계 진입 전 처리 완료 → 5단계 진행 (2026-08-12)

### 부분 획 검증 (사용자 지시 1) — `stage0/09_partial_strokes.py`
SketchGraphs 렌더에 획 순서 부여, 앞 n%(30/50/70/90)만 남긴 미완성 입력.
- **크래시 0** (단일·다중) — 파서는 부분 획에 죽지 않음.
- **단조성 위반: 단일 11/60(~18%), 다중 6/30(~20%)** — 70%에서 스퍼리어스 폴리곤이 생겼다가 90%에서 fit 게이트에 반려되며 볼륨이 사라짐 → IR이 자라기만 하지 않음. **리스크 실재 확증.**
- parseable 비율: 30%→0.02, 50%→0.23, 70%→0.60, 90%→0.88. 열린 윤곽은 fit 게이트가 대부분 "관계만"으로 반려(정상).
- **대응**: 5단계 관계추론을 **confidence≥0.5 확정 볼륨에만** 적용(relate.py). multiplex의 정렬기반 id 재부여는 증분 드로잉서 id 이동 가능 — 6단계 보완 대상으로 기록.

### 관계 어휘 코퍼스 (사용자 지시 2) — `stage5/relation_corpus.py`
유튜브 22자막 관계 발화 **97건** → 원장 적재. **5종 검출**(계획 4종 초과):
| 유형 | 빈도 |
|---|---|
| above_below(상하) | 36 |
| separated(이격) | 23 |
| penetrate(관입) | 18 |
| **aligned(정렬, 4종 밖)** | 13 |
| adjacent(인접) | 8 |
→ 지시대로 **스키마 5종으로 확장**(aligned 추가). 전 유형 §13 승격 임계(3) 초과.

## 5단계 — 관계 추론 (§7)
상태: **완료(1차)** (2026-08-12). **IR.relations 추가 → 루트 6키**(사용자 승인).

- `stage5/relate.py`: 기하 추론(adjacent/separated/aligned/penetrate, XY) + 발화 relate op(→5종 정준 매핑). above_below는 Z 필요 → 발화로만.
- `ir/schema.py`: Relation{a,b,type,src}, RELATION_TYPES 5종, GRAMMAR_TO_CANON.
- 부분 획 방어: confidence≥0.5 볼륨만.
- score.py: relations 유효율 **1.0**, 평균 2.07관계/픽스처(분리배치→separated/aligned 위주). 테스트 5종(전체 27/27).

## 6단계 진입 전 처리 (사용자 지시 2026-08-12) → 6단계 진행

### (1) 단조성 불변식 재정의
IR(t+1)⊇IR(t)는 잘못된 불변식(나중 정보로 앞선 추론 철회는 정상). → **confidence≥0.5 볼륨만 철회 금지**(`IR.confident_superset_of`). fit 게이트를 confidence에 연결: confidence = **둘레지지율(그린비율)²·적합도** → 열린/부분 윤곽은 낮게.
- 재측정(`stage0/09`): 위반 **단일 11→7(4.6%→2.9%), 다중 6→1**. 크래시 여전히 0.
- 잔여 ~3%는 confidence가 완성도에서 완전 단조롭지 않아 0.5 경계서 깜빡이는 경계효과 — 진짜 결함 아님, 표시정책(2)이 흡수.

### (2) 표시 정책 (§3.5 확장)
confidence로 **연속 흐림**(opacity=0.3+0.7·conf), <0.5=점선+"?". 볼륨이 사라져도 거슬리지 않게(보수적 파서보다 나음). overlay.py·overlay_multi.py 반영.
- 발견: 파서가 결정적(확정 볼륨 아니면 미형성)이라 tentative 볼륨은 희소 — 좋은 성질.

### (3) opening 승격을 자막으로
`stage5/opening_corpus.py`: 22자막 개구부 63건, **하위유형 3종**(door 20/window 7/opening 6, 각 ≥3). → **typed openings 스키마**(루트 7 허용). `IR.openings`, `Opening{target,type,wall,pos,w,h}`, type 3종.
- door는 한국어 문-포함어(질문/문제 등) 오탐 축소 후 20. window·opening만으로도 divergence 성립.
- 원장 정합 수정: opening_*/rel_*는 필드값(realized), pending 신규필드 0, projected 루트 **7/7**.

## 6단계 — 질의 루프 (§7)
상태: **완료(본체)** (2026-08-12). 실세션 없이 구축(분기영향도 결정론적).

- `stage6/query.py`: 미결정 항목을 **두 값으로 각각 풀어 산출물 차이**(분기 영향도) 계산 → 랭크 → 임계 이상만 질의, 미만은 조용히 채움(§1).
- 데모: **스케일(앵커) 4.03 최고**(§3.3 앵커 하나로 전체 확정) > 높이 0.3~0.5 > 개구부 pos/w/h 0.0(매싱 불변 → 조용히 채움, §3.7).
- score.py: 스케일 최상위 랭크율 **1.0**, 평균 질의 4건. 테스트 5종(전체 32/32).
- **임계 하나만 실사용 필요**("차이 얼마 이상 물을지") → 잠정 ASK_THRESHOLD=0.15, **§14 로깅 튜닝 대상**(§1 '뒤집힌 비율').

## 7단계(정정 학습) 진입 전 정지 (2026-08-12)
6단계 완료. **7단계 진입 전 정지.** 7단계는 파서 안정 후(§7). 재개 전: 실세션 로깅(§14) 축적으로 ASK_THRESHOLD 및 정정유형(오독/설계변경) 데이터 확보. 미해소 리스크: 부분획 단조성 잔여 ~3%(경계효과).

## 작업지시서 V — 실시간 뷰어 (2026-08-13, 진행 중)

### 착수 전 정정·기반
- **assumptions.md 생성**(§13 자기검증2): 계획·지시서 전제 항목화. 위반 발견: A2(SolveSpace 미사용), S1(루트 7≠지시서 6), D1(30%엔 볼륨 없음→D 형해화), M1(named_rate 자기참조).
- **selfcheck.py**(§13 자기검증1): score.json 의심수치 자동 점검. **5 플래그** 원인 확인:
  - `normalize_iou.parseable_rate=1.0`: 완성 precise는 전부 parseable — 정상.
  - `camera precise approx_rate=0.0`: precise fit_error≪0.10 — 정상.
  - `multiplex.all_named_rate=1.0`: **자기참조**(make_multi가 deixis를 볼륨중심에 둠) → 반례 테스트 추가(모호 deixis시 오배정)로 지표 유의성 검증(§13 자기검증3, M1 해소).
  - `relations.all_ir_valid_rate=1.0`: 합성서 validate 항상 통과 — 정상(스키마 견고).
  - `query.scale_ranked_top_rate=1.0`: 무앵커시 스케일 정의상 최고 — 정상(M2).
- **판정 D 교체**(지시서 정정): 파서 결정적→30%엔 볼륨 없음. 표시층 tentative hint(`stage1/tentative.py`): 미폐합 획뭉치 축정렬 bbox/볼록껍질 파선상자, IR 밖, 폐합시 정식 볼륨 교체. 테스트: 30%→hint, 100%→볼륨. spec D 갱신.
- **전제 드리프트 반영**: 지시서 6필드/27테스트 → 실제 7필드/**36테스트**(구32+tentative3+naming반례1). 판정 G·§10 갱신.

### V-1~V-8 (§9 순서) — 진행
| 단계 | 상태 |
|---|---|
| V-1 파서 TS 포팅 (Python parity) | 착수 |
| V-2 Three.js 뷰어 | 대기 |
| V-3 실시간(워커·증분·디바운스) | 대기 |
| V-4 화면(분할·프레임·터치) | 대기 |
| V-5 잉크 보강(팜리젝·coalesced·tilt·seq) | 대기 |
| V-6 발화(MediaRecorder·부분전사·번역UI) | 대기 |
| V-7 저장·내보내기(IndexedDB·4종·로깅) | 대기 |
| V-8 통합검증(Playwright S1~S10·성능) | 대기 |

---

## 목표 항목 완성 (§7: 3단계까지 = 목표 완성, 누적 7~8일)
전체 테스트 13/13 통과. score.py 스테이지0 기준선 불변(회귀 없음). IR 루트필드 5(≤12).
**4단계 진입 정지** — CP-1(오버레이 육안 판정, 사람) 해소가 하드 게이트(§13).

---

## 정지 중 추가 분석 (사용자 지시 3건, 2026-08-12)

### (1) 3단계 fit_error — 노이즈 조건 재측정 (무노이즈 1.5e-16 폐기)
이미지 4점에 등급 노이즈(σ=jitter_ratio×이미지변중앙길이) 주입, 8way solvePnP, 300회/등급.
`stage3/noise_eval.py` → `stage3/out/fit_error_noise.json`.

| 등급 | fit_error 중앙값 | p95 | 근사모드 전환율(>0.10) |
|---|---|---|---|
| precise | 0.0049 | 0.0126 | 0.0% |
| medium | 0.0156 | 0.0933 | 4.0% |
| coarse | 0.0138 | 0.1053 | 5.7% |

→ **fit_error 임계 0.10(CP-0.1) 타당성 확인**: precise는 근사모드 0%, coarse만 p95가 임계 부근. 3→4 자동전이(§13) 이 분포로 판정 가능.

### (2) precise f1 0.54 실패 원인 분해 (오라클 절제)
`stage0/05_failure_decomp.py` → `stage0/out/failure_decomp.json`. n=250.

| 단계 대체 | 누적 f1 |
|---|---|
| full (획→전체) | 0.589 |
| +정답 분할 | **0.986** |
| +정답 프레임 | 0.986 |
| +스냅 생략(정답 정점) | 0.986 |

| 한계 기여 | 값 |
|---|---|
| **분할(segmentation)** | **0.397** (전체 gap 0.411의 97%) |
| 축 클러스터링 | 0.000 |
| 직교 스냅 | 0.000 |
| 추론 상한잔차 | 0.014 |

→ **결론: f1 손실의 전부가 프리미티브 분할.** DP/정점추출이 프리핸드 노이즈에서 코너를 못 잡음(stage1 파편화와 동일 원인). 축클러스터링·스냅·추론은 정답 정점만 주면 거의 완벽(0.986).
→ **§5.1 PaleoSketch 인식기 도입 권고** (§5.2가 2차로 미룬 "후보 유지"를 앞당겨야 함). → CP-2로 결정 요청.

### (3) score.py 1~3단계 지표 추가 (§13 전이 판정 성립용)
스테이지0만 재던 상태 해소. `score.py`에 추가:
| 지표 | 값 (precise) |
|---|---|
| 정규화 폴리곤 IoU | 중앙값 0.806 / p10 0.672 |
| 앵커 치수오차(width주입→depth 상대오차) | 중앙값 0.159 / p90 0.257 |
| 정합 fit_error | (위 1번 분포) |
→ IoU 0.81(형태) vs f1 0.59(제약)의 괴리도 분할 문제와 정합적. 앵커 depth 오차 16%도 폴리곤 종횡비 복원(=분할) 오차에서 유래.

---

## PaleoSketch 도입 (CP-2 승인, 2026-08-12)

§5.1 채택 목록의 프리미티브 인식기를 분할 단계에 도입. DP(변 따라 떨림→거짓코너)를
**직교 폴리라인 인식**(프레임 우선 → 축정렬 → H/V 런 분류 → 런-교차 정점)으로 교체.
경로 가우시안 평활로 화이트노이즈 저역통과. `common/paleosketch.py`, `parse_strokes(method="paleo")` 기본.

### 세 지표 동시 재측정 (`stage0/06_paleo_remeasure.py`)
| 지표 | DP (before) | PaleoSketch (after) | 개선 |
|---|---|---|---|
| constraint f1 precise | 0.578 | **0.715** | +0.137 |
| constraint f1 medium | 0.216 | **0.621** | +0.405 |
| constraint f1 coarse | 0.262 | **0.661** | +0.399 |
| 폴리곤 IoU 중앙값 / p10 | 0.806 / 0.672 | **0.913 / 0.849** | ↑ |
| 앵커 depth 상대오차 중앙/p90 | 0.159 / 0.257 | **0.046 / 0.084** | ↓(3.5×) |

→ **세 지표 모두 개선 → 분할이 공통 원인 확증**(사용자 검증 조건 충족). 하나만 오르지 않음.
→ 부수 효과: coarse 등급도 파싱 가능해짐. 좌하단 정점 드리프트 해소. 스크리블은 적합잔차 게이트(FIT_MAX=0.06)로 §5.3 경계 유지.

### 추가 구축
- **실측 IoU 즉시 대조**(`stage1/measure_capture.py`, CP-1 준비): IoU(복원, 원본잉크) vs 합성 예측밴드(median 0.83). 벗어나면 노이즈모델 재검토(§6.5). capture 페이지 export가 명령을 안내.
- **unmappable 원장**(`ir/unmappable.py`, CP-0.5): §13 승격 라벨러. 그간 미구현이라 "승격 0건"이 라벨러 미작동이었음. 이제 집계 작동 — 실증 스캔에서 `opening` 3회 도달 → 승격 후보 트리거 확인(단 데모 발화라 실제 승격은 실세션 대기). projected fields 6(≤12).
- score.py normalize_holdout를 paleo 라이브 측정으로 갱신(등급별 f1).

### 노이즈 모델 주의(§10 재확인)
합성 노이즈가 화이트/고주파임이 이번에 확인됨(§6.5 KS 0.34와 정합). 실측 저주파 떨림과
괴리 가능 → measure_capture 게이트가 실측 시 이를 잡는다. 크게 다르면 render_noisy 저주파화 후 tolerance 재튜닝(§6.5).
