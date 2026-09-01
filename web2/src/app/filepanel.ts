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

import type { App } from './state'
import type { BrnlData } from '../core/file'
import { C } from '../core/constants'
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
  /** 상한 가정 손잡이(e2e) */
  limitForTest: (n: number | null) => void
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
const PTR_KEY = 'b2-doc'
const readPtr = (): string | null => { try { return localStorage.getItem(PTR_KEY) } catch { return null } }
const writePtr = (id: string): void => { try { localStorage.setItem(PTR_KEY, id) } catch { /* 세션 한정 */ } }

export function initFilePanel(deps: FileDeps): FilePanel {
  const { app, serialize, thumb, notify, applyDoc, confirmNear, now } = deps
  const nameInput = document.getElementById('doc-name') as HTMLInputElement
  const listBox = document.getElementById('recent')!

  // ⚠ **표를 먼저 읽는다** — 아래에서 새 문서를 만들며 표를 덮으면 `boot`이 «방금 만든
  //   빈 문서»를 가리키는 표를 읽게 되고, 저장돼 있던 그림이 영영 안 열린다(팔이 잡았다).
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
    const data = serialize()
    last = { bytes: data.length, pct: data.length / limit() }
    if (last.pct >= C.AUTOSAVE_WARN_RATIO && !warned) {
      warned = true
      notify(`문서가 상한 가정(${(limit() / 1024 / 1024).toFixed(1)}MB)의 ${Math.round(last.pct * 100)}%다 — 파일로 저장해 두라`)
    }
    const rec = { ...cur, updated: now(), bytes: data.length, data }
    try {
      await putDoc(rec)
      // 썸네일은 **따로** 산다(지시 4번) — 실패해도 문서는 이미 저장됐다.
      // ⚠ **그림이 아닌 것은 안 넣는다** — 안 그려진 창의 `toDataURL`은 `"data:,"`를 낸다
      // (web2-43 실측). 넣으면 목록에 깨진 그림이 뜨고 그것이 「저장이 안 됐다」로 읽힌다.
      try {
        const th = thumb()
        if (th.startsWith('data:image/')) await putThumb(cur.id, th)
      } catch { /* 그림만 없다 */ }
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
    clearTimeout(timer)
    timer = window.setTimeout(() => { inflight = inflight.then(saveNow) }, C.AUTOSAVE_DEBOUNCE_MS)
  }

  async function flush(): Promise<void> {
    clearTimeout(timer)
    inflight = inflight.then(saveNow)
    await inflight
  }

  // ── 최근 목록 ───────────────────────────────────────────────────────────────
  let syncing = false
  function sync(): void {
    if (syncing) return
    syncing = true
    void Promise.all([listDocs(), allThumbs()]).then(([docs, thumbs]) => {
      render(docs, thumbs)
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
      del.textContent = '×'
      del.title = '지운다'
      del.addEventListener('click', () => {
        // 되돌릴 수 없는 것 — **무엇이 지워지는지 말한다**(R4 예외 규칙)
        confirmNear(del, `「${d.name}」을 지운다 — 되돌릴 수 없다.`, {
          label: '지운다',
          onPick: () => {
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
    const { data, report } = readBrnl(rec.data)
    if (data && data.doc.strokes.length > 0) {
      applyDoc(data)
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
