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
상태: 대기

## 2단계 — 발화 스케일 앵커 (§7)
상태: 대기 (1단계 출력형식 확정 후 병렬)

## 3단계 — 투시 카메라 정합 (§7)
상태: 대기 (1단계 출력형식 확정 후 병렬)
