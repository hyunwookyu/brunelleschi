# 아이콘 원본 — 선 문법 (확정 · 2026-08-27)

> 사람이 승인했다. 이 파일이 **정본**이다 — `index.html` 에 인라인으로 그대로 넣는다.
> path 를 임의로 고치지 않는다. 고쳐야 하면 여기를 먼저 고치고 그 값을 옮긴다.

## 규칙

- **직접 그리는 도구**(연필통 · 펜 · 지우개 둘 · 면) — 지금 `index.html` 의 실물 그림
  유지. ⚠ **연필만 예외다**(아래 「실물 도구 — 연필만 바뀐다」): 접힌 아이콘 하나 +
  누르면 펼쳐지는 연필통, 끝을 뾰족하게. 펜 · 지우개 둘 · 면은 **손대지 않는다.**
- **그 외 전부** — 선 문법 하나:
  `fill:none · stroke:currentColor · stroke-width 1.6/32 · round cap/join · 닫힌 실루엣`.
- **소스**(Phosphor light · MIT): 오스냅 = `compass-tool` · 치수 = `ruler` ·
  격자 = `grid-four` · 동작 = `arrows-out`(전체 화면) · `plus` · `eye` · `eye-slash` ·
  `lock-simple`. ⚠ mdi `set-square` 는 **폐기**(채운 면 스타일) — npm 은 Phosphor 하나다.
- **자작**(아래): 축 스냅 = 삼각자 · 축척 = 삼각 스케일 · 겹 = 트레이싱지 롤 / 옐로 롤 ·
  T자(예비, 지금 쓸 자리 없음).

### ⚠ 색 예외 하나 — 옐로 트레이스 롤

선 아이콘은 전부 무채색인데 **옐로 롤만 고리(외곽 원 ↔ 심지 원 사이)를 채운다.**
값은 **`#e9d98a`**(사람이 세 농도 중 「진한 것」을 골랐다).

- 근거: **옐로 트레이스는 이름 자체가 색**이다. 색 칩을 따로 두면 정체가 아이콘 밖으로
  나간다. 예외는 이 하나뿐이고, 정확히 색이 정체인 자리에만 쓴다.
- 트레이싱지 롤은 **안 채운다** — 무색인 것이 그것의 정체다.
- 채움은 `fill-rule="evenodd"` 로 심지를 뚫고, **선 아래에 깔린다**(stroke 는 그대로
  `currentColor`).
- ⚠ **실기기 확인 항목**: 22px 랙에서 채워진 아이콘이 「선택됨」으로 오독되지 않는가.
  활성 표시는 배경 음영이라 채널이 다르지만 작은 크기에서 겹칠 수 있다. 오독되면
  대안은 「트레이싱지도 아주 옅은 무채색으로 채워 빈 것/찬 것이 아니라 무색/노랑의
  대비로 만든다」이고, 그때 값을 새로 정한다.

---


---

## 실물 도구 — **연필만 바뀐다** (2026-08-27 추가)

⚠ 지금까지의 규칙은 「직접 그리는 도구는 손대지 않는다」였다. **연필은 예외가 됐다** —
사람이 정했다:

> 「**옛 연필 아이콘을 기본으로 보여주고 그걸 누르면 연필통을 펼치자.** 펜은 하나뿐이니까
> 옛 아이콘 하나만 누르면 되도록 하고. 그러면 펼쳤을 때 나오는 연필 아이콘은 좀더
> 연필스럽게 **앞을 뾰족하게** 바꿔도 되겠다.」
> (경도 각인은) 「**접힌 아이콘에 경도는 있어야 한다.**」

- **펜 · 지우개 둘 · 면은 그대로다.** `index.html` 의 지금 그림에서 안 바뀐다.
- **홀더펜은 기각됐다**(2026-08-27 · 텍스트로 답함): ① 30px 에서 제도펜과 똑같은
  가는 원통이라 접힌 상태의 두 아이콘이 안 갈린다 ② 홀더는 자루를 여섯 갖는 물건이
  아니라 **심을 갈아 끼우는** 물건이라 연필통이라는 그림이 거짓이 된다 ③ 이 앱의 동작은
  «자루를 바꿔 든다»인데 홀더의 진실은 «심 교체»라 대응표 규칙 하나(아이콘이 실물이면
  동작도 실물)를 어긴다. ⚠ 저장소에 이력도 있다 — `#oldtools` 의 「4-e 홀더펜 슬라이더」가
  이미 한 번 지나가고 연필통으로 대체됐다.

