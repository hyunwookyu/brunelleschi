// 서비스 워커 — 오프라인 동작(계획서 §1.4) **과 갱신**(2026-08-19 17차 지시 0-2).
//
// **빌드가 목록과 판본을 넣어 준다**(S-9). `__PRECACHE__`·`__BUILD__`·`__COMMIT__`·
// `__BUILD_TIME__`는 `vite.config.ts`의 `swPrecache` 플러그인이 실제 빌드 값으로 바꾼다.
// 개발 서버에서는 그대로 남으므로 아래 기본값이 쓰인다(개발에서는 등록 자체를 안 한다).
//
// ## ⚠ 옛 판이 왜 옛 번들을 계속 줬는가 (지시 0-2a의 확인)
//
// 옛 판은 **전부 cache-first**였다 — `caches.match(req)`가 맞으면 네트워크를 안 봤다.
// 문서(`l.html`)도 그 대상이라, 한 번 캐시된 뒤에는 **새 배포가 나가도 옛 문서가 나갔다.**
// 빠져나올 길은 워커가 바뀌는 것뿐인데, 옛 `__BUILD__`는 **파일 이름 목록의 해시**였다.
// `l.html`은 이름이 안 바뀌는 파일이라 **그 파일만 고친 배포는 `sw.js`가 바이트까지 같아졌고**,
// 브라우저는 "새 워커 없음"으로 읽었다. 그래서 새로고침을 몇 번 해도 안 바뀌고
// **캐시를 지워야** 했다. 두 자리를 같이 고친다:
//
//   a. **판본에 커밋·빌드 시각이 들어간다**(`vite.config.ts`) — 빌드마다 워커가 바뀐다
//   b. **앱 셸은 cache-first가 아니다**(아래) — 온라인이면 새 것을 받는다
//
// ## 전략 (지시 0-2b)
//
// | 대상 | 전략 | 왜 |
// |---|---|---|
// | 문서(탐색·`.html`) | **network-first** | 여기가 판을 정한다. 새 문서가 새 번들 이름을 가리킨다 |
// | 스크립트·스타일 | **stale-while-revalidate** | 이름에 내용 해시가 붙어 사실상 불변이다. 즉시 뜨고 뒤에서 갱신 |
// | 그 밖(아이콘·매니페스트) | cache-first | 바뀌어도 화면이 안 깨진다 |
//
// 오프라인은 그대로다 — 네트워크가 없으면 셋 다 캐시로 떨어진다.
const PRECACHE = self.__PRECACHE__ || ["./", "./l.html", "./manifest.webmanifest", "./icon.svg"];
const BUILD = self.__BUILD__ || "dev";
const COMMIT = self.__COMMIT__ || "unknown";
const BUILD_TIME = self.__BUILD_TIME__ || "";
const CACHE = "sketch3d-" + BUILD;

self.addEventListener("install", (e) => {
  // 하나가 404여도 나머지는 캐시한다 — `addAll`은 하나만 실패해도 전부 버린다.
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => null))))
    // **즉시 인계받는다**(지시 0-2d) — 없으면 탭을 전부 닫아야 새 워커가 선다.
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      // 판본이 다른 캐시는 지운다(지시 0-2c) — 옛 번들이 안 남는다
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** 성공한 동일 출처 응답만 캐시에 넣는다. 오류 응답을 캐시하면 오프라인에서 굳는다. */
async function putIfOk(req, res) {
  if (res && res.ok && res.type === "basic") {
    const c = await caches.open(CACHE);
    await c.put(req, res.clone());
  }
  return res;
}

/** 온라인이면 새 것, 아니면 캐시. 문서가 이 경로를 탄다 — **갱신이 여기서 걸린다.** */
async function networkFirst(req) {
  try {
    return await putIfOk(req, await fetch(req));
  } catch {
    // 탐색 요청은 정확한 URL이 캐시에 없을 수 있다(쿼리·해시) — 화면 하나로 떨어뜨린다
    return (await caches.match(req)) || (await caches.match("./l.html")) || Response.error();
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;

  // ---- 문서 → network-first
  if (req.mode === "navigate" || req.destination === "document"
      || url.pathname.endsWith(".html")) {
    e.respondWith(networkFirst(req));
    return;
  }

  // ---- 스크립트·스타일 → stale-while-revalidate
  //      ⚠ `waitUntil`을 **핸들러 안에서 동기로** 부른다 — 응답을 캐시에서 돌려준 뒤에
  //      부르면 이벤트가 이미 끝나 있을 수 있고, 그러면 갱신이 조용히 사라진다.
  if (req.destination === "script" || req.destination === "style"
      || req.destination === "worker" || /\.(js|css)$/.test(url.pathname)) {
    const net = fetch(req).then((res) => putIfOk(req, res));
    e.waitUntil(net.catch(() => null));
    e.respondWith(
      caches.match(req).then((hit) => hit || net).catch(() => net.catch(() => Response.error())),
    );
    return;
  }

  // ---- 그 밖 → cache-first
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => putIfOk(req, res)))
      .catch(() => Response.error()),
  );
});

self.addEventListener("message", (e) => {
  const d = e.data;
  if (!d || typeof d !== "object") return;
  // 사용자가 "새로고침"을 눌렀다(`swUpdate.ts`) — 대기 중이면 인계를 재촉한다
  if (d.type === "SKIP_WAITING") self.skipWaiting();
  // 진단 — 화면 표시와 워커의 판본이 같은지 그 자리에서 대조할 수 있다
  if (d.type === "VERSION" && e.ports && e.ports[0]) {
    e.ports[0].postMessage({ build: BUILD, commit: COMMIT, time: BUILD_TIME, cache: CACHE });
  }
});
