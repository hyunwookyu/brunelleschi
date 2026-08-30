# 아이콘 원본 — 선 문법 (확정 · 2026-08-27)

> 사람이 승인했다. 이 파일이 **정본**이다 — `index.html` 에 인라인으로 그대로 넣는다.
> path 를 임의로 고치지 않는다. 고쳐야 하면 여기를 먼저 고치고 그 값을 옮긴다.

## 규칙

- **직접 그리는 도구**(연필통 · 펜 · 지우개 둘 · 면) — 지금 `index.html` 의 실물 그림
  유지. ⚠ **연필만 예외다**(아래 「실물 도구 — 연필만 바뀐다」): 접힌 아이콘 하나 +
  누르면 펼쳐지는 연필통, 끝을 뾰족하게. 펜 · 지우개 둘 · 면은 **손대지 않는다.**
  ⚠ **각인(창 + 글자)을 얹는 것은 «다시 그리기»가 아니다** — 몸통 path를 한 글자도 안
  바꾸고 화면 규칙 R6(접힌 통은 지금 고른 것을 말한다)을 지키는 채널만 더한 것이다.
  펜(34-2)·지우개 둘(34-3)이 그렇게 얹혔다. 아래 두 절이 그 정본이다.
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

### 접힌 펜 — 촉 각인이 붙는다 (2026-08-30 · web2-34 2번 · 화면 규칙 R6)

⚠ **몸통·물림쇠·원뿔·촉 path는 한 글자도 안 바뀌었다.** 바뀐 것은 **연필과 같은 문법의
«각인 창 + 글자» 하나를 얹은 것**이다(다시 그린 것이 아니다 — 「펜·지우개 둘·면은 손대지
않는다」는 그대로 선다). 종전 판은 촉 굵기가 **니브 사각형의 폭**으로만 있었고
(0.77~3.00 사용자단위 = 렌더 1.16~4.50 px · 이웃 칸 차 0.45~1.29 px) 그 채널은 글자가
아니라 **화면에서 안 읽혔다** — R6 위반. 니브 사각형은 그대로 두고 채널을 **더한다**.

연필과 **같은 것**: 창의 세로 자리(`y=11 h=13`) · 글자의 기준선(`y=21`) ·
`text-anchor=middle` · `font-family` · **`font-size=8.5`** · `fill=#3c3831`.
연필과 **다른 것 둘**, 그리고 그 근거:

- **창 폭이 몸통 폭이다**(연필 10 → 펜 **8.8**). 연필의 창도 «몸통 폭 그대로»이므로
  규칙이 같고 수만 다르다(연필 몸통 `x 8..18`, 펜 몸통 `x 8.6..17.4`).
- **`textLength="8.8" lengthAdjust="spacingAndGlyphs"`** — 좁은 몸통에 맞춰 **가로로만**
  좁힌다. `font-size`를 줄이는 길(6.5까지 내려야 들어간다)은 **글자 높이를 27% 잃는다**
  (렌더 15.00 → 11.00 px). 각인은 **높이로 읽히므로** 높이를 지키고 폭을 좁혔다:
  실측 렌더 15.00 px로 연필 각인과 **같다**(비 1.000 · `C.FOLD_MARK_MIN_RATIO` 0.9).
