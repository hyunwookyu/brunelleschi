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
      "**실제 GitHub Pages에서 도는가** — 이 스펙은 **로컬 정적 서버**를 잰다. "
        + "실제 배포는 2026-08-16에 처음 돌았고(https://hyunwookyu.github.io/brunelleschi/) "
        + "사람이 브라우저로 확인했다 — ⚠ **그것은 원장 밖 관측이다**(#25)",
      "아이패드 사파리 — 여기는 chromium이다. 인앱 브라우저의 서비스 워커 제한은 별개다",
      "설치형 PWA 동작 — manifest가 있다는 것과 설치되는 것은 다르다",
      "**사전 캐시 목록만의 몫** — 앱이 페이지마다 자기 서비스 워커를 다시 등록하므로 "
        + "'그 목록이 없었으면 어땠는가'를 이 설계로 못 가른다. **미측정이다**(아래 대조군의 `reading`)",
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
  expect(app.bar).toContain(".brnl 저장");   // 자체 형식(내용은 JSON)
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
 * **양성 채널**(PITFALLS #30) — 위 ③이 무엇을 배제했는지 보인다.
 *
 * 리뷰어가 짚었다: 오프라인 통과에 **실패해야 하는 팔이 없었다.** 통과가 캐시의 효력인지,
 * 아니면 다른 경로로 어차피 뜨는 것인지 안 갈렸다.
 *
 * ⚠⚠ **초판은 팔을 둘 뒀고 그중 하나가 무효였다 — 철회한다.**
 * 팔 A는 "사전 캐시 목록에서 `.js`를 뺀 서비스 워커"를 따로 등록해 재는 것이었는데,
 * **앱(`mainL.ts`)이 페이지를 열 때마다 자기 서비스 워커(`./sw.js`)를 다시 등록한다.**
 * 그래서 같은 scope에 **워커 둘이 얹혀 경쟁**했고(캐시 목록에 `sketch3d-<build>`와
 * `sketch3d-broken`이 함께 남는다), 어느 쪽이 그 새로고침을 잡을지가 실행마다 갈렸다.
 * 초판이 그 팔에서 읽은 결론("A가 살았다 → ③의 통과는 사전 캐시의 효력이 아니다")은
 * **교락된 팔에서 나온 것이므로 무효다.** 빌드가 바뀌자 곧바로 뒤집혔다.
 *
 * **팔 하나로 줄인다**(A-3: 가장 단순한 것). 앱의 서비스 워커를 그대로 두고
 * **그 캐시에서 `.js`만 지운다.** 그러면 문서는 여전히 캐시에서 오고(`doc_from_cache`)
 * **앱은 못 산다**(`app_revived`) — 그것이 ③이 실제로 배제하는 것이다:
 * **캐시에 번들이 없으면 오프라인 새로고침이 깨진다.**
 */
test("[양성 채널] 캐시에서 번들을 지우면 오프라인 새로고침이 실제로 깨진다", async ({ page, context }) => {
  await page.goto(`http://localhost:${PORT}${SUB}/l.html`);
  await page.waitForFunction(() => !!(window as unknown as { S2S?: unknown }).S2S);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  // 사전 캐시가 채워질 틈을 준다(설치 → 활성)
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  /**
   * 오프라인에서 **문서**와 **앱**을 갈라 낸다.
   * ⚠ `reload` 거부(`ERR_INTERNET_DISCONNECTED`)를 잡아야 한다 — 안 잡으면
   * "문서도 못 왔다"가 관측이 아니라 테스트 오류로 뜬다(#7).
   */
  const lives = async () => {
    await context.setOffline(true);
    const doc = await page.reload().then(() => true, () => false);
    const app = doc
      ? await page.waitForFunction(() => !!(window as unknown as { S2S?: unknown }).S2S,
                                   undefined, { timeout: 5_000 }).then(() => true, () => false)
      : false;
    await context.setOffline(false);
    if (!doc) await page.goto(`http://localhost:${PORT}${SUB}/l.html`);
    return { doc, app };
  };

  // ---- ① **지우기 전**: 오프라인에서 앱이 산다(위 ③과 같은 상태)
  const before = await lives();
  expect(before.doc).toBe(true);
  expect(before.app).toBe(true);

  // ---- ② **캐시에서 `.js`만 지운다** — 앱 코드는 안 건드린다
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
  expect(deleted).toBeGreaterThan(0);   // 지울 것이 없으면 이 팔은 아무 말도 안 한다(#32)

  // ---- ③ **깨져야 통과다**
  const after = await lives();
  expect(after.doc).toBe(true);         // 문서는 여전히 캐시에서 온다
  expect(after.app).toBe(false);        // **앱은 못 산다**

  led.l_d2_offline_control = {
    before_delete: before, deleted_js_entries: deleted, after_delete: after,
    reading: "**③이 배제하는 것은 '캐시에 번들이 있다'이다.** 지우기 전에는 문서·앱 둘 다 살고, "
      + "`.js`만 지우면 **문서는 살고 앱은 죽는다** — 즉 그 확인은 눈이 떠 있다. "
      + "⚠⚠ **초판의 팔 A(사전 캐시 목록에서 `.js`를 뺀 별도 워커)는 무효였다** — "
      + "앱이 자기 서비스 워커를 매번 다시 등록하므로 같은 scope에 워커 둘이 경쟁했다. "
      + "거기서 읽은 '③의 통과는 사전 캐시의 효력이 아니다'를 **철회한다**. "
      + "**사전 캐시 목록만의 몫은 이 설계로 안 갈린다**(앱의 등록을 못 끄기 때문이다) — 미측정이다.",
  };
});
