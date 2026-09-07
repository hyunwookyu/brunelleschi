// 파일 패널의 문서 갈래(web2-43 2·3·4번) — **자동저장 · 이름 · 최근 드로잉**.
//
// 사람이 본 것(지시문 배경): 「열기가 불편하다. 보통 프로그램의 파일 탭에는 최근 문서
// 등이 쭉 뜨는데 그런 게 없다. 저장 시 최종 화면을 썸네일로 사용하는 최근 드로잉 탭이
// 있으면 좋겠다.」 §0이 그 밑을 재고 나서 보인 것: **화면의 결함이 아니라 자료의 결함**이다 —
// 문서를 구분할 열쇠가 아무 데도 없었고(칸이 하나였다) 그래서 「열기」가 곧 「덮기」였다.
//
// 여기 사는 것 넷:
//   ① **커밋마다 저장한다**(주기가 아니라 사건 — `app.docVersion` 변화). 지연 병합만 상수.
//   ② **이름** — 기본은 만든 날짜·시각. 이름은 식별자가 아니다(`DocMeta.id`가 열쇠).
//   ③ **최근 목록** — 썸네일·이름·마지막 수정, 최신순. 누르면 **현재 문서를 저장한 뒤** 연다.
//   ④ **이전** — localStorage에 있던 한 칸을 저장소로 옮긴다(복사 → 검증 → 삭제).
//
// ⚠ **새 패널을 안 만든다**(지시 「하지 말 것」 · R5) — 파일 서랍 `#pane-file` 안이다.

import { ICON_X } from '../ui/icons'
import type { App } from './state'
import type { BrnlData } from '../core/file'
import { C } from '../core/constants'
// web2-74 §1 — 구간 표식(계측만 · core/perfmark.ts 머리주석이 정본)
import { mark as perfMark, markAwait } from '../core/perfmark'
import {
  listDocs, getDoc, putDoc, putThumb, allThumbs, deleteDoc, renameDoc,
  migrateFromLocal, newDocId, defaultDocName, type DocMeta,
} from '../core/store'

export interface FileDeps {
  app: App
  /** 지금 문서의 저장물 — `serializeBrnl` 한 자리를 그대로 부른다(#54) */
  serialize: () => string
  /** 지금 화면의 썸네일 — **UI 없이 도면만**(`captureThumb` 재사용 · 지시 4번 문면) */
  thumb: () => string
  notify: (msg: string) => void
  /** 문서를 화면에 앉힌다(loadDoc + 시점 맞춤 + 띠 갱신) — main.ts의 `applyOpen` */
  applyDoc: (data: BrnlData) => void
  /** 버튼 곁 확인(web2-12 4번) */
  confirmNear: (anchor: HTMLElement, msg: string, opt: { label: string; onPick: () => void }) => void
  now: () => number
}

export interface FilePanel {
  /** 문서가 바뀌었다 — 저장을 예약한다(지연 병합). main.ts의 리스너가 부른다. */
  schedule: () => void
  /** 지금 즉시 저장한다(예약을 앞당긴다) — **다른 문서를 열기 전에** 부른다 */
  flush: () => Promise<void>
  /** 부팅 — 이전(migration) 뒤 가장 최근 문서를 연다 */
  boot: () => Promise<void>
  /** 목록을 다시 그린다 */
  sync: () => void
  /** 지금 문서의 정체 */
  current: () => DocMeta
  /** 지금 문서를 굳히고 새 문서로 간다(비우기가 부른다) — 열쇠가 바뀐다 */
  detach: () => void
  /** 마지막 저장의 실측(진단 패널·팔) */
  last: () => { bytes: number; pct: number } | null
  /** 진단·팔용 — 저장소에 실제로 든 것 */
  dump: () => Promise<{ current: string; docs: DocMeta[]; data: string | null; thumb: string | null }>
  /** 파일에서 연 문서를 **새 문서로** 앉힌다(이름은 파일 이름) */
  adoptOpened: (name: string) => void
  /** 한 문서 눈금 손잡이(e2e) */
  limitForTest: (n: number | null) => void
  /** §3-3 반증 스위치 — 켜면 «저장마다 썸네일»(수리 전 거동) */
  setLegacyThumbForTest: (v: boolean) => void
  /** §3-3 — 예약을 기다리지 않고 지금 굽는다(팔) */
  bakeThumbForTest: () => Promise<void>
  thumbStateForTest: () => { dirty: boolean; lastAt: number; pending: boolean; legacy: boolean; gapMs: number }
}

