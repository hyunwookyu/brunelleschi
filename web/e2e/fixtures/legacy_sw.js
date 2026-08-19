// **옛 판 그대로의 서비스 워커** — `e2e/static_deploy.spec.ts`의 **대조군**(양성 채널, #44).
//
// ⚠ **이것은 앱이 쓰는 코드가 아니다.** 2026-08-19 17차 지시 0-2 이전의 `public/sw.js`
// 본문(전부 cache-first)을 **그대로** 떠 둔 것이고, 대조군 팔만 이 파일을 쓴다.
// 앱 쪽을 고치면 이 파일은 그대로 둔다 — 비교 대상이 "옛 판"이어야 비교가 성립한다.
//
// 이 팔이 말하는 것: **같은 변경(`l.html`만 바뀐 배포)을 주면 새 판은 받고 이 판은 못 받는다.**
// 즉 ③의 통과가 «어차피 뜨는 것»이 아니라 **fetch 전략의 효력**임을 가른다.
const PRECACHE = self.__PRECACHE__ || ["./", "./l.html", "./manifest.webmanifest", "./icon.svg"];
const CACHE = "sketch3d-" + (self.__BUILD__ || "dev");

self.addEventListener("install", (e) => {
  // 하나가 404여도 나머지는 캐시한다 — `addAll`은 하나만 실패해도 전부 버린다.
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => null))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // 성공한 동일 출처 응답만 캐시에 넣는다. 오류 응답을 캐시하면 오프라인에서 굳는다.
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match("./l.html"));
    }),
  );
});
