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
// **2026-08-19 17차 지시 0-4가 둘을 더한다** — *"빌드를 두 번 하고 두 번째가 실제로 나가는지"*:
//   ④ **재배포가 나간다** — 1차를 캐시에 넣은 뒤 2차를 올리고, 새로고침 한 번에 받는가.
//      그리고 워커가 바뀐 재배포에서는 **갱신 알림**이 뜨고 그 버튼이 실제로 새 판을 여는가
//   ⑤ **대조군**(#44) — **옛 판**(전부 cache-first)에 **같은** 재배포를 준다. 그쪽이 못 받아야
//      ④의 통과가 «어차피 되는 것»이 아니라 **fetch 전략의 효력**임이 갈린다
//
// 서버는 이 스펙이 직접 띄운다(`http.server`가 아니라 Node) — 배포는 정적 파일뿐이므로
// 어떤 서버든 같아야 하고, 그것이 이 확인의 요점이다.
import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, writeFileSync, readFileSync, mkdirSync, mkdtempSync,
         cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, "..", "dist");
const SUB = "/SKETCH2SPACE";           // Pages의 하위 경로를 흉내 낸다
// **재배포 팔의 두 scope**(17차 지시 0-4). 서비스 워커와 `caches`는 **컨텍스트에 남으므로**
// 팔을 같은 경로에 얹으면 워커가 경쟁한다 — 이 스펙이 이미 한 번 그렇게 무효가 됐다(「팔 A」).
// **scope를 갈라** 팔마다 자기 워커만 있게 한다(#53: 팔이 앞 팔의 장면을 안 물려받는다).
const SUB_NEW = "/DEPLOY_NEW";         // 현행 `sw.js`
const SUB_OLD = "/DEPLOY_OLD";         // 옛 판(전부 cache-first) — 대조군
const PORT = 8901;
const OUT = resolve(HERE, "..", "..", "stage0", "out");

/** **원장에 남긴다**(PITFALLS #25) — 문장으로만 있는 확인은 selfcheck를 한 번도 안 지난다. */
const led: Record<string, unknown> = {};

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png",
};

let server: Server;

/**
 * **경로 → 뿌리 디렉터리.** 재배포 팔이 이 표의 값만 바꿔 "같은 주소에 새 빌드가 올라간 것"을
 * 흉내 낸다. 브라우저 쪽에서는 URL이 그대로이므로 scope·캐시가 실제 재배포와 같은 조건이다.
 */
const ROOTS = new Map<string, string>();
/** 변형본을 두는 임시 디렉터리(테스트가 끝나면 지운다). 저장소에 남기지 않는다. */
let TMP = "";

/**
 * `dist/`를 베껴 **변형본**을 만든다(지시 0-4 "빌드를 두 번 하고").
 *
 * ⚠⚠ **이것은 두 번째 `vite build`가 아니다** — 산출물 변형본이다. 그렇게 하는 이유는
 * 대조가 성립해야 하기 때문이다: 두 팔의 차이가 **fetch 전략 하나**여야 하므로 두 판본은
 * `sw.js`까지 **바이트가 같아야** 한다. 실제 두 번째 빌드는 빌드 시각이 달라 `sw.js`가
 * 바뀌고, 그러면 "옛 판도 워커 교체로 결국 받는다"가 섞여 **전략의 몫이 안 갈린다.**
 * 이 한계는 원장의 `what_this_does_not_say`에 적는다(#32: 미실행을 반증으로 안 쓴다).
 *
 * @param marker `l.html`에 심는 판본 표식. 페이지에서 `meta[name=s2s-deploy]`로 읽는다
 * @param legacySw `sw.js`를 **옛 판 본문**으로 갈아 끼운다(대조군)
 */
interface VariantOpts {
  /** `l.html`에 심는 판본 표식 */
  marker?: string;
  /** `sw.js` 본문을 **옛 판**(전부 cache-first)으로 갈아 끼운다 — 대조군 */
  legacySw?: boolean;
  /**
   * **진짜 두 번째 빌드를 흉내 낸다** — 번들 이름(내용 해시)·번들 안의 커밋 상수·
   * `sw.js`의 판본 머리를 **전부** 바꾼다. 실제 `vite build`가 새 커밋에서 내는 서명 그대로다.
   */
  rebuild?: { commit: string; time: string; tag: string };
}