/** 마지막 수정을 짧게 — R4(이름이거나 짧은 동사구). 오늘 것은 시각만, 옛것은 날짜. */
export function whenText(now: number, t: number): string {
  const d = Math.max(0, now - t)
  if (d < 60_000) return '방금'
  if (d < 3600_000) return `${Math.floor(d / 60_000)}분 전`
  const a = new Date(t), b = new Date(now)
  const p = (n: number) => String(n).padStart(2, '0')
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate())
    return `${p(a.getHours())}:${p(a.getMinutes())}`
  return `${p(a.getMonth() + 1)}-${p(a.getDate())}`
}

/** **지금 보고 있던 문서**의 열쇠 — 기기 설정이다(문서의 값이 아니다) 그래서 localStorage다.
 *  ⚠ 왜 필요한가: 이것이 없으면 부팅이 늘 «가장 최근에 바뀐 문서»를 연다. 그러면
 *  「새로 시작」을 누르고 새로고침했을 때 **방금 떠난 그림이 도로 열리고**(팔이 그것을
 *  잡았다 — 획 9개가 돌아왔다), 옛 문서를 열어 두고 새로고침해도 최신 것이 열린다.
 *  값은 열쇠 하나(수십 바이트)라 §0의 상한 논거와 무관하다. */
/** ── web2-74 §2 — **반증 손잡이 둘**(개발용 URL 매개 · `?dev=1` 밖 · 69 전수 표에 두 행).
 *
 *  가설: 획이 끝날 때마다 400ms 뒤 `saveNow()`가 ① 문서 전량을 `JSON.stringify` ② IndexedDB에 쓰고
 *  ③ `toDataURL`로 썸네일을 굽고 ④ 또 쓴다 — 넷 다 메인 스레드 동기다. 그래서 「긋는 동안은
 *  100fps, 손을 뗀 뒤 멎는다」. **끄고 같은 짓을 해서 멈춤이 사라지는지 본다.**
 *
 *  ⚠ `?nosave=1`은 **문서를 메모리에만** 둔다 — 실수로 그림을 잃지 않게 화면 구석에 「저장 꺼짐」을
 *    띄운다(표시다 · 눌리지 않는다). 두 손잡이 다 **기본은 꺼져 있고** 깃발이 없으면 DOM에도 없다. */
const NOSAVE = new URLSearchParams(location.search).has('nosave')
const NOTHUMB = new URLSearchParams(location.search).has('nothumb')
export const saveFlagsForTest = (): { nosave: boolean; nothumb: boolean } => ({ nosave: NOSAVE, nothumb: NOTHUMB })

const PTR_KEY = 'b2-doc'
const readPtr = (): string | null => { try { return localStorage.getItem(PTR_KEY) } catch { return null } }
const writePtr = (id: string): void => { try { localStorage.setItem(PTR_KEY, id) } catch { /* 세션 한정 */ } }

/** web2-72 §0·§5 — **열 때의 몫**(D-1 표식). 진단 판과 팔이 같은 값을 읽는다(#54).
 *  parseMs = .brnl 파싱 · applyMs = 문서 앉히기(loadDoc → recompute: 리프팅·면 풀기).
 *  칠 굽기는 여기 안 든다 — 그것은 그 뒤 프레임들의 몫이고 `paintBake().ms`가 든다. */
export const bootCost = { bootAt: 0, parseMs: 0, applyMs: 0, bytes: 0, strokes: 0 }

