# sessions/ — 실획 세션

앱 하단 **"획 내보내기"**로 받은 JSON을 여기 넣는다.
`web/test/real_ink.test.ts`가 이 폴더를 읽어 `stage0/out/real_ink.json`을 낸다.

담기는 것은 원본 포인터 표본과 판정·배치 결과뿐이고 사용자 식별 정보는 없다.
표본이 없으면 측정은 `awaiting_samples` 상태를 남기고 조용히 지나간다.