function variant(name: string, opts: VariantOpts = {}): string {
  const { marker, legacySw, rebuild } = opts;
  const dir = join(TMP, name);
  cpSync(DIST, dir, { recursive: true });

  if (rebuild) {
    // ① 번들 — 이름과 안의 커밋 상수를 바꾼다(vite는 내용이 바뀌면 이름을 바꾼다)
    const swHead = readFileSync(join(dir, "sw.js"), "utf-8");
    const oldCommit = /self\.__COMMIT__ = "([^"]*)"/.exec(swHead)?.[1] ?? "";
    const oldTime = /self\.__BUILD_TIME__ = "([^"]*)"/.exec(swHead)?.[1] ?? "";
    const oldName = /\.\/assets\/([^"]+\.js)/.exec(swHead)?.[1];
    if (!oldCommit || !oldName) throw new Error("빌드본에 커밋·번들 이름이 없다 — 빌드를 다시 한다");
    const newName = `l-${rebuild.tag}.js`;
    const js = readFileSync(join(dir, "assets", oldName), "utf-8")
      .split(JSON.stringify(oldCommit)).join(JSON.stringify(rebuild.commit))
      .split(JSON.stringify(oldTime)).join(JSON.stringify(rebuild.time));
    writeFileSync(join(dir, "assets", newName), js, "utf-8");
    rmSync(join(dir, "assets", oldName));
    // ② 문서가 가리키는 이름
    writeFileSync(join(dir, "l.html"),
      readFileSync(join(dir, "l.html"), "utf-8").split(oldName).join(newName), "utf-8");
    // ③ 워커의 판본 머리 — 사전 캐시 목록·판본·커밋·빌드 시각
    writeFileSync(join(dir, "sw.js"), swHead
      .split(oldName).join(newName)
      .split(JSON.stringify(oldCommit)).join(JSON.stringify(rebuild.commit))
      .split(JSON.stringify(oldTime)).join(JSON.stringify(rebuild.time))
      .replace(/self\.__BUILD__ = "[^"]*"/, `self.__BUILD__ = "${rebuild.tag}"`), "utf-8");
  }

  if (marker !== undefined) {
    const p = join(dir, "l.html");
    const html = readFileSync(p, "utf-8").replace(
      '<meta charset="utf-8">',
      `<meta charset="utf-8">\n  <meta name="s2s-deploy" content="${marker}">`);
    writeFileSync(p, html, "utf-8");
  }
  if (legacySw) {
    // 빌드가 넣어 준 머리(`__PRECACHE__`·`__BUILD__`…)는 그대로 두고 **본문만** 옛 판으로.
    // 옛 판은 `__COMMIT__`·`__BUILD_TIME__`을 안 읽지만 남아 있어도 무해하다.
    const cur = readFileSync(join(dir, "sw.js"), "utf-8");
    const head = cur.split("\n").filter(l => l.startsWith("self.__")).join("\n");
    writeFileSync(join(dir, "sw.js"),
                  head + "\n" + readFileSync(join(HERE, "fixtures", "legacy_sw.js"), "utf-8"),
                  "utf-8");
  }
  return dir;
}

/** 두 디렉터리의 `sw.js`가 바이트까지 같은가 — 대조가 «전략 하나»의 비교인지 확인한다 */
function sameSw(a: string, b: string): boolean {
  return readFileSync(join(a, "sw.js"), "utf-8") === readFileSync(join(b, "sw.js"), "utf-8");
}

test.beforeAll(async () => {
  test.skip(!existsSync(join(DIST, "l.html")),
            "빌드본이 없다 — `npm run build`를 먼저 돌린다(미실행은 반증이 아니다, #32)");
  ROOTS.set(SUB, DIST);
  TMP = mkdtempSync(join(tmpdir(), "s2s-deploy-"));
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const prefix = [...ROOTS.keys()].find(k => url.pathname.startsWith(k));
    if (!prefix) { res.statusCode = 404; res.end("nope"); return; }
    let p = url.pathname.slice(prefix.length) || "/";
    if (p.endsWith("/")) p += "l.html";
    try {
      const buf = await readFile(join(ROOTS.get(prefix)!, p));
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
  if (TMP) { try { rmSync(TMP, { recursive: true, force: true }); } catch { /* 임시 파일이다 */ } }
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
      "**재배포 팔은 `vite build`를 두 번 돌린 것이 아니다**(#32 — 미실행을 반증으로 안 쓴다) — "
        + "`dist/`의 **변형본**이다. ④의 ①단계는 `l.html`만, ②단계는 번들 이름·번들 안의 커밋 "
        + "상수·`sw.js` 판본 머리까지 바꾼다(실제 재빌드의 서명). 변형본을 쓰는 이유는 대조군이 "
        + "성립해야 하기 때문이다: 두 팔의 차이가 **fetch 전략 하나**여야 하므로 두 판본의 "
        + "`sw.js`가 바이트까지 같아야 한다(`sw_bytes_equal`이 그 조건을 잰다)",
      "**HTTP 캐시의 몫** — 이 서버는 `Cache-Control`·`ETag`를 안 보낸다. 실제 Pages는 "
        + "`max-age`를 보내므로 **CDN·브라우저 HTTP 캐시가 추가로 늦출 수 있다.** "
        + "여기서 재는 것은 **서비스 워커 전략**뿐이다",
      "**아이패드 사파리의 갱신 거동** — 여기는 chromium이다",
    ],
    condition: {
      server: `Node 정적 서버(이 스펙이 띄운다) · 하위 경로 ${SUB}(재배포 팔은 ${SUB_NEW}·${SUB_OLD}) · 포트 ${PORT}`,
      build: "`npm run build` 산출물(`dist/`). 빌드본이 없으면 **건너뛴다**(#32)",
      browser: "chromium(Playwright) · 1440×900 · deviceScaleFactor 1",
      scopes: "재배포 팔은 **scope를 가른다**(#53) — 앞 팔의 워커·캐시가 뒤 팔을 잡으면 결론이 뒤집힌다",
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

  // ①-b **빌드 식별자가 화면에 있다**(17차 지시 0-1) — 그리고 그 값이 **워커가 든 값과 같다**.
  //     표시와 워커가 갈리면 "지금 뜬 것이 어느 판인가"를 표시로 판정할 수 없다(#17: 한 출처).
  const shown = await page.evaluate(() => ({
    barText: document.querySelector("#bar .build")?.textContent ?? null,
    barTitle: document.querySelector("#bar .build")?.getAttribute("title") ?? null,
    api: (window as any).S2S.version(),
  }));
  const swSaid = /self\.__COMMIT__ = "([^"]*)"/
    .exec(readFileSync(join(DIST, "sw.js"), "utf-8"))?.[1] ?? null;
  expect(shown.barText).toBeTruthy();
  expect(shown.api.commit).toBe(swSaid);
  expect(shown.barText).toContain(shown.api.commit);
  led.version_display = {
    bar_text: shown.barText, bar_title: shown.barTitle,
    api_commit: shown.api.commit, api_time: shown.api.time,
    sw_commit: swSaid, display_matches_worker: shown.api.commit === swSaid,
    reading: "**하단바 구석의 값 = 앱이 든 값 = 워커가 든 값.** 셋이 한 출처(`vite.config.ts`의 "
      + "`STAMP`)에서 온다. ⚠ 해시 자체는 **매 빌드 바뀌므로 문서에 안 적는다**(#47) — "
      + "적는 것은 이 필드의 자리뿐이다",
  };

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

/**
 * ④ **재배포가 실제로 나간다**(2026-08-19 17차 지시 0-4).
 *
 * 사람이 겪은 것: *"새로고침 여러 번으로도 안 바뀌었고, 캐시를 지워야 했다."*
 * 여기서 그 상황을 만든다 — 1차 배포를 캐시에 넣고, 같은 주소에 2차를 올리고, 새로고침한다.
 *
 * 두 단계로 나눈 이유는 **두 고장이 따로이기 때문**이다:
 *   ① `l.html`만 바뀐 배포 — `sw.js`가 **바이트까지 같다.** 워커는 안 바뀌므로
 *      **cache-first면 영영 못 받는다.** 새 전략(network-first 문서)은 한 번에 받는다
 *   ② 번들까지 바뀐 배포 — 워커가 바뀐다. **갱신 알림**이 뜨고 그 버튼이 새 판을 연다
 *
 * ⚠ ①에서 **알림은 안 뜬다**(워커가 안 바뀌었다). 그것을 반례로 함께 잰다 —
 * 알림이 아무 때나 뜨면 사용자는 그것을 무시하게 되고, 그러면 ②가 무의미해진다.
 */
test("[회귀] 재배포가 나간다 — 문서만 바뀐 배포 · 번들까지 바뀐 배포 · 갱신 알림", async ({ page }) => {
  const A = variant("new_a");                              // 1차 배포
  const B = variant("new_b", { marker: "B" });             // ① 문서만 바뀐 배포
  const C = variant("new_c", { marker: "C",                // ② 진짜 2차 빌드
    rebuild: { commit: "c0ffee1", time: "2026-08-19T09:00:00.000Z", tag: "cccccccc" } });
  // 대조 조건 — ①은 워커가 **바이트까지 같아야** "전략의 몫"이 갈린다
  expect(sameSw(A, B)).toBe(true);
  expect(sameSw(A, C)).toBe(false);

  const read = () => page.evaluate(() => ({
    marker: document.querySelector('meta[name="s2s-deploy"]')?.getAttribute("content") ?? null,
    commit: (window as any).S2S?.version?.().commit ?? null,
    updateShown: !!(window as any).S2S?.updateShown?.(),
    controlled: !!navigator.serviceWorker.controller,
  }));

  ROOTS.set(SUB_NEW, A);
  await page.goto(`http://localhost:${PORT}${SUB_NEW}/l.html`);
  await page.waitForFunction(() => !!(window as any).S2S);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.reload();                       // 1차가 캐시에 들어간 상태를 만든다
  await page.waitForFunction(() => !!(window as any).S2S);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  // **기준선을 팔 안에서 읽는다**(#53) — 앞 팔이 남긴 장면을 물려받지 않는다
  const before = await read();
  expect(before.marker).toBe(null);
  expect(before.controlled).toBe(true);

  // ---- ① 문서만 바뀐 배포 → **새로고침 한 번**에 받는다
  ROOTS.set(SUB_NEW, B);
  await page.reload();
  await page.waitForFunction(() => !!(window as any).S2S);
  const afterDoc = await read();
  expect(afterDoc.marker).toBe("B");
  // **반례**: 워커가 안 바뀌었으므로 알림이 뜰 이유가 없다
  expect(afterDoc.updateShown).toBe(false);

  // ---- ② 번들까지 바뀐 배포 → 알림이 뜬다
  ROOTS.set(SUB_NEW, C);
  // 주기(`SW_UPDATE_POLL_MS`)를 기다리지 않고 **직접 묻는다** — 그래야 이 원장의 어떤 수도
  // 그 주기에 안 걸린다(그래서 그 상수는 해시된 공유 상수가 아니다 — `UNHASHED_THRESHOLDS`)
  await page.evaluate(() => navigator.serviceWorker.getRegistration()
    .then(r => r?.update()).catch(() => null));
  await page.waitForFunction(() => !!(window as any).S2S?.updateShown?.(), undefined,
                             { timeout: 20_000 });
  const bannerText = await page.locator("#update").innerText();
  expect(bannerText).toContain("새 버전");

  // ---- 알림의 버튼을 **앱 경로 그대로** 누른다(#17)
  //      ⚠ 버튼은 저장을 내려놓은 **뒤에** 새로고침한다(비동기) — 클릭 직후에 읽으면
  //      옛 문맥이 항해로 사라지는 자리에서 읽게 된다(실제로 걸렸다). `load`를 기다린다
  await Promise.all([
    page.waitForEvent("load"),
    page.click('#update [data-update="reload"]'),
  ]);
  await page.waitForFunction(() => !!(window as any).S2S);
  const afterBundle = await read();
  expect(afterBundle.marker).toBe("C");
  expect(afterBundle.commit).toBe("c0ffee1");     // **번들 안의 값까지 새 판이다**
  expect(afterBundle.updateShown).toBe(false);    // 눌렀으니 사라진다

  led.sw_update = {
    sw_bytes_equal: { a_vs_b: sameSw(A, B), a_vs_c: sameSw(A, C) },
    before, after_doc_only: afterDoc, after_rebuild: afterBundle,
    banner_text: bannerText,
    reading: "**1회 새로고침에 문서가 바뀌고**(`after_doc_only.marker`), 워커가 바뀐 재배포에서는 "
      + "**알림이 뜨고 그 버튼이 번들까지 새 판으로 연다**(`after_rebuild.commit`). "
      + "⚠ `after_doc_only.updateShown`이 **거짓인 것이 반례다** — 알림은 워커가 바뀔 때만 뜬다.",
  };
});

/**
 * ⑤ **양성 채널**(#44) — ④가 무엇의 효력인지 가른다.
 *
 * **같은 재배포**(`l.html`만 바뀐 것, `sw.js`는 바이트까지 동일)를 **옛 판**에 준다.
 * 옛 판은 문서까지 cache-first였으므로 **못 받아야** 한다. 못 받으면 ④의 통과는
 * "어차피 되는 것"이 아니라 **network-first 문서의 효력**이다.
 *
 * ⚠ scope를 가른다(`/DEPLOY_OLD`) — 앞 팔의 워커가 이 팔의 새로고침을 잡으면 결론이 뒤집힌다.
 * 이 스펙은 실제로 그렇게 한 번 무효가 됐다(위 「팔 A」 철회문 · #53).
 */
test("[양성 채널] 옛 판(전부 cache-first)은 같은 재배포를 못 받는다", async ({ page }) => {
  const A = variant("old_a", { legacySw: true });
  const B = variant("old_b", { marker: "B", legacySw: true });
  expect(sameSw(A, B)).toBe(true);        // 차이는 `l.html` 하나 — 즉 전략의 비교다

  const marker = () => page.evaluate(() =>
    document.querySelector('meta[name="s2s-deploy"]')?.getAttribute("content") ?? null);

  ROOTS.set(SUB_OLD, A);
  await page.goto(`http://localhost:${PORT}${SUB_OLD}/l.html`);
  await page.waitForFunction(() => !!(window as any).S2S);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const before = await marker();          // 기준선을 팔 안에서(#53)
  expect(before).toBe(null);

  // ---- 같은 재배포를 준다. **새로고침을 여러 번 한다** — 사람이 실제로 한 것이 그것이다
  ROOTS.set(SUB_OLD, B);
  const seen: (string | null)[] = [];
  for (let i = 0; i < 3; i++) {
    await page.reload();
    await page.waitForFunction(() => !!(window as any).S2S);
    seen.push(await marker());
  }
  expect(seen).toEqual([null, null, null]);   // **못 받는다 — 그것이 이 팔의 통과다**

  // ---- 캐시를 지우면 받는다: 못 받은 것이 **캐시 때문**임을 확인한다(원인 지목)
  await page.evaluate(async () => {
    for (const k of await caches.keys()) await caches.delete(k);
  });
  await page.reload();
  await page.waitForFunction(() => !!(window as any).S2S);
  const afterClear = await marker();
  expect(afterClear).toBe("B");

  led.sw_strategy_control = {
    sw_bytes_equal: sameSw(A, B), before, reloads_seen: seen, after_cache_clear: afterClear,
    reading: "**옛 판은 새로고침 3회로도 못 받고**(`reloads_seen`이 전부 `null`) "
      + "**캐시를 지우면 받는다**(`after_cache_clear`). 사람이 겪은 그 상황이 이 팔이다 — "
      + "*'새로고침 여러 번으로도 안 바뀌었고, 캐시를 지워야 했다'*. "
      + "④의 통과는 따라서 **문서를 network-first로 돌린 것의 효력**이다. "
      + "⚠ 두 판본의 `sw.js`가 **바이트까지 같다**(`sw_bytes_equal`) — 두 팔의 차이는 전략 하나뿐이다.",
  };
});
