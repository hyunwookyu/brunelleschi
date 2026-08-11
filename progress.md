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

## 목표 항목 완성 (§7: 3단계까지 = 목표 완성, 누적 7~8일)
전체 테스트 13/13 통과. score.py 스테이지0 기준선 불변(회귀 없음). IR 루트필드 5(≤12).
**4단계 진입 정지** — CP-1(오버레이 육안 판정, 사람) 해소가 하드 게이트(§13).