### 접힌 연필 — 세로, 경도 각인 유지, 앞이 뾰족

경도 문자(`lead-text`)와 심 색(`lead`)은 **main.ts 가 지금 경도로 갱신한다**(옛
`btn-pencil-old` 의 배선 그대로). 아래는 2H · HB · 2B 예시이고 문자·심 색만 다르다.

**2H**
```svg
<svg viewBox="0 0 26 62"><path d="M8 3h10v40H8z" fill="#cfc7b6"/><path d="M8 3h3.4v40H8z" fill="#e0d9ca"/><path d="M14.6 3H18v40h-3.4z" fill="#bbb2a0"/><rect x="8" y="11" width="10" height="13" fill="#faf8f3"/><text x="13" y="21" text-anchor="middle" font-family="system-ui,sans-serif" font-size="8.5" fill="#3c3831">2H</text><path d="M8 43 L13 57 L18 43 Z" fill="#e6dfd0"/><path d="M11.75 53.5 L13 57 L14.25 53.5 Z" fill="#9c9c9c"/></svg>
```

**HB**
```svg
<svg viewBox="0 0 26 62"><path d="M8 3h10v40H8z" fill="#cfc7b6"/><path d="M8 3h3.4v40H8z" fill="#e0d9ca"/><path d="M14.6 3H18v40h-3.4z" fill="#bbb2a0"/><rect x="8" y="11" width="10" height="13" fill="#faf8f3"/><text x="13" y="21" text-anchor="middle" font-family="system-ui,sans-serif" font-size="8.5" fill="#3c3831">HB</text><path d="M8 43 L13 57 L18 43 Z" fill="#e6dfd0"/><path d="M11.75 53.5 L13 57 L14.25 53.5 Z" fill="#6a6a6a"/></svg>
```

**2B**
```svg
<svg viewBox="0 0 26 62"><path d="M8 3h10v40H8z" fill="#cfc7b6"/><path d="M8 3h3.4v40H8z" fill="#e0d9ca"/><path d="M14.6 3H18v40h-3.4z" fill="#bbb2a0"/><rect x="8" y="11" width="10" height="13" fill="#faf8f3"/><text x="13" y="21" text-anchor="middle" font-family="system-ui,sans-serif" font-size="8.5" fill="#3c3831">2B</text><path d="M8 43 L13 57 L18 43 Z" fill="#e6dfd0"/><path d="M11.75 53.5 L13 57 L14.25 53.5 Z" fill="#3f3f3f"/></svg>
```

### 접힌 펜 — 지금 것 그대로 (참고)

```svg
<svg viewBox="0 0 26 62"><path d="M8.6 3h8.8v32H8.6z" fill="#7f7a72"/><path d="M8.6 3h3v32h-3z" fill="#98938a"/><path d="M9.4 35h7.2v6H9.4z" fill="#5d5952"/><path d="M10.2 36.4h5.6M10.2 38.2h5.6" stroke="#837f78" stroke-width=".7"/><path d="M9.4 41h7.2l-3.6 8z" fill="#6e6a63"/><rect x="12.2" y="49" width="1.6" height="7" fill="#101014"/></svg>
```

### 펼친 연필통 줄 — 앞을 원뿔로 깎고 심이 노출된다