export function initFilePanel(deps: FileDeps): FilePanel {
  const { app, serialize, thumb, notify, applyDoc, confirmNear, now } = deps
  const nameInput = document.getElementById('doc-name') as HTMLInputElement
  const listBox = document.getElementById('recent')!

  // ⚠ **표를 먼저 읽는다** — 아래에서 새 문서를 만들며 표를 덮으면 `boot`이 «방금 만든
  //   빈 문서»를 가리키는 표를 읽게 되고, 저장돼 있던 그림이 영영 안 열린다(팔이 잡았다).
  // §2 — 「저장 꺼짐」 표식. **실수로 남지 않게** 화면 구석에 늘 떠 있다(pointer-events:none ·
  //   깃발이 없으면 DOM에 없다 — 69 전수 표의 그 규약 그대로).
  if (NOSAVE) {
    const off = document.createElement('div')
    off.id = 'nosave-flag'
    off.setAttribute('aria-hidden', 'true')
    off.textContent = '저장 꺼짐'
    off.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:9999;pointer-events:none;'
      + 'font:700 16px/1.2 system-ui,sans-serif;color:var(--ink);background:var(--panel);'
      + 'border:1px solid var(--line);padding:6px 10px;border-radius:8px'
    document.body.appendChild(off)
  }

  const bootPtr = readPtr()
  let cur: DocMeta = { id: newDocId(now()), name: defaultDocName(now()), created: now(), updated: now(), bytes: 0 }
  let timer: number | undefined
  let savedVersion = app.docVersion
  let last: { bytes: number; pct: number } | null = null
  let failed = false            // 직전 저장이 실패했다 — 성공하면 풀린다(알림은 전이에서)
  let warned = false
  let limitOverride: number | null = null
  const limit = () => limitOverride ?? C.AUTOSAVE_LIMIT_BYTES
  /** 지금 도는 저장 — `flush`가 이것을 기다린다(#95: 기다리는 쪽과 일하는 쪽을 잇는다) */
  let inflight: Promise<void> = Promise.resolve()
  // ── web2-74 §3-3 — 썸네일의 «때» ────────────────────────────────────────────
  let thumbDirty = false          // 저장은 됐는데 그림이 그 뒤로 안 구워졌다
  // 마지막으로 구운 시각. ⚠ **0으로 두면 안 된다**: `now()`가 Date.now()라 `now() - 0`이 늘
  //   간격을 넘어서 «첫 저장에서 바로 굽는» 꼴이 된다(첫 판이 그랬다 — 몸짓 열 붓에 호출 2).
  //   앱이 뜬 때를 시작으로 놓으면 규칙이 한 가지다: **굽고 나서 이 간격이 지나야 다시 굽는다.**
  let lastThumbAt = now()
  let thumbTimer: number | undefined
  let thumbIdle: number | undefined
  /** 반증 스위치(D-3) — 켜면 **수리 전 거동**(저장마다 동기로 굽는다). 게이트가 같은 실행 안에서
   *  «수리 전 빨강»을 낸다(CLOSING 「게이트의 조건」): 저장 한 번에 toDataURL 호출 1 ↔ 0. */
  let legacyThumb = false

  const idleCall = (fn: () => void): number => {
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
    return w.requestIdleCallback ? w.requestIdleCallback(fn, { timeout: 2000 }) : window.setTimeout(fn, 0)
  }

  /** 지금 굽는다 — 세 자리(닫을 때 · 열기 전 · 쉴 때)가 이 하나를 부른다(#54) */
  async function bakeThumbNow(): Promise<void> {
    if (!thumbDirty || NOTHUMB) return
    if (app.doc.strokes.length === 0) { thumbDirty = false; return }
    thumbDirty = false
    lastThumbAt = now()
    const id = cur.id
    try {
      await markAwait('save.thumb', async () => {
        const th = thumb()
        // ⚠ **그림이 아닌 것은 안 넣는다** — 안 그려진 창의 `toDataURL`은 `"data:,"`를 낸다
        //   (web2-43 실측). 넣으면 목록에 깨진 그림이 뜨고 그것이 「저장이 안 됐다」로 읽힌다.
        if (th.startsWith('data:image/')) await putThumb(id, th)
      })
      sync()
    } catch { /* 그림만 없다 — 문서는 이미 저장됐다 */ }
  }

  /** 쉴 때 굽는 예약 — 마지막 굽기에서 `C.THUMB_IDLE_GAP_MS`가 지났을 때만, 그리고 그때도
   *  **화면이 쉬는 프레임**에서(requestIdleCallback). 없는 브라우저는 setTimeout이 그 자리다. */
  function scheduleThumb(): void {
    if (NOTHUMB || !thumbDirty) return
    if (legacyThumb) { void bakeThumbNow(); return }   // 반증 — 수리 전 거동
    if (thumbTimer !== undefined) return
    const due = Math.max(0, C.THUMB_IDLE_GAP_MS - (now() - lastThumbAt))
    thumbTimer = window.setTimeout(() => {
      thumbTimer = undefined
      thumbIdle = idleCall(() => { thumbIdle = undefined; void bakeThumbNow() })
    }, due)
  }

  const setName = (n: string) => { cur = { ...cur, name: n }; nameInput.value = n }

  /** 한 번의 저장 — **문서와 썸네일을 함께** 굽는다(썸네일은 «저장 시점의 화면»이다) */
  async function saveNow(): Promise<void> {
    const version = app.docVersion
    if (version === savedVersion) return
    // **빈 문서는 저장소에 안 남는다**(종전 규약 그대로) — 비우기 뒤에 자리가 안 남는다
    if (app.doc.strokes.length === 0) {
      savedVersion = version
      last = null
      try { await deleteDoc(cur.id) } catch { /* 애초에 없다 */ }
      sync()
      return
    }
    // web2-74 §1 표식 `save.serialize` — **문서 전량을 `JSON.stringify`** 하는 자리다.
    //   칠이 많은 문서는 수 MB이고 그 동안 메인 스레드가 통째로 막힌다(§2의 첫 후보).
    const data = perfMark('save.serialize', serialize)
    last = { bytes: data.length, pct: data.length / limit() }
    if (last.pct >= C.AUTOSAVE_WARN_RATIO && !warned) {
      warned = true
      // ⚠ 문구가 바뀌었다(web2-43): 「상한 가정」은 «저장소가 찬다»는 말이었고 그 위험은
      //   이전과 함께 사라졌다. 남은 것은 **이 문서가 커졌다**이고 답은 그대로다.
      notify(`이 문서가 ${(limit() / 1024 / 1024).toFixed(1)}MB의 ${Math.round(last.pct * 100)}%다 — 파일로 저장해 두라`)
    }
    const rec = { ...cur, updated: now(), bytes: data.length, data }
    try {
      await markAwait('save.put', () => putDoc(rec))   // web2-74 §1 표식 `save.put` — IndexedDB 쓰기
      // 썸네일은 **따로** 산다(지시 4번) — 실패해도 문서는 이미 저장됐다.
      // ⚠ **그림이 아닌 것은 안 넣는다** — 안 그려진 창의 `toDataURL`은 `"data:,"`를 낸다
      // (web2-43 실측). 넣으면 목록에 깨진 그림이 뜨고 그것이 「저장이 안 됐다」로 읽힌다.
      // ── web2-74 §3-3 — **썸네일을 저장마다 굽지 않는다** ─────────────────────────
      //   `toDataURL('image/jpeg')`는 동기 인코딩이고 §2가 그것을 임자로 지목했다: 저장 갈래
      //   691.8ms 중 **492.1ms(71.1%)**(perf74_web2_dpr2@S2_verdict · 부하 픽스처 · 획 10붓).
      //   여기서는 «굽어야 한다»는 표시만 남기고, 실제로 굽는 자리는 셋이다 —
      //   문서를 닫을 때(detach) · 다른 문서를 열기 전(flush) · 화면이 쉴 때(아래 scheduleThumb).
      //   그림이 아직 없으면 목록은 **종전대로 «그림 없음»**이다(43의 그 자리 — 새 문서와 같다).
      thumbDirty = true
      scheduleThumb()
      cur = { id: rec.id, name: rec.name, created: rec.created, updated: rec.updated, bytes: rec.bytes }
      writePtr(cur.id)      // 저장된 순간부터 «보던 문서»다(첫 회 문서의 표가 여기서 선다)
      savedVersion = version
      if (failed) { failed = false; notify('저장이 다시 된다') }
      sync()
    } catch {
      // **그 순간 알린다**(지시 2번) — 조용히 잃는 것이 최악이다. 되풀이는 안 한다.
      if (!failed) { failed = true; notify('저장이 안 된다 — 파일로 저장한다') }
    }
  }

  function schedule(): void {
    if (NOSAVE) return                    // §2 — 자동 저장을 끈 팔(문서는 메모리에만)
    clearTimeout(timer)
    timer = window.setTimeout(() => { inflight = inflight.then(saveNow) }, C.AUTOSAVE_DEBOUNCE_MS)
  }

  async function flush(): Promise<void> {
    if (NOSAVE) return
    clearTimeout(timer)
    inflight = inflight.then(saveNow)
    await inflight
    // §3-3 — **여기서는 기다린다**: 다른 문서를 열기 전·문서를 닫을 때가 그림이 서야 하는 자리다
    //   (목록은 그 뒤에 그려진다). 쉴 때 예약이 걸려 있으면 앞당긴다.
    clearTimeout(thumbTimer); thumbTimer = undefined
    await bakeThumbNow()
  }

  // ── 최근 목록 ───────────────────────────────────────────────────────────────
  let syncing = false
  function sync(): void {
    if (syncing) return
    syncing = true
    // web2-74 §2 표식 `list.read`·`list.render` — **저장이 끝난 뒤에** 도는 갈래다.
    //   `listDocs()`는 `getAll()`이라 문서 «본문»까지 읽어 오고(구조화 복제), `allThumbs()`는
    //   썸네일 전부를, `render()`는 그것을 data: URL로 `<img>`에 붙인다. 저장마다 돈다.
    void markAwait('list.read', () => Promise.all([listDocs(), allThumbs()])).then(([docs, thumbs]) => {
      perfMark('list.render', () => render(docs, thumbs))
    }).catch(() => { /* 저장소가 죽었으면 목록이 안 뜬다 — 알림은 저장 쪽이 한다 */ })
      .then(() => { syncing = false })
  }

  function render(docs: DocMeta[], thumbs: Map<string, string>): void {
    listBox.textContent = ''
    const t = now()
    const shown = docs.slice(0, C.RECENT_LIMIT)
    if (shown.length === 0) {
      const em = document.createElement('div')
      em.className = 'rempty'
      em.textContent = '아직 없다'
      listBox.appendChild(em)
      return
    }
    for (const d of shown) {
      const row = document.createElement('div')
      row.className = 'rrow' + (d.id === cur.id ? ' on' : '')
      row.dataset.id = d.id
      const pick = document.createElement('button')
      pick.className = 'rpick'
      // ⚠ **id와 `data-act`를 준다**(web2-28 1번의 전수 규약 · R3): 파일 서랍 안의
      //   `button`·`input`은 전부 자기가 «명령»인지 «상태»인지 말해야 한다 — 표시가
      //   없으면 조용히 «상태»가 되고, 그 자리에서 전수 팔이 빨개진다(실제로 잡았다).
      //   여는 것은 **명령**이다: 볼일이 끝나므로 서랍이 접힌다.
      pick.id = `rec-pick-${d.id}`
      pick.dataset.act = 'cmd'
      pick.title = d.name
      const img = document.createElement('img')
      img.className = 'rthumb'
      const th = thumbs.get(d.id)
      if (th) img.src = th
      img.alt = ''
      const txt = document.createElement('span')
      txt.className = 'rtext'
      const nm = document.createElement('span')
      nm.className = 'rname'
      nm.textContent = d.name
      const wh = document.createElement('span')
      wh.className = 'rwhen'
      wh.textContent = whenText(t, d.updated)
      txt.append(nm, wh)
      pick.append(img, txt)
      pick.addEventListener('click', () => { void open(d.id) })
      const del = document.createElement('button')
      del.className = 'rdel'
      del.id = `rec-del-${d.id}`
      // 명령이되 **누르는 순간 볼일이 안 끝난다** — 확인이 이 버튼 곁에 뜨므로 바로
      // 접으면 앵커가 사라져 확인이 미아가 된다(비우기와 같은 자리 · `data-fold="late"`).
      del.dataset.act = 'cmd'
      del.dataset.fold = 'late'
      del.innerHTML = ICON_X; del.setAttribute('aria-label', '지운다')   // web2-70 §3
      del.title = '지운다'
      del.addEventListener('click', () => {
        // 되돌릴 수 없는 것 — **무엇이 지워지는지 말한다**(R4 예외 규칙)
        confirmNear(del, `「${d.name}」을 지운다 — 되돌릴 수 없다.`, {
          label: '지운다',
          onPick: () => {
            // web2-66 66-4(R3 정정) — 지우기는 **연달아 쓰는 명령**이다(옛 드로잉 여럿을 잇달아
            // 정리하는 것이 자연스럽다). 종전에는 여기서 서랍을 접었는데, 그러면 다음 지우기마다
            // 서랍을 다시 열어야 한다(자동찾기와 같은 형태). 서랍은 열어 두고 목록만 갱신한다.
            void deleteDoc(d.id).then(() => {
              // 지금 문서를 지웠으면 **빈 새 문서**로 간다(유령을 안 남긴다)
              if (d.id === cur.id) reset()
              sync()
            }).catch(() => notify('못 지웠다'))
          },
        })
      })
      row.append(pick, del)
      listBox.appendChild(row)
    }
  }

  /** 문서를 연다 — **열기 전에 지금 문서를 저장한다**(지시 4번: 잃지 않는다) */
  async function open(id: string): Promise<void> {
    if (id === cur.id) return
    await flush()
    let rec
    try { rec = await getDoc(id) } catch { notify('못 열었다'); return }
    if (!rec) { notify('그 문서가 없다'); sync(); return }
    const { readBrnl, reportNotice } = await import('../core/file')
    const { data, report } = readBrnl(rec.data)
    const msg = reportNotice(report)
    if (!data) { notify(msg ?? '못 열었다'); return }
    applyDoc(data)
    cur = { id: rec.id, name: rec.name, created: rec.created, updated: rec.updated, bytes: rec.bytes }
    writePtr(cur.id)
    nameInput.value = cur.name
    savedVersion = app.docVersion
    if (msg) notify(msg)
    sync()
  }

  /** **지금 문서를 그 자리에서 굳히고 새 문서로 간다** — 화면은 안 기다린다.
   *
   *  왜 `flush().then(reset)`이 아닌가: 그러면 «비우기»가 저장소 왕복 뒤에 일어나고,
   *  저장소가 느리거나 죽으면 화면이 안 비워진다(팔이 그 창을 잡았다 — 획 9개가 남아 있었다).
   *  스냅샷은 **지금 이 순간의 바이트**이므로 뒤에 쓰든 화면과 어긋나지 않는다. */
  function detach(): void {
    clearTimeout(timer)
    clearTimeout(thumbTimer); thumbTimer = undefined
    thumbDirty = false          // §3-3 — 아래에서 **그 자리의 그림**을 굽는다(예약은 필요 없다)
    if (app.doc.strokes.length > 0) {
      const data = serialize()
      let th = ''
      try { th = thumb() } catch { /* 그림만 없다 */ }
      const rec = { ...cur, updated: now(), bytes: data.length, data }
      inflight = inflight.then(async () => {
        await putDoc(rec)
        if (th.startsWith('data:image/')) await putThumb(rec.id, th)
      }).catch(() => { if (!failed) { failed = true; notify('저장이 안 된다 — 파일로 저장한다') } })
    }
    reset()
  }

  function reset(): void {
    const t = now()
    cur = { id: newDocId(t), name: defaultDocName(t), created: t, updated: t, bytes: 0 }
    writePtr(cur.id)
    nameInput.value = cur.name
    savedVersion = app.docVersion
    last = null
    warned = false
    sync()
  }

  /** 파일에서 연 것은 **새 문서**다 — 파일 이름을 그대로 이름으로 쓴다(그것이 정보다) */
  function adoptOpened(name: string): void {
    const t = now()
    cur = { id: newDocId(t), name: name || defaultDocName(t), created: t, updated: t, bytes: 0 }
    writePtr(cur.id)
    nameInput.value = cur.name
    savedVersion = -1          // 연 문서를 곧바로 저장소에 앉힌다(잃지 않는다)
    schedule()
    sync()
  }

  // 이름 — 바꾸면 저장소의 그 필드만 고친다(다른 데이터는 안 건드린다 · 지시 3번)
  nameInput.value = cur.name
  const commitName = () => {
    const n = nameInput.value.trim().slice(0, 60) || defaultDocName(cur.created)
    if (n === cur.name) { nameInput.value = n; return }
    setName(n)
    // ⚠ **저장 줄에 얹는다**(`inflight`) — 안 그러면 「이름을 바꿨다」가 화면에는 이미
    // 참인데 저장소에는 아직 아니고, `flush()`가 그것을 안 기다린다(팔이 그 창을 잡았다).
    const id = cur.id
    inflight = inflight.then(() => renameDoc(id, n).then(sync).catch(() => notify('이름을 못 바꿨다')))
  }
  nameInput.addEventListener('change', commitName)
  nameInput.addEventListener('blur', commitName)
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') nameInput.blur() })

  async function boot(): Promise<void> {
    const t = now()
    bootCost.bootAt = performance.now()
    // ① 이전 — 복사 → 검증 → 삭제. 실패해도 옛것이 산다(그 사실을 팔이 잰다)
    let migrated: string[] = []
    try {
      const m = await migrateFromLocal(t)
      migrated = m.ids
      if (m.failed.length > 0) notify('옛 자동 저장을 못 옮겼다 — 그 그림은 그대로 있다')
    } catch { /* 저장소가 죽었으면 아래 목록도 빈다 */ }
    // ② **무엇을 열 것인가** — 셋 중 하나다:
    //    ㉠ 방금 옮겨 온 것이 있으면 그것 ㉡ 보고 있던 문서(PTR_KEY)가 저장소에 있으면 그것
    //    ㉢ 가리키는 것이 없으면(첫 실행) 가장 최근 것.
    //    가리키는 문서가 **없으면 빈 화면이다** — 「새로 시작」을 누른 뒤의 상태가 그것이다.
    const ptr = bootPtr
    let rec = null
    try {
      if (migrated.length > 0) rec = await getDoc(migrated[0]!)
      else if (ptr) rec = await getDoc(ptr)
      else {
        const docs = await listDocs()
        rec = docs[0] ? await getDoc(docs[0].id) : null
      }
    } catch { notify('저장소를 못 열었다 — 파일로 저장한다'); return }
    if (!rec) { sync(); return }
    // 사람이 이미 그리기 시작했으면 **안 덮는다**(복원은 비동기다)
    if (app.docVersion !== savedVersion || app.doc.strokes.length > 0) { sync(); return }
    const { readBrnl, reportNotice } = await import('../core/file')
    // web2-72 §0·§5 표식(D-1) — 「열 때」의 시간이 **어디로 가는가**를 경로에 심는다:
    // 읽기(파싱) · 앉히기(loadDoc → recompute: 리프팅·면). 칠 굽기는 그 뒤 프레임의 몫이다.
    // web2-74 §1 표식 `doc.parse` — 72의 `parseMs` 자와 **같은 자리**를 두른다(#54)
    const tParse0 = performance.now()
    const { data, report } = perfMark('doc.parse', () => readBrnl(rec!.data))
    bootCost.parseMs = performance.now() - tParse0
    bootCost.bytes = rec.data.length
    if (data && data.doc.strokes.length > 0) {
      bootCost.strokes = data.doc.strokes.length
      const tApply0 = performance.now()
      applyDoc(data)
      bootCost.applyMs = performance.now() - tApply0
      cur = { id: rec.id, name: rec.name, created: rec.created, updated: rec.updated, bytes: rec.bytes }
      writePtr(cur.id)
      nameInput.value = cur.name
      savedVersion = app.docVersion
      const msg = reportNotice(report)
      if (msg) notify(msg)
    } else if (!report.ok) {
      // **조용히 빈 문서를 열지 않는다**(지시 1번) — 무엇이 있었는지 말한다
      notify(reportNotice(report) ?? '마지막 그림을 못 읽었다')
    }
    if (migrated.length > 0) notify('옛 그림을 옮겼다')
    sync()
  }

  return {
    schedule, flush, boot, sync, detach, adoptOpened,
    /** §3-3 반증 스위치(D-3) — 켜면 저장마다 동기로 굽는다(수리 전 거동) */
    setLegacyThumbForTest: (v: boolean) => { legacyThumb = v },
    /** §3-3 — 지금 굽는다(팔이 «쉴 때»를 기다리지 않고 그 자리를 확인하는 통로) */
    bakeThumbForTest: () => bakeThumbNow(),
    thumbStateForTest: () => ({ dirty: thumbDirty, lastAt: lastThumbAt, pending: thumbTimer !== undefined || thumbIdle !== undefined, legacy: legacyThumb, gapMs: C.THUMB_IDLE_GAP_MS }),
    current: () => cur,
    last: () => last,
    limitForTest: (n) => { limitOverride = n },
    dump: async () => {
      const docs = await listDocs().catch(() => [] as DocMeta[])
      const rec = await getDoc(cur.id).catch(() => null)
      const th = await allThumbs().catch(() => new Map<string, string>())
      return { current: cur.id, docs, data: rec?.data ?? null, thumb: th.get(cur.id) ?? null }
    },
  }
}
