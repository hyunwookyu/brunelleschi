// L-D.2 **정적 배포 확인** — 서버 없이, **하위 경로에서**, 오프라인으로 열리는가.
//
// 착수 시 `PITFALLS.md` 최근 다섯을 읽었다. 걸리는 것: **#32**(미실행을 반증으로 처리하지
// 않는다 — 인앱 브라우저에서 서비스 워커 등록이 막혀서 여기서 다시 잰다).
//
// 재는 것 셋:
//   ① 빌드본이 **하위 경로**(`/SKETCH2SPACE/`)에서 그대로 열린다 — Pages가 그 모양이다
//   ② 서비스 워커가 등록되고 **그 하위 경로를 scope로** 잡는다
//   ③ **오프라인**에서 새로고침해도 열린다(사전 캐시 목록이 실제로 듣는가)
//
// 서버는 이 스펙이 직접 띄운다(`http.server`가 아니라 Node) — 배포는 정적 파일뿐이므로
// 어떤 서버든 같아야 하고, 그것이 이 확인의 요점이다.
import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, "..", "dist");
const SUB = "/SKETCH2SPACE";           // Pages의 하위 경로를 흉내 낸다
const PORT = 8901;
const OUT = resolve(HERE, "..", "..", "stage0", "out");

/** **원장에 남긴다**(PITFALLS #25) — 문장으로만 있는 확인은 selfcheck를 한 번도 안 지난다. */
const led: Record<string, unknown> = {};

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png",
};

let server: Server;

test.beforeAll(async () => {
  test.skip(!existsSync(join(DIST, "l.html")),
            "빌드본이 없다 — `npm run build`를 먼저 돌린다(미실행은 반증이 아니다, #32)");
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    let p = url.pathname;
    if (!p.startsWith(SUB)) { res.statusCode = 404; res.end("nope"); return; }
    p = p.slice(SUB.length) || "/";
    if (p.endsWith("/")) p += "l.html";
    // **양성 채널**(#30) — 사전 캐시 목록에서 번들을 뺀 서비스 워커를 따로 낸다.
    // 통과가 무엇을 배제했는지 보이려면 **실패하는 팔**이 있어야 한다.
    if (p === "/sw-broken.js") {
      const src = await readFile(join(DIST, "sw.js"), "utf-8");
      const out = src
        .replace(/self\.__PRECACHE__ = (\[.*?\]);/, (_m, list) => {
          const kept = (JSON.parse(list) as string[]).filter(u => !u.endsWith(".js"));
          return `self.__PRECACHE__ = ${JSON.stringify(kept)};`;
        })
        .replace(/self\.__BUILD__ = ".*?";/, 'self.__BUILD__ = "broken";');
      res.setHeader("Content-Type", "text/javascript");
      res.end(out); return;
    }
    try {
      const buf = await readFile(join(DIST, p));
      res.setHeader("Content-Type", MIME[extname(p)] ?? "application/octet-stream");
      res.end(buf);
    } catch {
      res.statusCode = 404; res.end("not found");
    }
  });
  await new Promise<void>(r => server.listen(PORT, r));
});

test.afterAll(async () => {
  await new Promise<void>(r => server?.close(() => r()));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "static_deploy.json"), JSON.stringify({
    spec: "L-D.2 정적 배포 — 서버 없이, 하위 경로에서, 오프라인으로 열리는가",
    plan: "docs/line_plan.md L-D.2",
    what_this_does_not_say: [
      "실제 GitHub Pages에서 도는가 — **아직 한 번도 실행되지 않았다**(Settings → Pages 미설정)",
      "아이패드 사파리 — 여기는 chromium이다. 인앱 브라우저의 서비스 워커 제한은 별개다",
      "설치형 PWA 동작 — manifest가 있다는 것과 설치되는 것은 다르다",
    ],
    condition: {
      server: `Node 정적 서버(이 스펙이 띄운다) · 하위 경로 ${SUB} · 포트 ${PORT}`,
      build: "`npm run build` 산출물(`dist/`). 빌드본이 없으면 **건너뛴다**(#32)",
      browser: "chromium(Playwright) · 1440×900 · deviceScaleFactor 1",
    },
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
    ...led,
  }, null, 2), "utf-8");
});

test("하위 경로에서 열리고, 서비스 워커가 잡히고, 오프라인에서도 뜬다", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  // ① 하위 경로에서 열린다 — `base: "./"`라 리포지토리 이름을 안 박아도 된다
  await page.goto(`http://localhost:${PORT}${SUB}/l.html`);
  await page.waitForFunction(() => !!(window as any).S2S);
  const app = await page.evaluate(() => {
    const s = (window as any).S2S;
    return {
      views: s.views().length,
      bar: [...document.querySelectorAll("#bar button")].map(b => (b as HTMLElement).textContent),
      assets: [...document.querySelectorAll("script[src]")].map(e => e.getAttribute("src")),
    };
  });
  expect(app.views).toBe(1);
  expect(app.bar).toContain("OBJ");
  expect(app.bar).toContain("JSON");
  // 절대 경로가 섞이면 하위 경로에서 404가 난다
  for (const a of app.assets) expect(a?.startsWith("/")).toBe(false);

  // ② 서비스 워커가 **그 하위 경로**를 scope로 잡는다
  const scope = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.register("./sw.js");
    await navigator.serviceWorker.ready;
    return reg.scope;
  });
  expect(scope).toBe(`http://localhost:${PORT}${SUB}/`);

  // 사전 캐시가 채워질 틈을 준다(설치 → 활성). `ready`가 활성까지 기다린다.
  await page.reload();
  await page.waitForFunction(() => !!(window as any).S2S);
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  expect(controlled).toBe(true);

  // ③ **오프라인에서도 뜬다** — 서버를 끊고 새로고침한다
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => !!(window as any).S2S, undefined, { timeout: 15_000 });
  const offlineViews = await page.evaluate(() => (window as any).S2S.views().length);
  expect(offlineViews).toBe(1);
  await context.setOffline(false);

  expect(errors.filter(e => !/Failed to load resource/.test(e))).toEqual([]);

  led.l_d2 = {
    subpath_opens: true, views: app.views,
    absolute_asset_srcs: app.assets.filter(a => a?.startsWith("/")).length,
    sw_scope_matches_subpath: scope === `http://localhost:${PORT}${SUB}/`,
    controlled_after_reload: controlled,
    offline_reload_views: offlineViews,
    console_errors: errors.filter(e => !/Failed to load resource/.test(e)),
  };
});

