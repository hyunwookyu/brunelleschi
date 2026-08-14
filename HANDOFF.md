# HANDOFF.md — 세션 인계

다음 세션은 이 문서를 읽고 이어서 진행한다. 사람의 개입은 그 한 줄뿐이다.

## 읽어야 할 문서 순서
1. `CLAUDE.md` — 작업 지침(진행 규칙 A-1~A-4, 자료구조, 구조)
2. `docs/wireframe_plan.md` — 현행 계획서
3. 이 문서 (아래 현재 단계)
4. `DECISIONS.md`, `DEFERRED.md` — 이미 내린 판단과 의도적으로 줄인 것
5. 필요할 때 `docs/perspective_theory.md`(§6 참조 지도가 CLAUDE.md에 있다), `assumptions.md`

## 현재 단계
**W-A 완료 → W-0 진행 중**

## 다음에 할 일
- `web/src/wire/strokeEdge.ts` — 획→엣지 매핑. 측정 대상이자 앱에 들어갈 코드(D-A5).
- `web/test/stroke_edge.test.ts` — Quick,Draw 실획으로 (a)~(d) 측정, `stage0/out/stroke_edge.json` 기록.
- 측정 항목: (a) 1획→1엣지 비율 (b) 덧그림 병합 정확도 (c) 획 분절 오류율 (d) 지나침 빈도.
- **중단 조건**: (a)가 0.5 미만이면 보고하고 멈춘다. 그 외에는 A-2로 우회.

## 잠정 결정
`DECISIONS.md` 참조. W-A에서 5건(D-A1~D-A5).

## 미해소 지적
없음 (W-A 리뷰어 호출 결과를 여기에 적는다).

## 최근 커밋
- W-A: 전환 정리 (아래 커밋 해시로 갱신)