⚠ 종전 줄은 가운데를 잘라 **단면에 심 색**을 보였다. 깎은 끝은 그 단면이 **노출된 심**이
되므로 채널을 안 잃고 그림만 나아진다. 심 색의 출처는 `MAT` 하나다(#54).
⚠ **펜 줄은 연필통에서 빠진다** — 펜은 접힌 아이콘 하나다.

**2H**
```svg
<svg viewBox="0 0 64 16"><rect x="1" y="3.5" width="9" height="9" rx="2" fill="#d8cfc0"/><rect x="10" y="3.5" width="5" height="9" fill="#b8b3ab"/><rect x="15" y="3" width="36" height="10" fill="#cfc7b6"/><rect x="15" y="3" width="36" height="2.6" fill="#e0d9ca"/><text x="21" y="11.6" font-family="system-ui,sans-serif" font-size="7" fill="#3c3831">2H</text><path d="M51 3 L59.4 7.35 L59.4 8.65 L51 13 Z" fill="#e6dfd0"/><path d="M59.4 7.35 L63 8 L59.4 8.65 Z" fill="#9c9c9c"/></svg>
```

**H**
```svg
<svg viewBox="0 0 64 16"><rect x="1" y="3.5" width="9" height="9" rx="2" fill="#d8cfc0"/><rect x="10" y="3.5" width="5" height="9" fill="#b8b3ab"/><rect x="15" y="3" width="36" height="10" fill="#cfc7b6"/><rect x="15" y="3" width="36" height="2.6" fill="#e0d9ca"/><text x="21" y="11.6" font-family="system-ui,sans-serif" font-size="7" fill="#3c3831">H</text><path d="M51 3 L59.4 7.35 L59.4 8.65 L51 13 Z" fill="#e6dfd0"/><path d="M59.4 7.35 L63 8 L59.4 8.65 Z" fill="#8a8a8a"/></svg>
```

**F**
```svg
<svg viewBox="0 0 64 16"><rect x="1" y="3.5" width="9" height="9" rx="2" fill="#d8cfc0"/><rect x="10" y="3.5" width="5" height="9" fill="#b8b3ab"/><rect x="15" y="3" width="36" height="10" fill="#cfc7b6"/><rect x="15" y="3" width="36" height="2.6" fill="#e0d9ca"/><text x="21" y="11.6" font-family="system-ui,sans-serif" font-size="7" fill="#3c3831">F</text><path d="M51 3 L59.4 7.35 L59.4 8.65 L51 13 Z" fill="#e6dfd0"/><path d="M59.4 7.35 L63 8 L59.4 8.65 Z" fill="#7a7a7a"/></svg>
```

**HB**
```svg
<svg viewBox="0 0 64 16"><rect x="1" y="3.5" width="9" height="9" rx="2" fill="#d8cfc0"/><rect x="10" y="3.5" width="5" height="9" fill="#b8b3ab"/><rect x="15" y="3" width="36" height="10" fill="#cfc7b6"/><rect x="15" y="3" width="36" height="2.6" fill="#e0d9ca"/><text x="21" y="11.6" font-family="system-ui,sans-serif" font-size="7" fill="#3c3831">HB</text><path d="M51 3 L59.4 7.35 L59.4 8.65 L51 13 Z" fill="#e6dfd0"/><path d="M59.4 7.35 L63 8 L59.4 8.65 Z" fill="#6a6a6a"/></svg>
```

**B**
```svg
<svg viewBox="0 0 64 16"><rect x="1" y="3.5" width="9" height="9" rx="2" fill="#d8cfc0"/><rect x="10" y="3.5" width="5" height="9" fill="#b8b3ab"/><rect x="15" y="3" width="36" height="10" fill="#cfc7b6"/><rect x="15" y="3" width="36" height="2.6" fill="#e0d9ca"/><text x="21" y="11.6" font-family="system-ui,sans-serif" font-size="7" fill="#3c3831">B</text><path d="M51 3 L59.4 7.35 L59.4 8.65 L51 13 Z" fill="#e6dfd0"/><path d="M59.4 7.35 L63 8 L59.4 8.65 Z" fill="#565656"/></svg>
```

**2B**
```svg
<svg viewBox="0 0 64 16"><rect x="1" y="3.5" width="9" height="9" rx="2" fill="#d8cfc0"/><rect x="10" y="3.5" width="5" height="9" fill="#b8b3ab"/><rect x="15" y="3" width="36" height="10" fill="#cfc7b6"/><rect x="15" y="3" width="36" height="2.6" fill="#e0d9ca"/><text x="21" y="11.6" font-family="system-ui,sans-serif" font-size="7" fill="#3c3831">2B</text><path d="M51 3 L59.4 7.35 L59.4 8.65 L51 13 Z" fill="#e6dfd0"/><path d="M59.4 7.35 L63 8 L59.4 8.65 Z" fill="#3f3f3f"/></svg>
```

---

## 자작 원본 (정본)

### 삼각자 — 축 스냅
```svg
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 26 L26 26 L6 6 Z"/>
  <path d="M9.6 22.6 L16.8 22.6 L9.6 15.4 Z"/>
  <path d="M8.50 8.50 l-1.70 1.70 M11.00 11.00 l-1.06 1.06 M13.50 13.50 l-1.70 1.70 M16.00 16.00 l-1.06 1.06 M18.50 18.50 l-1.70 1.70 M21.00 21.00 l-1.06 1.06 M23.50 23.50 l-1.70 1.70" stroke-width="1.1"/>
</svg>
```

### 트레이싱지 롤 — 겹 랙
```svg
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="15" r="8.2"/><circle cx="13.5" cy="15" r="2.8"/><path d="M13.5 23.2 H27.5"/></svg>
```

### 옐로 트레이스 롤 — 겹 랙 (색 예외)
```svg
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path fill="#e9d98a" stroke="none" fill-rule="evenodd" d="M13.5 6.8 a8.2 8.2 0 1 1 0 16.4 a8.2 8.2 0 1 1 0 -16.4 Z M13.5 12.2 a2.8 2.8 0 1 0 0 5.6 a2.8 2.8 0 1 0 0 -5.6 Z"/><circle cx="13.5" cy="15" r="8.2"/><circle cx="13.5" cy="15" r="2.8"/><path d="M13.5 23.2 H27.5"/></svg>
```

### 삼각 스케일 — 축척
```svg
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M 16.00 6.50 L 19.26 12.15 A 3.0 3.0 0 0 0 22.26 17.35 L 25.53 23.00 L 19.00 23.00 A 3.0 3.0 0 0 0 13.00 23.00 L 6.47 23.00 L 9.74 17.35 A 3.0 3.0 0 0 0 12.74 12.15 L 16.00 6.50 Z"/></svg>
```

### T자 — 예비
```svg
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <path d="M7.5 4.5
           C 5.2 6.5 4.6 9 5.8 11.5 L5.8 20.5 C 4.6 23 5.2 25.5 7.5 27.5
           L9.8 27.5 L9.8 4.5 Z"/>
  <path d="M9.8 12.4 H28 V19.6 H9.8"/>
  <path d="M12 12.4 v3.4 M14 12.4 v2.1 M16 12.4 v3.4 M18 12.4 v2.1 M20 12.4 v3.4 M22 12.4 v2.1 M24 12.4 v3.4 M26 12.4 v2.1" stroke-width="1.1"/>
</svg>
```

### 톱니 — 설정 (2026-08-30 · web2-34 5번)

사람이 정했다: 「**라인드로잉으로 바꾸고 중앙에 원 추가해서 통상적인 톱니로.**」
종전 것은 Phosphor light `gear` 를 `fill="currentColor"` 로 **채운** 그림이었다 —
문법이 이 파일의 「그 외 전부」와 달랐다(선이 아니라 면). 그것을 버리고 여기서 다시 그린다.

- **설정은 제도용구가 아니다.** 실물 문법(재료색·단면)을 적용하지 않는다 —
  위 「규칙」의 선 문법 하나만 받는다:
  `fill:none · stroke:currentColor · stroke-width 1.6/32 · round cap/join · 닫힌 실루엣`.
- 실루엣은 **바깥 톱니 + 중앙 원** 둘뿐이다(통상적인 톱니). 톱니 여덟,
  중심 (16,16) · 끝 반지름 12.0 · 뿌리 8.8 · 중앙 원 4.2 · 톱니 끝 반각 9° ·
  옆면이 도는 각 5° · 뿌리 호 17°(= 45 − 9·2 − 5·2). 끝은 평평한 현이고
  뿌리는 호(`A 8.8`)라 «깎은 이»로 읽힌다.
- 바깥 끝은 12.0 + 선 반폭 0.8 = **12.8** 이라 32 뷰박스 안에 들어간다(28.8 < 32).

```svg
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.12 4.15 L17.88 4.15 L18.13 7.46 A8.8 8.8 0 0 1 20.53 8.46 L23.05 6.29 L25.71 8.95 L23.54 11.47 A8.8 8.8 0 0 1 24.54 13.87 L27.85 14.12 L27.85 17.88 L24.54 18.13 A8.8 8.8 0 0 1 23.54 20.53 L25.71 23.05 L23.05 25.71 L20.53 23.54 A8.8 8.8 0 0 1 18.13 24.54 L17.88 27.85 L14.12 27.85 L13.87 24.54 A8.8 8.8 0 0 1 11.47 23.54 L8.95 25.71 L6.29 23.05 L8.46 20.53 A8.8 8.8 0 0 1 7.46 18.13 L4.15 17.88 L4.15 14.12 L7.46 13.87 A8.8 8.8 0 0 1 8.46 11.47 L6.29 8.95 L8.95 6.29 L11.47 8.46 A8.8 8.8 0 0 1 13.87 7.46 Z"/><circle cx="16" cy="16" r="4.2"/></svg>
```

⚠ **크기 급은 `.ico-f`**(19px × `--ui-scale`)다 — 파일 서랍과 같은 급이고 안 바꾼다.
뷰박스가 256 → 32 로 바뀌므로 `width`/`height` 속성은 두지 않는다(CSS 가 높이를 준다).