/**
 * **양성 채널**(PITFALLS #30) — 위의 ③이 무엇을 배제했는지 보인다.
 *
 * 리뷰어가 짚었다: 오프라인 통과에 **실패해야 하는 팔이 없었다.** 통과가 사전 캐시 목록의
 * 효력을 증명하는 것인지, 아니면 다른 경로로 어차피 뜨는 것인지 안 갈렸다.
 * 같은 성격의 대조군이 다른 블록에는 전부 있다(`backbuffer_frame_control` ·
 * `roundtrip_wrong_pose_control` · `blank_corner_control`).
 *
 * **팔 둘을 낸다** — 하나만으로는 안 갈린다:
 *   A. 사전 캐시 목록에서 `.js`를 뺀 서비스 워커 → 그래도 뜨는가
 *   B. A에 더해 **캐시에 들어간 `.js`를 직접 지운다** → 그러면 깨지는가
 *
 * ⚠ **A는 안 깨졌다**(실측). 서비스 워커의 `fetch` 핸들러가 성공한 동일 출처 응답을
 * 그때그때 캐시에 넣으므로, 온라인으로 두 번 연 뒤에는 번들이 **런타임 캐시**로 이미 들어 있다.
 * 즉 **③의 통과는 사전 캐시 목록의 효력이 아니다** — 이 시나리오에서 사전 캐시가 하는 일은
 * *첫 방문에서 아직 안 받은 자산*(지연 로드 청크)을 미리 채우는 것뿐이고, 이 확인은 그것을
 * 재지 않는다. **B가 깨지는 것**이 ③이 실제로 배제하는 것이다: 캐시에 번들이 없으면 안 뜬다.
 */
test("[양성 채널] 캐시에 번들이 없으면 오프라인 새로고침이 실제로 깨진다", async ({ page, context }) => {
  await page.goto(`http://localhost:${PORT}${SUB}/l.html`);
  await page.waitForFunction(() => !!(window as unknown as { S2S?: unknown }).S2S);

  const scope = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.register("./sw-broken.js");
    await navigator.serviceWorker.ready;
    return reg.scope;
  });
  expect(scope).toBe(`http://localhost:${PORT}${SUB}/`);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  const lives = async () => {
    await context.setOffline(true);
    await page.reload();
    const ok = await page
      .waitForFunction(() => !!(window as unknown as { S2S?: unknown }).S2S,
                       undefined, { timeout: 5_000 })
      .then(() => true, () => false);
    await context.setOffline(false);
    return ok;
  };

  // 팔 A — 사전 캐시에서만 뺐다. **런타임 캐시가 메운다**(실측: 산다)
  const armA = await lives();

  // 팔 B — 캐시에 들어간 `.js`를 직접 지운다. **이때는 깨져야 한다**
  const deleted = await page.evaluate(async () => {
    let n = 0;
    for (const k of await caches.keys()) {
      const c = await caches.open(k);
      for (const req of await c.keys()) {
        if (new URL(req.url).pathname.endsWith(".js")) { await c.delete(req); n += 1; }
      }
    }
    return n;
  });
  expect(deleted).toBeGreaterThan(0);          // 지울 것이 없으면 이 팔은 아무 말도 안 한다(#32)
  const armB = await lives();

  expect(armB).toBe(false);                    // **깨져야 통과다**

  led.l_d2_offline_control = {
    arm_a_precache_only: { removed: "`.js` 전부를 사전 캐시 목록에서 뺐다", app_revived: armA },
    arm_b_cache_emptied: { deleted_js_entries: deleted, app_revived: armB },
    reading: armA
      ? "**A가 살았다 — ③의 통과는 사전 캐시 목록의 효력이 아니다.** `fetch` 핸들러가 성공 "
        + "응답을 그때그때 캐시하므로 온라인으로 두 번 연 뒤에는 번들이 런타임 캐시에 있다. "
        + "사전 캐시가 실제로 사는 자리는 **첫 방문에서 아직 안 받은 지연 로드 청크**이고 "
        + "이 확인은 그것을 안 잰다(미측정). **B가 깨지는 것**이 ③이 배제하는 것이다 — "
        + "캐시에 번들이 없으면 안 뜬다."
      : "A가 깨졌다 — 사전 캐시 목록이 필요조건이다(이 실행에서는 그렇게 나왔다).",
  };
});
