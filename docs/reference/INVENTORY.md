# INVENTORY — 화면의 누를 것 전수 (web2-69 §1 · 원장 `stage0/out/inventory69_web2_dpr1.json` · 스크립트가 센다 — 손으로 세지 않는다)

> 자리·종류·라벨·툴팁·«보임»은 원장(DOM 실측 · «눌린다» = elementFromPoint #97)에서 그대로, «언제 쓰는가·판정·근거»는 사람 판정(judge69 — 지시 §2 규칙 넷 · DIRECTION 「시작은 종이다」 · UX-FLOWS §A-0/§C-0/§D-0/§E).
> 상태: 기본(새 문서 · 연필 · ?reset) · 도구:연필/펜/지우개/면/칠(그 도구를 들 때 «더» 나타나는 것) · 카드:파일/설정/보기/치수판(열 때 «더» 나타나는 것) · 개발(?dev=1 — 없으면 DOM에 없다).
> 탭 수: 상시 1 · 도구 통 2(도구 누름 + 누르기) · 카드 2(카드 열기 + 누르기) · 개발 2(?dev=1이면 설정 서랍 안에 펼쳐진 채 — 서랍 + 누르기). «지금»은 이 표를 만든 트리, «뒤»는 69 §3을 옮긴 뒤(같은 트리 — 표는 옮긴 뒤 원장으로 만들었다).
> ⚑ = 규칙 넷에 안 걸리는 것(상시로 둔다). 이 표는 사람이 나중에 줄을 그을 표다 — 판정 근거 열을 비우지 않았다.

## 셈(값)

| 상태 | 누를 것 | 자리별 |
|---|---|---|
| 기본 | **23** | paperbar 2 · layerbar 1 · eyebar 2 · pane-file 1 · pane-settings 1 · sidebar 16 |
| 도구:연필 | 29(+6) | tray-2H, tray-H, tray-F, tray-HB, tray-B, tray-2B |
| 도구:펜 | 28(+5) | nib-0_18, nib-0_25, nib-0_35, nib-0_5, nib-0_7 |
| 도구:연필 지우개 | 27(+4) | erase-5, erase-12, erase-27, erase-60 |
| 도구:펜 지우개 | 27(+4) | erase-5, erase-12, erase-27, erase-60 |
| 도구:면 | 23(+0) |  |
| 도구:칠 | 46(+23) | paint-brush-btn, paint-size-range, paint-opacity-range, paint-color-btn, paint-recent-1, paint-recent-2 … |
| 카드:pane-file | 29(+6) | doc-name, btn-save, btn-open, btn-obj, btn-gltf, btn-clear |
| 카드:pane-settings | 38(+15) | chk-press, chk-grain, btn-brush, chk-horizon, chk-grid, chk-waitfade, chk-hidden, chk-hatchface … |
| 카드:display-pop | 27(+4) | btn-floor-area, chk-rooms, btn-person, btn-stencil |
| 카드:dimpanel | 41(+18) | button, button, button, button, button, button, button, button … |
| 개발(?dev=1) | 23(+0) | devmenu btn-diag, btn-tunelab, chk-own3d · 없이는 DOM에 없음(0) |

## 표

| 상태 | id | 자리 | 종류 | 글자 라벨 | 툴팁 | 언제 쓰는가 | 지금 탭 수 | 판정 | 근거 | 뒤 탭 수 | 옮긴 자리 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 기본 | .ptab | 위 왼쪽(종이 띠) | button | 예 | 예 | 문서마다 한 번 | 1 | R-A | 종이 띠의 탭(종이 고르기) — 제도판의 것 | 1 | — |
| 기본 | paper-add | 위 왼쪽(종이 띠) | button | 그림 | 예 | 문서마다 한 번 | 1 | R-A | 종이 띠 | 1 | — |
| 기본 | layer-add | 위 왼쪽(겹 띠) | button | 그림 | 예 | 가끔 확인 | 1 | R-A | 겹 띠 | 1 | — |
| 기본 | btn-fullscreen | 위 오른쪽(눈 띠) | button | 그림 | 예 | 가끔 확인 | 1 | R-A | Feather 「그림만 남긴다」 — 한 탭(§A-0 알약의 것) | 1 | — |
| 기본 | btn-display | 위 오른쪽(눈 띠) | button | 그림 | 예 | 가끔 확인 | 1 | R-A | 보기 카드의 손잡이 — R-C 카드를 여는 단추 자체는 상시 | 1 | — |
| 기본 | .t | 위 오른쪽(파일 서랍) | summary | 그림 | 예 | 문서마다 한 번 | 1 | R-A | 파일 서랍 손잡이 | 1 | — |
| 기본 | .t | 위 오른쪽(설정 서랍) | summary | 그림 | 예 | 문서마다 한 번 | 1 | R-A | 설정 서랍 손잡이 | 1 | — |
| 기본 | sidebar-toggle | 오른쪽(세로바) | button | 그림 | 예 | 가끔 확인 | 1 | R-A | 세로바 접기 — Feather ◂ 탭(§A-0) | 1 | — |
| 기본 | btn-draw-view | 오른쪽(세로바) | button | 그림 | 예 | 획마다 | 1 | R-A | §2 R-A 시점 맞춤 | 1 | — |
| 기본 | btn-zoom-fit | 오른쪽(세로바) | button | 그림 | 예 | 가끔 확인 | 1 | R-A | 시점 맞춤(돋보기) | 1 | — |
| 기본 | btn-lens | 오른쪽(세로바) | button | 그림 | 예 | 가끔 확인 | 1 | R-C | §2 R-C 렌즈 — 카드(lens-pop)로 부르면 얹힘 · 손잡이 단추는 상시(카드 열기 1) | 2 | — |
| 기본 | btn-undo | 오른쪽(세로바) | button | 그림 | 예 | 획마다 | 1 | R-A | §2 R-A 되돌리기 · §E 합의 ④ | 1 | — |
| 기본 | btn-redo | 오른쪽(세로바) | button | 그림 | 예 | 획마다 | 1 | R-A | §2 R-A 다시하기 · §E 합의 ④ | 1 | — |
| 기본 | btn-snap | 오른쪽(세로바) | button | 그림 | 예 | 획마다 | 1 | R-A | §2 R-A 축 스냅(오스냅 카드의 손잡이) | 1 | — |
| 기본 | btn-grip | 오른쪽(세로바) | button | 그림 | 예 | 획마다 | 1 | R-A | 손 — 잡은 것을 다룬다(도구) | 1 | — |
| 기본 | btn-pencil | 오른쪽(세로바) | button | 예 | 예 | 획마다 | 1 | R-A | §2 R-A 도구 | 1 | — |
| 기본 | btn-pen | 오른쪽(세로바) | button | 예 | 예 | 획마다 | 1 | R-A | §2 R-A 도구 | 1 | — |
| 기본 | btn-eraser-pencil | 오른쪽(세로바) | button | 예 | 예 | 획마다 | 1 | R-A | §2 R-A 도구 | 1 | — |
| 기본 | btn-eraser-ink | 오른쪽(세로바) | button | 예 | 예 | 획마다 | 1 | R-A | §2 R-A 도구 | 1 | — |
| 기본 | dim-toggle | 오른쪽(세로바) | button | 그림 | 예 | 가끔 확인 | 1 | R-A | 치수판 카드의 손잡이 — 제도판의 것(DIRECTION 「제도판 냄새는 괜찮다」 · 치수) | 1 | — |
| 기본 | btn-roll | 오른쪽(세로바) | button | 그림 | 예 | 문서마다 한 번 | 1 | R-A | 종이 얹기(트레이싱지·옐로) — 종이/겹 배치 유지 ㉠ | 1 | — |
| 기본 | btn-face | 오른쪽(세로바) | button | 그림 | 예 | 획마다 | 1 | R-A | §2 R-A 도구 | 1 | — |
| 기본 | btn-paint | 오른쪽(세로바) | button | 그림 | 예 | 획마다 | 1 | R-A | §2 R-A 도구 | 1 | — |
| 도구:연필 | tray-2H | 떠 있음(연필통) | button | 그림 | 없음 | 획마다 | 2 | R-A | 연필통(도구를 다시 누르면 여닫는 통 · R7) | 2 | — |
| 도구:연필 | tray-H | 떠 있음(연필통) | button | 그림 | 없음 | 획마다 | 2 | R-A | 연필통(도구를 다시 누르면 여닫는 통 · R7) | 2 | — |
| 도구:연필 | tray-F | 떠 있음(연필통) | button | 그림 | 없음 | 획마다 | 2 | R-A | 연필통(도구를 다시 누르면 여닫는 통 · R7) | 2 | — |
| 도구:연필 | tray-HB | 떠 있음(연필통) | button | 그림 | 없음 | 획마다 | 2 | R-A | 연필통(도구를 다시 누르면 여닫는 통 · R7) | 2 | — |
| 도구:연필 | tray-B | 떠 있음(연필통) | button | 그림 | 없음 | 획마다 | 2 | R-A | 연필통(도구를 다시 누르면 여닫는 통 · R7) | 2 | — |
| 도구:연필 | tray-2B | 떠 있음(연필통) | button | 그림 | 없음 | 획마다 | 2 | R-A | 연필통(도구를 다시 누르면 여닫는 통 · R7) | 2 | — |
| 도구:펜 | nib-0_18 | 떠 있음(촉통) | button | 그림 | 없음 | 획마다 | 2 | R-A | 촉통 | 2 | — |
| 도구:펜 | nib-0_25 | 떠 있음(촉통) | button | 그림 | 없음 | 획마다 | 2 | R-A | 촉통 | 2 | — |
| 도구:펜 | nib-0_35 | 떠 있음(촉통) | button | 그림 | 없음 | 획마다 | 2 | R-A | 촉통 | 2 | — |
| 도구:펜 | nib-0_5 | 떠 있음(촉통) | button | 그림 | 없음 | 획마다 | 2 | R-A | 촉통 | 2 | — |
| 도구:펜 | nib-0_7 | 떠 있음(촉통) | button | 그림 | 없음 | 획마다 | 2 | R-A | 촉통 | 2 | — |
| 도구:연필 지우개 | erase-5 | 떠 있음(크기통) | button | 그림 | 없음 | 획마다 | 2 | R-A | 크기통 | 2 | — |
| 도구:연필 지우개 | erase-12 | 떠 있음(크기통) | button | 그림 | 없음 | 획마다 | 2 | R-A | 크기통 | 2 | — |
| 도구:연필 지우개 | erase-27 | 떠 있음(크기통) | button | 그림 | 없음 | 획마다 | 2 | R-A | 크기통 | 2 | — |
| 도구:연필 지우개 | erase-60 | 떠 있음(크기통) | button | 그림 | 없음 | 획마다 | 2 | R-A | 크기통 | 2 | — |
| 도구:칠 | paint-brush-btn | 왼쪽(칠 패널) | button | 그림 | 없음 | 획마다 | 2 | R-A | §2 R-A 지금 브러시 · 필통 머리 | 2 | — |
| 도구:칠 | paint-size-range | 왼쪽(칠 패널) | button | 그림 | 없음 | 획마다 | 2 | R-A | §2 R-A 크기 | 2 | — |
| 도구:칠 | paint-opacity-range | 왼쪽(칠 패널) | button | 그림 | 없음 | 획마다 | 2 | R-A | §2 R-A 불투명 | 2 | — |
| 도구:칠 | paint-color-btn | 왼쪽(칠 패널) | button | 그림 | 없음 | 획마다 | 2 | R-A | §2 R-A 지금 색 | 2 | — |
| 도구:칠 | paint-recent-1 | 왼쪽(칠 패널) | button | 그림 | 없음 | 획마다 | 2 | R-A | 최근 색(§E 합의 — 견본 한 줄) | 2 | — |
| 도구:칠 | paint-recent-2 | 왼쪽(칠 패널) | button | 그림 | 없음 | 획마다 | 2 | R-A | 최근 색(§E 합의 — 견본 한 줄) | 2 | — |
| 도구:칠 | paint-recent-3 | 왼쪽(칠 패널) | button | 그림 | 없음 | 획마다 | 2 | R-A | 최근 색(§E 합의 — 견본 한 줄) | 2 | — |
| 도구:칠 | paint-recent-4 | 왼쪽(칠 패널) | button | 그림 | 없음 | 획마다 | 2 | R-A | 최근 색(§E 합의 — 견본 한 줄) | 2 | — |
| 도구:칠 | paint-recent-5 | 왼쪽(칠 패널) | button | 그림 | 없음 | 획마다 | 2 | R-A | 최근 색(§E 합의 — 견본 한 줄) | 2 | — |
| 도구:칠 | paint-recent-6 | 왼쪽(칠 패널) | button | 그림 | 없음 | 획마다 | 2 | R-A | 최근 색(§E 합의 — 견본 한 줄) | 2 | — |
| 도구:칠 | paint-fav-1 | 왼쪽(칠 패널) | button | 그림 | 없음 | 획마다 | 2 | R-A | §2 R-A 필통 칸 | 2 | — |
| 도구:칠 | .pcgrade | 왼쪽(칠 패널) | pcgrade | 그림 | 없음 | 획마다 | 2 | R-A | 필통 칸의 경도 글자(68 §2) | 2 | — |
| 도구:칠 | paint-fav-2 | 왼쪽(칠 패널) | button | 그림 | 없음 | 획마다 | 2 | R-A | §2 R-A 필통 칸 | 2 | — |
| 도구:칠 | .pcgrade | 왼쪽(칠 패널) | pcgrade | 그림 | 없음 | 획마다 | 2 | R-A | 필통 칸의 경도 글자(68 §2) | 2 | — |
| 도구:칠 | paint-fav-3 | 왼쪽(칠 패널) | button | 그림 | 없음 | 획마다 | 2 | R-A | §2 R-A 필통 칸 | 2 | — |
| 도구:칠 | .pcgrade | 왼쪽(칠 패널) | pcgrade | 그림 | 없음 | 획마다 | 2 | R-A | 필통 칸의 경도 글자(68 §2) | 2 | — |
| 도구:칠 | paint-fav-4 | 왼쪽(칠 패널) | button | 그림 | 없음 | 획마다 | 2 | R-A | §2 R-A 필통 칸 | 2 | — |
| 도구:칠 | paint-fav-5 | 왼쪽(칠 패널) | button | 그림 | 없음 | 획마다 | 2 | R-A | §2 R-A 필통 칸 | 2 | — |
| 도구:칠 | paint-fav-6 | 왼쪽(칠 패널) | button | 그림 | 없음 | 획마다 | 2 | R-A | §2 R-A 필통 칸 | 2 | — |
| 도구:칠 | paint-fav-7 | 왼쪽(칠 패널) | button | 그림 | 없음 | 획마다 | 2 | R-A | §2 R-A 필통 칸 | 2 | — |
| 도구:칠 | paint-erase | 왼쪽(칠 패널) | button | 그림 | 없음 | 획마다 | 2 | R-A | §2 R-A 필통(지우개 칸) | 2 | — |
| 도구:칠 | paint-erase-soft | 왼쪽(칠 패널) | button | 그림 | 없음 | 획마다 | 2 | R-A | 필통 칸의 경도 글자 | 2 | — |
| 도구:칠 | btn-paint-front | 왼쪽(칠 패널) | button | 그림 | 없음 | 획마다 | 2 | R-A | 정면 왕복(54-3) — 칠의 시점 맞춤 | 2 | — |
| 카드:pane-file | doc-name | 위 오른쪽(파일 서랍) | button | 없음 | 없음 | 문서마다 한 번 | 2 | R-C | §2 R-C 저장/열기 — 카드 안 | 2 | pane-file |
| 카드:pane-file | btn-save | 위 오른쪽(파일 서랍) | button | 없음 | 없음 | 문서마다 한 번 | 2 | R-C | §2 R-C 저장/열기 | 2 | pane-file |
| 카드:pane-file | btn-open | 위 오른쪽(파일 서랍) | button | 없음 | 없음 | 문서마다 한 번 | 2 | R-C | §2 R-C 저장/열기 | 2 | pane-file |
| 카드:pane-file | btn-obj | 위 오른쪽(파일 서랍) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | §2 R-C 내보내기 | 2 | pane-file |
| 카드:pane-file | btn-gltf | 위 오른쪽(파일 서랍) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | §2 R-C 내보내기 | 2 | pane-file |
| 카드:pane-file | btn-clear | 위 오른쪽(파일 서랍) | button | 없음 | 없음 | 문서마다 한 번 | 2 | R-C | 전부 지우기 — 파일 카드 | 2 | pane-file |
| 카드:pane-settings | chk-press | 위 오른쪽(설정 서랍) | button | 없음 | 없음 | 문서마다 한 번 | 2 | R-B | 필압 보정 = 설정 | 2 | pane-settings |
| 카드:pane-settings | chk-grain | 위 오른쪽(설정 서랍) | button | 없음 | 없음 | 문서마다 한 번 | 2 | R-B | 종이 결 = 종이 종류 | 2 | pane-settings |
| 카드:pane-settings | btn-brush | 위 오른쪽(설정 서랍) | button | 없음 | 없음 | 문서마다 한 번 | 2 | R-B | 종이 질감 켬/끔 = 종이 종류(§2 R-B) — 파일 서랍에서 설정 카드로 | 2 | pane-settings |
| 카드:pane-settings | chk-horizon | 위 오른쪽(설정 서랍) | button | 없음 | 없음 | 문서마다 한 번 | 2 | R-B | §2 R-B 표시 토글(지평선) | 2 | pane-settings |
| 카드:pane-settings | chk-grid | 위 오른쪽(설정 서랍) | button | 없음 | 없음 | 문서마다 한 번 | 2 | R-B | §2 R-B 표시 토글(격자) — 새 문서 기본 꺼짐(DIRECTION 「격자와 축만 기본 꺼짐」) · 71이 세 손가락 두 번으로 켠다 | 2 | pane-settings |
| 카드:pane-settings | chk-waitfade | 위 오른쪽(설정 서랍) | button | 없음 | 없음 | 문서마다 한 번 | 2 | R-B | §2 R-B 표시 토글(안개) | 2 | pane-settings |
| 카드:pane-settings | chk-hidden | 위 오른쪽(설정 서랍) | button | 없음 | 없음 | 문서마다 한 번 | 2 | R-B | §2 R-B 표시 토글(숨은선) | 2 | pane-settings |
| 카드:pane-settings | chk-hatchface | 위 오른쪽(설정 서랍) | button | 없음 | 없음 | 문서마다 한 번 | 2 | R-B | §2 R-B 표시 토글(해칭) | 2 | pane-settings |
| 카드:pane-settings | rng-hold | 위 오른쪽(설정 서랍) | button | 없음 | 없음 | 문서마다 한 번 | 2 | R-B | §2 R-B 홀드 시간 | 2 | pane-settings |
| 카드:pane-settings | rng-whold | 위 오른쪽(설정 서랍) | button | 없음 | 없음 | 문서마다 한 번 | 2 | R-B | §2 R-B 홀드 시간 | 2 | pane-settings |
| 카드:pane-settings | dim-unit | 위 오른쪽(설정 서랍) | button | 없음 | 없음 | 문서마다 한 번 | 2 | R-B | §2 R-B 축척·단위 | 2 | pane-settings |
| 카드:pane-settings | chk-dimsnap | 위 오른쪽(설정 서랍) | button | 없음 | 없음 | 문서마다 한 번 | 2 | R-B | 치수 스냅 = 설정 | 2 | pane-settings |
| 카드:pane-settings | dimsnap-step | 위 오른쪽(설정 서랍) | button | 없음 | 없음 | 문서마다 한 번 | 2 | R-B | 치수 스냅 단 = 설정 | 2 | pane-settings |
| 카드:pane-settings | chk-exact | 위 오른쪽(설정 서랍) | button | 없음 | 없음 | 문서마다 한 번 | 2 | R-B | 정확 입력 = 설정 | 2 | pane-settings |
| 카드:pane-settings | chk-measure-keep | 위 오른쪽(설정 서랍) | button | 없음 | 없음 | 문서마다 한 번 | 2 | R-B | 재기 유지 = 설정 | 2 | pane-settings |
| 카드:display-pop | btn-floor-area | 위 오른쪽(보기 카드) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | §2 R-C 바닥면적 | 2 | display-pop |
| 카드:display-pop | chk-rooms | 위 오른쪽(보기 카드) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | §2 R-C 실 다이어그램 | 2 | display-pop |
| 카드:display-pop | btn-person | 위 오른쪽(보기 카드) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | §2 R-C 사람 놓기 | 2 | display-pop |
| 카드:display-pop | btn-stencil | 위 오른쪽(보기 카드) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | 사람 스텐실 그리기 — 사람 놓기의 짝(R-C) | 2 | display-pop |
| 카드:dimpanel | button | 오른쪽(치수판 카드) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | 치수판 숫자판(손글씨 대신 누르는 숫자 — 치수판 안) | 2 | dimpanel |
| 카드:dimpanel | button | 오른쪽(치수판 카드) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | 치수판 숫자판(손글씨 대신 누르는 숫자 — 치수판 안) | 2 | dimpanel |
| 카드:dimpanel | button | 오른쪽(치수판 카드) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | 치수판 숫자판(손글씨 대신 누르는 숫자 — 치수판 안) | 2 | dimpanel |
| 카드:dimpanel | button | 오른쪽(치수판 카드) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | 치수판 숫자판(손글씨 대신 누르는 숫자 — 치수판 안) | 2 | dimpanel |
| 카드:dimpanel | button | 오른쪽(치수판 카드) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | 치수판 숫자판(손글씨 대신 누르는 숫자 — 치수판 안) | 2 | dimpanel |
| 카드:dimpanel | button | 오른쪽(치수판 카드) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | 치수판 숫자판(손글씨 대신 누르는 숫자 — 치수판 안) | 2 | dimpanel |
| 카드:dimpanel | button | 오른쪽(치수판 카드) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | 치수판 숫자판(손글씨 대신 누르는 숫자 — 치수판 안) | 2 | dimpanel |
| 카드:dimpanel | button | 오른쪽(치수판 카드) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | 치수판 숫자판(손글씨 대신 누르는 숫자 — 치수판 안) | 2 | dimpanel |
| 카드:dimpanel | button | 오른쪽(치수판 카드) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | 치수판 숫자판(손글씨 대신 누르는 숫자 — 치수판 안) | 2 | dimpanel |
| 카드:dimpanel | button | 오른쪽(치수판 카드) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | 치수판 숫자판(손글씨 대신 누르는 숫자 — 치수판 안) | 2 | dimpanel |
| 카드:dimpanel | button | 오른쪽(치수판 카드) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | 치수판 숫자판(손글씨 대신 누르는 숫자 — 치수판 안) | 2 | dimpanel |
| 카드:dimpanel | button | 오른쪽(치수판 카드) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | 치수판 숫자판(손글씨 대신 누르는 숫자 — 치수판 안) | 2 | dimpanel |
| 카드:dimpanel | button | 오른쪽(치수판 카드) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | 치수판 숫자판(손글씨 대신 누르는 숫자 — 치수판 안) | 2 | dimpanel |
| 카드:dimpanel | button | 오른쪽(치수판 카드) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | 치수판 숫자판(손글씨 대신 누르는 숫자 — 치수판 안) | 2 | dimpanel |
| 카드:dimpanel | btn-dim-write | 오른쪽(치수판 카드) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | §2 R-C 치수판 | 2 | dimpanel |
| 카드:dimpanel | btn-measure | 오른쪽(치수판 카드) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | §2 R-C 치수판(재기) | 2 | dimpanel |
| 카드:dimpanel | dim-clear | 오른쪽(치수판 카드) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | 치수판 | 2 | dimpanel |
| 카드:dimpanel | btn-voice | 오른쪽(치수판 카드) | button | 없음 | 없음 | 가끔 확인 | 2 | R-C | 치수판(음성) | 2 | dimpanel |
| 개발(?dev=1) | btn-diag | 설정 서랍 안(개발 · ?dev=1) | button | 없음 | 없음 | 개발 | 2 | R-D | §2 R-D diag | 2 | devmenu |
| 개발(?dev=1) | btn-tunelab | 설정 서랍 안(개발 · ?dev=1) | button | 없음 | 없음 | 개발 | 2 | R-D | §2 R-D tunelab | 2 | devmenu |
| 개발(?dev=1) | chk-own3d | 설정 서랍 안(개발 · ?dev=1) | checkbox | 없음 | 없음 | 개발 | 2 | R-D | §2 R-D chk-own3d(자립 깃발) | 2 | devmenu |

## 판정 셈

| 판정 | 행 |
|---|---|
| R-A | 60 |
| R-B | 15 |
| R-C | 29 |
| R-D | 3 |

⚑ 행 0: 없음

## 목표(§2) — 기본 ≤ 20 · 칠 도구 든 상태 ≤ 32

- 기본 23 → 목표 20 **미달(넘긴다 — 억지로 접지 않는다 ⚑)** — 넘는 것: 세로바 16(도구 여덟 + 시점 셋 + 되돌리기 둘 + 자·손·치수 셋)은 전부 R-A(획마다)이고 종이·겹 띠 3 + 눈 띠 2 + 서랍 손잡이 2도 상시 손잡이라 접을 것이 없다
- 칠 도구 46 → 목표 32 **미달** — 칠 패널 +23(필통 8 · 경도 3 · 최근 색 6 · 머리·크기·불투명·색·정면 5 · 지우개 경도 1)은 전부 R-A(68 — 획마다 쓰는 것)
