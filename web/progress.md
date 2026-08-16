
### 배포 확인 (2026-08-16)

푸시 뒤 Actions **세 job 전부 초록**(`build` · `deploy` · `measure`).
배포본: <https://hyunwookyu.github.io/brunelleschi/>

브라우저로 확인한 것 — ⚠ **원장 밖 관측이다**(#25. `static_deploy.spec.ts`는 여전히
**로컬 정적 서버**를 잰다):

- `/brunelleschi/`와 `/brunelleschi/l.html` 둘 다 **200** (루트 리다이렉트가 듣는다)
- `window.S2S`가 서고 도구 막대가 뜬다(`그리기`·`가이드 조정`·`궤도`·`고치기` …)
- 서비스 워커가 **`https://hyunwookyu.github.io/brunelleschi/`를 scope로** 잡고 페이지를 제어한다
- **콘솔 오류 0**
- `<title>`이 `Brunelleschi — 투시 선 도구`(이름 반영이 배포본까지 갔다)

⚠ **README의 "아직 한 번도 실행되지 않았다"를 사실로 바꿨다** — 그 문장은 **#32의 거울상**을
피하려고 적어 둔 것이었고("적힌 것과 도는 것은 다르다"), 이제 돌았으므로 그렇게 적는다.