- **표기는 mm이고 소수점 앞 0을 뗀다** — `.18 · .25 · .35 · .50 · .70`.
  펼친 촉통의 줄이 `0.18`처럼 적으므로 **같은 `toFixed(2)`의 앞 0만 떼는 것**이다
  (새 표를 안 만든다 — 출처는 `C.NIB_MM` 하나 · #54). 다섯이 전부 **세 글자**라 폭이
  한 값으로 고정되고, 그래서 `textLength` 하나가 다섯을 다 덮는다.

글자(`fold-nib-text`)는 **main.ts가 지금 촉으로 갱신한다** — 연필의 `fold-lead-text`와
같은 자리·같은 규약이다. 아래는 기본 촉 `.35` 예시이고 **글자만** 다르다.

```svg
<svg viewBox="0 0 26 62"><path d="M8.6 3h8.8v32H8.6z" fill="#7f7a72"/><path d="M8.6 3h3v32h-3z" fill="#98938a"/><rect x="8.6" y="11" width="8.8" height="13" fill="#faf8f3"/><text x="13" y="21" text-anchor="middle" font-family="system-ui,sans-serif" font-size="8.5" textLength="8.8" lengthAdjust="spacingAndGlyphs" fill="#3c3831">.35</text><path d="M9.4 35h7.2v6H9.4z" fill="#5d5952"/><path d="M10.2 36.4h5.6M10.2 38.2h5.6" stroke="#837f78" stroke-width=".7"/><path d="M9.4 41h7.2l-3.6 8z" fill="#6e6a63"/><rect x="12.2" y="49" width="1.6" height="7" fill="#101014"/></svg>
```

### 접힌 지우개 — 크기 각인이 붙는다 (2026-08-30 · web2-34 3번 · 화면 규칙 R6)

⚠ **지우개 몸통의 path 셋(윗면·앞면·옆면)은 한 글자도 안 바뀌었다.** 34-2가 접힌 펜에
얹은 것과 **같은 문법**의 «각인 창 + 글자» 하나를 더한 것이다(「펜·지우개 둘·면은 손대지
않는다」는 그대로 선다 — 각인을 얹는 것은 다시 그리는 것이 아니다).

연필·펜과 **같은 것**: `font-family` · **`font-size=8.5`** · `text-anchor=middle` ·
창 `fill=#faf8f3` · 글자 `fill=#3c3831`. 지우개만 다른 것 하나:

- **창과 글자가 기울어 있다.** 지우개는 윗면이 기운 덩어리라(윗면의 기울기가
  `dx/dy = −7/14 = −0.5`) 축에 나란한 창을 얹으면 면 밖으로 삐져나온다. 그래서 창과
  글자를 **`transform="skewX(-26.565)"` 한 무리**에 담는다(`tan 26.565° = 0.5`).
  그 무리 안에서 윗면은 **`x 16..23`의 사각형**이 되므로 창은 `x=16.2 y=8.5 w=6.6 h=11`,
  글자는 `x=19.5 y=17`이다. **`skewX`는 y를 안 건드리므로 글자 높이가 그대로**다 —
  실측 렌더 15.08 px로 연필 각인(15.00 px)과 같다(비 **1.006** · `C.FOLD_MARK_MIN_RATIO` 0.9).
- **두 글자짜리만 `textLength="6.6" lengthAdjust="spacingAndGlyphs"`로 좁힌다**(`13`·`28`).
  한 글자(`2`·`6`)에 걸면 **글자가 늘어나므로** 안 건다 — 34-2의 펜(다섯이 전부 세 글자라
  한 값으로 고정)과 갈리는 유일한 지점이다.
- **표기는 지름 mm의 반올림**(`2 · 6 · 13 · 28`). 정확한 값은 2.33 · 5.60 · 12.60 · 28.0 mm
  이고 자는 `C.NIB_PX_PER_MM` 하나다(#54 — 촉 표기가 쓰는 그 자).

글자(`fold-erase-pencil-text` · `fold-erase-ink-text`)는 **main.ts가 지금 크기로 갱신한다**.
**둘 다** 갱신한다 — 크기는 두 지우개가 나눠 쓰는 한 값이다. 아래는 기본 `6` 예시다.

```svg
<svg viewBox="0 0 26 32"><path d="M6 20 13 6h7l-7 14z" fill="#e4ddcd" stroke="#b3ab9a" stroke-width="1"/><path d="M6 20h7v6H6z" fill="#d5cdbb" stroke="#b3ab9a" stroke-width="1"/><path d="M13 20h7l-7 6z" fill="#c9c0ad" stroke="#b3ab9a" stroke-width="1"/><g transform="skewX(-26.565)"><rect x="16.2" y="8.5" width="6.6" height="11" fill="#faf8f3"/><text x="19.5" y="17" text-anchor="middle" font-family="system-ui,sans-serif" font-size="8.5" fill="#3c3831">6</text></g></svg>
```

(잉크 지우개는 앞면·옆면 색과 stroke만 다르다 — `#3a3833` · `#2b2925` · `#8b857a`.
각인 무리는 **글자 하나까지 같다**.)

### 지우개 크기통 줄 — 자국을 **1:1로** 그린다 (2026-08-30 · web2-34 3번 · R1)

옛 자리에는 세로 막대가 있었고 그 안의 동그라미는 막대 폭에 맞추려고 줄여 그려서
**실제 지우개의 27.5%(60 px)~112.5%(4 px)**였다 — 사람의 말(「동그라미가 허공에 떠 있기만
하니 이게 뭔지 모르겠다」)이 정확히 그 자리다. 새 줄은 **안 줄인다**.

- **줄의 svg에는 배수를 안 건다.** `width`/`height`를 viewBox와 같은 px로 박고 CSS의
  `--ui-scale`도 안 태운다(연필통 `.trow`·촉통 `.nrow`와 갈리는 유일한 지점).
  그래야 원의 렌더 지름이 **곧 지워질 넓이**다(실측 10 · 24 · 54 · 120 px = 2r 그대로).
- **그림은 캔버스의 지우개 커서와 같다** — 반경 그대로의 원 · `COL.construction`(#8a7f6a) ·
  선폭 1 · 채우지 않는다(#54: 같은 것은 같게 그린다).
- **도구 그림이 줄에 없다.** 연필통·촉통 줄은 자루마다 물건이 다르지만(등급·촉) 여기서는
  **네 줄이 같은 지우개**이고, 게다가 통 하나를 지우개 **둘**이 나눠 쓰므로 어느 쪽 그림을
  그려도 거짓이 된다. 줄이 말하는 것은 «자국의 크기» 하나다 — 지름 mm 글자 + 그 원.
- 칸: 왼쪽 34 px가 글자 자리(오른끝 정렬 · `font-size 11`), 그 오른쪽에 원이 온다.
  줄 높이는 `max(2r + 8, 30)`이고 폭은 `34 + 2·rmax + 8` = **168 px**(가장 큰 줄이
  지름 120 px이다). 통 전체는 **168 × 279 px**(원장 `sidebar_layout_web2.json:etray`).

```svg
<!-- 6 mm(반경 12 px) 줄 — main.ts가 C.ERASER_R_PX에서 짓는다 -->
<svg width="168" height="32" viewBox="0 0 168 32"><text x="28" y="20.0" text-anchor="end" font-family="system-ui, sans-serif" font-size="11" fill="#3c3831">6</text><circle cx="98" cy="16.0" r="12" fill="none" stroke="#8a7f6a" stroke-width="1"/></svg>
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
