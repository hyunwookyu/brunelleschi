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
import { spawnSync } from "node:child_process";
import { resolve, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { gate } from "../test/gate.js";

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
  /**
   * **번들 안의 커밋 상수만 바꾼다**(`sw.js`는 안 건드린다) — `display_matches_worker`의
   * **양성 채널**(#5의 판별법: 틀린 값을 넣어 그 지표가 움직이는지 본다 · 17차 리뷰어 [7]).
   * 이런 판본은 실제로는 «플러그인이 번들과 워커에 다른 값을 넣은 빌드»에 해당한다.
   */
  skewCommit?: string;
}

function variant(name: string, opts: VariantOpts = {}): string {
  const { marker, legacySw, rebuild, skewCommit } = opts;
  const dir = join(TMP, name);
  cpSync(DIST, dir, { recursive: true });

  if (skewCommit) {
    const swHead = readFileSync(join(dir, "sw.js"), "utf-8");
    const oldCommit = /self\.__COMMIT__ = "([^"]*)"/.exec(swHead)?.[1] ?? "";
    const bundle = /\.\/assets\/([^"]+\.js)/.exec(swHead)?.[1];
    if (!oldCommit || !bundle) throw new Error("빌드본에 커밋·번들 이름이 없다");
    writeFileSync(join(dir, "assets", bundle),
      readFileSync(join(dir, "assets", bundle), "utf-8")
        .split(JSON.stringify(oldCommit)).join(JSON.stringify(skewCommit)), "utf-8");
  }

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

/**
 * **실제 두 번째 `vite build`**(2026-08-20 17차 2차 리뷰어 [8] — 지시 0-4 «빌드를 두 번 하고»).
 *
 * 변형본으로 하던 것을 **진짜 재빌드**로 바꾼다. 대조군(⑤)은 여전히 변형본을 써야 하지만
 * (두 판본의 `sw.js`가 바이트까지 같아야 «전략 하나»의 비교가 선다), ④의 ②단계는 그 제약이
 * **없는 자리**다 — 거기서는 워커가 바뀌는 것이 요점이기 때문이다.
 *
 * 커밋은 같으므로 갈리는 것은 **빌드 시각**이다. 그리고 그것이 이 항목이 고친 바로 그 자리다:
 * 옛 판본 규칙(`sha256(파일 이름 목록)`)에서는 **같은 커밋의 재빌드가 같은 `sw.js`를 냈다.**
 * 이제는 시각이 판본에 들어가므로 `sw.js`가 바뀌고, 화면의 빌드 시각도 바뀐다 —
 * **표식을 심을 필요가 없다. `S2S.version().time`이 그 자리를 든다.**
 *
 * 빌드가 안 되면 **건너뛴다**(#32 — 미실행을 반증으로 안 쓴다).
 */
function realRebuild(name: string, buildTime: string): { dir: string; err: string } {
  const dir = join(TMP, name);
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const r = spawnSync(npx, ["vite", "build", "--outDir", dir, "--emptyOutDir"], {
    cwd: resolve(HERE, ".."),
    env: { ...process.env, S2S_BUILD_TIME: buildTime },
    encoding: "utf-8",
    shell: process.platform === "win32",
  });
  if (r.status !== 0 || !existsSync(join(dir, "l.html")) || !existsSync(join(dir, "sw.js"))) {
    return { dir, err: `vite build 실패(status ${r.status}) — ${String(r.stderr).slice(0, 300)}` };
  }
  return { dir, err: "" };
}

/** 두 디렉터리의 `sw.js`가 바이트까지 같은가 — 대조가 «전략 하나»의 비교인지 확인한다 */
function sameSw(a: string, b: string): boolean {
  return readFileSync(join(a, "sw.js"), "utf-8") === readFileSync(join(b, "sw.js"), "utf-8");
}

/**
 * **두 전략이 실제로 무엇이 다른가**를 원장이 스스로 말하게 한다(17차 리뷰어 [4]).
 * "차이는 fetch 전략 하나"라는 주장은 필드로 뒷받침돼야 한다 — 두 `sw.js` 본문에서
 * 전략을 가르는 표지를 세어 낸다. ⚠ 이것은 **본문 대조**이지 동작의 증명이 아니다;
 * 동작은 두 팔의 결과(`reloads_seen` ↔ `after_doc_only`)가 말한다.
 */
function swTraits(dir: string) {
  const all = readFileSync(join(dir, "sw.js"), "utf-8");
  // ⚠ **주입된 머리를 뺀 본문만 본다.** 머리(`self.__PRECACHE__`…)는 **빌드가 넣는 것**이라
  //   옛 판 변형본에도 현행 빌드의 값이 그대로 얹힌다 — 머리를 세면 «옛 판도 커밋을 든다»가
  //   나와 산문과 어긋난다(실제로 초판이 그랬다. 이 자리가 #47의 모양이다).
  //   이 팔이 판본 규칙을 **상수로 잡고 있다는 것**이 요점이므로 머리는 대조 대상이 아니다.
  const t = all.split("\n").filter(l => !l.startsWith("self.__")).join("\n");
  return {
    network_first_documents: /function networkFirst/.test(t) && /req\.mode === "navigate"/.test(t),
    stale_while_revalidate_assets: /e\.waitUntil\(net/.test(t),
    skip_waiting: /skipWaiting\(\)/.test(t),
    clients_claim: /clients\.claim\(\)/.test(t),
    /** 본문이 커밋·빌드 시각을 **읽는가**(판본·진단에 쓰는가). 머리의 존재가 아니라 사용이다 */
    body_reads_commit: /self\.__COMMIT__/.test(t),
    body_bytes: t.length,
  };
}

test.beforeAll(async () => {
  test.skip(!existsSync(join(DIST, "l.html")),
            "빌드본이 없다 — `npm run build`를 먼저 돌린다(미실행은 반증이 아니다, #32)");
  ROOTS.set(SUB, DIST);
  TMP = mkdtempSync(join(tmpdir(), "s2s-deploy-"));
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    // ⚠ **경계를 보고 긴 것부터 고른다.** 단순 `startsWith`면 `/DEPLOY_OLD2/l.html`이
    //   `/DEPLOY_OLD`에 걸려 남은 경로가 `2/l.html`이 된다(실제로 걸렸다 — 새 팔이
    //   120초 타임아웃으로 죽었고 원인은 서버 라우팅이었다).
    const prefix = [...ROOTS.keys()].sort((a, b) => b.length - a.length)
      .find(k => url.pathname === k || url.pathname.startsWith(k + "/"));
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
        + "⚠ **④의 ②단계는 2026-08-20에 진짜 `vite build` 재실행으로 바꿨다**(2차 리뷰어 [8]) — "
        + "변형본이 남은 곳은 **④의 ①단계와 대조군 ⑤**다. 거기서 변형본을 쓰는 이유는 "
        + "**그 팔 안에서 두 판본의 `sw.js`가 바이트까지 같아야** 하기 때문이다"
        + "(`sw_bytes_equal`이 그 조건을 잰다). ⚠⚠ 그것은 **팔 안의 성질**이고 "
        + "**두 팔 사이의 차이를 «fetch 전략 하나»로 만들지 않는다** — 두 본문은 판본 규칙도 "
        + "다르다(`sw_traits`). 그 정정은 `sw_strategy_control.reading`에 있다",
      "**HTTP 캐시의 몫** — 이 서버는 `Cache-Control`·`ETag`를 안 보낸다. 실제 Pages는 "
        + "`max-age`를 보내므로 **CDN·브라우저 HTTP 캐시가 추가로 늦출 수 있다.** "
        + "여기서 재는 것은 **서비스 워커 전략**뿐이다",
      "**아이패드 사파리의 갱신 거동** — 여기는 chromium이다",
      "**주기 폴링의 실제 발화**(`swUpdate.ts`의 폴링 주기 상수 · 17차 리뷰어 [10]) — "
        + "⚠ 그 상수 이름을 여기 적지 않는다: `selfcheck.scan_unhashed_thresholds`가 "
        + "«해시 밖 임계가 원장에 나타났다»로 잡는다(그 검사가 지키는 전제는 «어떤 원장 값도 "
        + "그 상수에 의존하지 않는다»이고, 이름이 원장에 있으면 그 전제가 흐려진다). "
        + "④의 ②단계는 주기를 "
        + "기다리지 않고 `registration.update()`를 **직접 부른다**. 즉 «열어 둔 탭이 스스로 "
        + "새 판을 알아채는가»는 **이 스펙이 안 잰다**. 단위 팔(`test/sw_update.test.ts`)이 "
        + "가짜 문서로 «보이면 부르고 숨으면 안 부른다»까지만 든다 — 실제 타이머 발화는 미측정",
      "**«영구히 안 바뀐다»는 관측이 아니라 기전 논증이다**(17차 리뷰어 [5] · #12) — 대조군이 "
        + "실제로 관측한 것은 **새로고침 3회**다(`sw_strategy_control.reloads_seen`, n = 3). "
        + "«영구히»는 «워커 바이트가 같으면 브라우저가 새 워커를 안 잡고, cache-first는 캐시가 "
        + "있는 한 네트워크를 안 본다»는 기전에서 나온 것이지 이 팔의 수가 아니다",
    ],
    condition: {
      server: `Node 정적 서버(이 스펙이 띄운다) · 하위 경로 ${SUB} · 포트 ${PORT}. `
        + `**팔마다 scope를 가른다**(#53): ${SUB_NEW}(재배포) · ${SUB_OLD}(옛 판 · 문서만) · `
        + `${SUB_OLD}2(옛 판 · 재빌드) · /DEPLOY_SKEW(표시↔워커 양성 채널). `
        + `⚠ 서버는 **경계를 보고 긴 접두사부터** 고른다 — 단순 접두사 비교면 `
        + `${SUB_OLD}2가 ${SUB_OLD}에 걸린다(실제로 걸렸다)`,
      build: "`npm run build` 산출물(`dist/`). 빌드본이 없으면 **건너뛴다**(#32)",
      browser: "chromium(Playwright) · 1440×900 · deviceScaleFactor 1",
      scopes: "재배포 팔은 **scope를 가른다**(#53) — 앞 팔의 워커·캐시가 뒤 팔을 잡으면 결론이 뒤집힌다",
    },
    /**
     * **팔 수를 스스로 적는다**(9차 지시 c · 2026-08-20 2차 리뷰어 [9]) —
     * `tools/testCost.mjs`의 `declared_scenarios`가 이 필드를 읽는다. 팔이 늘면 이 수가 는다.
     */
    arms: {
      l_d2: "① 하위 경로 열림 ② scope ③ 오프라인 + 빌드 식별자 표시",
      version_skew: "표시↔워커 양성 채널(번들 커밋만 틀어 놓은 판본)",
      offline_control: "캐시에서 번들을 지우면 오프라인 새로고침이 깨진다",
      redeploy_doc_only: "④① 문서만 바뀐 재배포 — 새로고침 1회",
      redeploy_rebuild: "④② 진짜 두 번째 vite build — 알림 + 번들·캐시 교체",
      legacy_doc_only: "⑤ 옛 판 · 문서만 바뀐 재배포(3회)",
      legacy_rebuild: "⑤ 옛 판 · 워커가 바뀌는 재배포(3회) — ②의 하한",
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
  // ①-c **양성 채널**(#5의 판별법 · 17차 리뷰어 [7]) — `display_matches_worker`가 참인 것이
  //      «배선이 맞다»인지 «이 지표가 아무것도 안 가른다»인지 갈려야 한다. **번들 안의 커밋만
  //      틀어 놓은 판본**(워커는 그대로)을 다른 scope에 올려 그 값이 **거짓이 되는지** 본다.
  //      그런 판본은 실제로는 «플러그인이 번들과 워커에 다른 값을 넣은 빌드»다.
  const SKEW = "/DEPLOY_SKEW";
  ROOTS.set(SKEW, variant("skew", { skewCommit: "deadbee" }));
  const skewPage = await page.context().newPage();
  await skewPage.goto(`http://localhost:${PORT}${SKEW}/l.html`);
  await skewPage.waitForFunction(() => !!(window as any).S2S);
  const skew = await skewPage.evaluate(() => (window as any).S2S.version().commit);
  // 「화면 = 앱」 다리도 틀어 놓은 팔에서 관측한다(2차 리뷰어 [4])
  const skewBar = await skewPage.evaluate(() =>
    document.querySelector("#bar .build")?.textContent ?? null);
  await skewPage.close();
  const skewSwSaid = /self\.__COMMIT__ = "([^"]*)"/
    .exec(readFileSync(join(ROOTS.get(SKEW)!, "sw.js"), "utf-8"))?.[1] ?? null;
  expect(skew).toBe("deadbee");
  expect(skew === skewSwSaid).toBe(false);      // **틀어 놓으면 거짓이 된다**

  led.version_display = {
    bar_text: shown.barText, bar_title: shown.barTitle,
    api_commit: shown.api.commit, api_time: shown.api.time,
    sw_commit: swSaid, display_matches_worker: shown.api.commit === swSaid,
    positive_channel: {
      arm: "번들 안의 커밋만 `deadbee`로 틀고 `sw.js`는 그대로 둔 판본(scope " + SKEW + ")",
      app_commit: skew, bar_text: skewBar, sw_commit: skewSwSaid,
      display_matches_worker: skew === skewSwSaid,
      bar_matches_app: !!skewBar && skewBar.includes(skew),
      reading: "**틀어 놓으면 거짓이 된다** — 그러므로 위의 참은 항등이 아니라 배선의 관측이다"
        + "(#5의 판별법: 틀린 값을 넣어 지표가 움직이는지 본다).",
    },
    what_this_does_not_say: "⚠⚠ **이 값은 «옛 번들이 왔다»를 못 잡는다**(2026-08-20 2차 "
      + "리뷰어 [4]). 사람이 겪은 고장에서는 옛 번들과 옛 워커가 **함께** 남으므로 둘이 서로 "
      + "일치하고 이 필드는 **참**이 된다. 이 필드가 잡는 것은 «한 배포 안에서 번들과 워커가 "
      + "갈린 빌드»(양성 채널이 만든 그 판본)뿐이다. **«지금 뜬 것이 최신인가»를 판정하는 것은 "
      + "이 필드가 아니라 사람이다** — 화면의 해시를 방금 푸시한 커밋과 견주는 절차"
      + "(README §1.5)가 그 자리이고, 자동으로 하는 것은 ④의 재배포 팔이다.",
    reading: "**하단바 구석의 값 = 앱이 든 값 = 워커가 든 값.** 셋이 한 출처(`vite.config.ts`의 "
      + "`STAMP`)에서 오지만 **경로가 갈린다** — 하나는 번들에 인라인되고 하나는 `sw.js` 머리에 "
      + "붙는다. 그 둘이 갈리는 빌드가 실제로 만들어질 수 있고(위 양성 채널이 그 판본이다), "
      + "그때 이 필드가 거짓이 된다. ⚠ 해시 자체는 **매 빌드 바뀌므로 문서에 안 적는다**(#47) — "
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
 *   ② **진짜 두 번째 `vite build`** — 워커가 바뀐다. **갱신 알림**이 뜨고 그 버튼이 새 판을 연다
 *      (2026-08-20 2차 리뷰어 [8]로 변형본에서 실제 재빌드로 바꿨다 — 지시 0-4 문면)
 *
 * ⚠ ①에서 **알림은 안 뜬다**(워커가 안 바뀌었다). 그것을 반례로 함께 잰다 —
 * 알림이 아무 때나 뜨면 사용자는 그것을 무시하게 되고, 그러면 ②가 무의미해진다.
 */
test("[회귀] 재배포가 나간다 — 문서만 바뀐 배포 · 번들까지 바뀐 배포 · 갱신 알림", async ({ page }) => {
  const A = variant("new_a");                              // 1차 배포
  const B = variant("new_b", { marker: "B" });             // ① 문서만 바뀐 배포
  // ② **진짜 두 번째 `vite build`**(2차 리뷰어 [8] — 지시 0-4 문면). 변형본이 아니다.
  //    커밋은 같고 **빌드 시각이 다르다** — 그것이 이 항목이 고친 자리다(옛 판본 규칙에서는
  //    같은 커밋의 재빌드가 같은 `sw.js`를 냈다). 표식을 안 심는다: `version().time`이 든다.
  const REBUILD_TIME = "2026-08-20T09:00:00.000Z";
  const built = realRebuild("new_c", REBUILD_TIME);
  test.skip(!!built.err, `두 번째 빌드가 안 돌았다 — ${built.err} (미실행은 반증이 아니다, #32)`);
  const C = built.dir;
  // 대조 조건 — ①은 워커가 **바이트까지 같아야** "전략의 몫"이 갈린다
  expect(sameSw(A, B)).toBe(true);
  expect(sameSw(A, C)).toBe(false);        // 재빌드는 판본이 바뀐다(시각이 들어간다)

  const read = () => page.evaluate(() => ({
    marker: document.querySelector('meta[name="s2s-deploy"]')?.getAttribute("content") ?? null,
    commit: (window as any).S2S?.version?.().commit ?? null,
    build_time: (window as any).S2S?.version?.().time ?? null,
    updateShown: !!(window as any).S2S?.updateShown?.(),
    controlled: !!navigator.serviceWorker.controller,
  }));
  /** **남아 있는 캐시 이름**(2차 리뷰어 [13]) — 0-2c «옛 캐시 무효화»를 원장이 들게 한다 */
  const cacheNames = () => page.evaluate(() => caches.keys());

  ROOTS.set(SUB_NEW, A);
  await page.goto(`http://localhost:${PORT}${SUB_NEW}/l.html`);
  await page.waitForFunction(() => !!(window as any).S2S);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.reload();                       // 1차가 캐시에 들어간 상태를 만든다
  await page.waitForFunction(() => !!(window as any).S2S);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  // **기준선을 팔 안에서 읽는다**(#53) — 앞 팔이 남긴 장면을 물려받지 않는다
  const before = { ...await read(), shown_before_click: false, caches: await cacheNames() };
  expect(before.marker).toBe(null);
  expect(before.controlled).toBe(true);

  // ---- ① 문서만 바뀐 배포 → **새로고침 한 번**에 받는다
  ROOTS.set(SUB_NEW, B);
  await page.reload();
  await page.waitForFunction(() => !!(window as any).S2S);
  // ⚠ **«떴다»를 이 행도 자기 필드로 든다**(2차 리뷰어 [3]) — `updateShown` 하나로는
  //   «안 떴다»와 «눌러서 사라졌다»가 안 갈린다. 이 행은 누른 적이 없으므로 둘이 같다
  const afterDoc = { ...await read(), shown_before_click: await page.evaluate(
    () => !!(window as any).S2S.updateShown()), caches: await cacheNames() };
  expect(afterDoc.marker).toBe("B");
  // **반례**: 워커가 안 바뀌었으므로 알림이 뜰 이유가 없다
  expect(afterDoc.shown_before_click).toBe(false);
  // 그리고 **캐시 이름이 그대로다** — 판본이 안 바뀌었으니 무효화할 것도 없다
  expect(afterDoc.caches).toEqual(before.caches);

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
  // ⚠ **«떴다»를 그 행의 필드로 남긴다**(17차 리뷰어 [8]) — 세 행이 전부 `updateShown: false`라
  //   («안 떴다»와 «눌러서 사라졌다»가 같은 값이다) 표만 보면 ②의 통과가 안 읽힌다
  const shownBeforeClick = await page.evaluate(() => !!(window as any).S2S.updateShown());

  // ---- 알림의 버튼을 **앱 경로 그대로** 누른다(#17)
  //      ⚠ 버튼은 저장을 내려놓은 **뒤에** 새로고침한다(비동기) — 클릭 직후에 읽으면
  //      옛 문맥이 항해로 사라지는 자리에서 읽게 된다(실제로 걸렸다). `load`를 기다린다
  await Promise.all([
    page.waitForEvent("load"),
    page.click('#update [data-update="reload"]'),
  ]);
  await page.waitForFunction(() => !!(window as any).S2S);
  const afterBundle = { ...await read(), caches: await cacheNames() };
  // **번들 안의 값까지 새 판이다** — 진짜 재빌드라 커밋은 같고 **빌드 시각이 갈린다**
  expect(afterBundle.build_time).toBe(REBUILD_TIME);
  expect(afterBundle.build_time).not.toBe(before.build_time);
  expect(afterBundle.updateShown).toBe(false);    // 눌렀으니 사라진다
  // **옛 캐시가 무효화됐다**(0-2c) — 남은 이름이 하나이고 그것이 전과 다르다
  expect(afterBundle.caches).not.toEqual(before.caches);
  expect(afterBundle.caches.length).toBe(1);

  led.sw_update = {
    gate: gate({
      registered: "① `l.html`만 바뀐 재배포가 **새로고침 1회**에 문서로 나온다"
        + "(`after_doc_only.marker === \"B\"`) · ② **진짜 두 번째 `vite build`**에서 알림이 뜨고"
        + "(`after_rebuild.shown_before_click`) 그 버튼이 **번들 안의 빌드 시각까지** 새 판으로 "
        + "연다(`after_rebuild.build_time`) · ③ 그때 **옛 캐시가 사라진다**(0-2c — `caches` 비교). "
        + "⚠ **#26 표기를 정정한다**(2차 리뷰어 [6]): 이 세 조항의 **단언은 커밋 `9c2e137`의 "
        + "스펙에 이미 있었지만**(측정 전 등록), **`gate` 블록 자체는 1차 리뷰어 [6] 대응으로 "
        + "뒤에 쓰였다.** 즉 «사전 등록된 단언의 사후 게이트화»다. "
        + "⚠⚠ 기준값 `\"B\"`·빌드 시각은 **픽스처가 정한 값이다**(#46) — 그 크기에 정보가 "
        + "없다. 이 게이트가 재는 것은 크기가 아니라 **어느 판본이 왔는가**다.",
      reachability: "**조항마다 하한이 다르다**(2026-08-20 2차 리뷰어 [2] — 초판은 하나로 "
        + "뭉뚱그렸다). ① **하한이 있다**: 같은 재배포(문서만)를 옛 판에 주면 새로고침 3회로도 "
        + "못 받는다(`sw_strategy_control.reloads_seen`) — 자명한 기준이 아니다. "
        + "② **하한이 없다 — 그리고 그것이 관측이다**: 옛 판에 **재빌드**를 주면 "
        + "`sw_strategy_control.rebuild_arm`이 그 결과를 든다. 워커 바이트가 바뀌면 "
        + "옛 판도 `skipWaiting`+`clients.claim`을 갖고 있어(`sw_traits.legacy`) 통과할 수 "
        + "있다 — 즉 ②를 «옛 판이 못 하는 일»로 읽으면 안 된다. **②가 잡는 것은 알림이지 "
        + "전달이 아니다**(알림은 옛 판에 아예 없다). ③은 판본 규칙의 귀결이라 하한이 "
        + "옛 판본 규칙 자체다. 상한 쪽 오라클은 자명하다(서비스 워커가 없는 브라우저는 늘 "
        + "새 문서를 받는다).",
      reachability_absent: "**도달 가능성의 수치가 없다 — 판정량이 연속량이 아니기 때문이다.** "
        + "이 게이트가 재는 것은 «어떤 문서·번들이 왔는가»(문자열 일치)라 오라클 수치를 "
        + "만들 자리가 없다. 억지로 수를 적으면 그 수는 0·1이 되고 그것이 #40이 금지하는 "
        + "자명한 값이다. ⚠ **면제는 통과가 아니다**(#35) — 대신 이 게이트는 아래 "
        + "`reachability_absent_pair`의 경로들이 이 원장 안에서 **실제로 풀리는 것**을 요구한다. "
        + "⚠⚠ **`version_display.positive_channel`은 이 짝에서 뺐다**(2차 리뷰어 [4]): 그 팔이 "
        + "움직이는 값(`display_matches_worker`)은 이 게이트의 판정량이 아니고, 사람이 겪은 "
        + "고장(옛 번들 + 옛 워커가 함께 남음)에서는 **참이 된다** — 게이트 조항을 뒤집는 "
        + "채널이 아니다.",
      /**
       * **면제가 무조건 통과가 되지 않게 한다**(#40 ⑤ · 2차 리뷰어 [5]).
       * `selfcheck.scan_absent_pairs`가 이 경로들이 같은 원장에서 풀리는지 본다.
       */
      // ⚠ 구분자는 `/`다 — `selfcheck._resolve`의 규약(점은 키 이름에 들 수 있다)
      reachability_absent_pair: [
        "sw_strategy_control/reloads_seen",      // ①의 하한
        "sw_strategy_control/rebuild_arm",       // ②의 하한(관측 — 통과할 수도 있다)
        "sw_update/sw_traits",                   // 두 판본이 무엇이 다른가
      ],
      result: { doc_only_marker: afterDoc.marker, rebuild_build_time: afterBundle.build_time,
                banner_shown_before_click: shownBeforeClick,
                caches_before: before.caches, caches_after: afterBundle.caches },
    }),
    sw_bytes_equal: { a_vs_b: sameSw(A, B), a_vs_c: sameSw(A, C) },
    sw_traits: { new_strategy: swTraits(A) },
    before, after_doc_only: afterDoc,
    after_rebuild: { ...afterBundle, shown_before_click: shownBeforeClick },
    banner_text: bannerText,
    reading: "**1회 새로고침에 문서가 바뀌고**(`after_doc_only.marker`), 워커가 바뀐 재배포에서는 "
      + "**알림이 뜨고**(`after_rebuild.shown_before_click`) 그 버튼이 번들까지 새 판으로 연다"
      + "(`after_rebuild.commit`). ⚠ `after_doc_only.updateShown`이 **거짓인 것이 반례다** — "
      + "알림은 워커가 바뀔 때만 뜬다. ⚠⚠ 세 행의 `updateShown`은 **클릭 뒤의 값**이라 "
      + "②에서도 거짓이다(눌러서 사라졌다) — «떴다»를 드는 필드는 `shown_before_click` 하나다.",
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
test("[양성 채널] 옛 판은 문서만 바뀐 재배포를 못 받는다 — 워커가 바뀌면 받지만 알리지 않는다", async ({ page }) => {
  const A = variant("old_a", { legacySw: true });
  const B = variant("old_b", { marker: "B", legacySw: true });
  const NEW_REF = variant("old_ref");     // 같은 빌드의 **현행** sw.js — 전략 표지 대조용
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

  // ---- 같은 재배포를 준다. **새로고침을 여러 번 한다** — 사람이 실제로 한 것이 그것이다.
  //      ⚠ ④와 **같은 조작을 준다**(17차 리뷰어 [4]): ④의 ②단계가 `registration.update()`를
  //      직접 부르므로 여기서도 부른다. 안 부르면 두 팔의 차이가 «전략»말고 «조작»으로도
  //      갈려 대조가 흐려진다. (부르는 것이 이 팔에 **불리한** 방향이다 — 갱신 기회를 더 준다.)
  ROOTS.set(SUB_OLD, B);
  const seen: (string | null)[] = [];
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => navigator.serviceWorker.getRegistration()
      .then(r => r?.update()).catch(() => null));
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

  // ---- **②의 하한도 잰다**(2차 리뷰어 [2]) — 옛 판에 **워커가 바뀌는 재배포**를 준다.
  //      옛 판도 `skipWaiting`+`clients.claim`을 갖고 있으므로 **받을 수 있다**. 받는다면
  //      «옛 판이 못 하는 일»은 «문서만 바뀐 배포»와 «알림» 둘로 좁혀진다 — 그 좁힘이 결론이다.
  //      ⚠ 별도 scope에서 돌린다(#53) — 이 팔의 캐시·워커를 물려받지 않는다.
  const SUB_OLD2 = "/DEPLOY_OLD2";
  const A2 = variant("old2_a", { legacySw: true });
  const C2 = variant("old2_c", { marker: "C2", legacySw: true,
    rebuild: { commit: "0ldbee1", time: "2026-08-20T10:00:00.000Z", tag: "dddddddd" } });
  ROOTS.set(SUB_OLD2, A2);
  const p2 = await page.context().newPage();
  await p2.goto(`http://localhost:${PORT}${SUB_OLD2}/l.html`);
  await p2.waitForFunction(() => !!(window as any).S2S);
  await p2.waitForFunction(() => !!navigator.serviceWorker.controller);
  await p2.reload();
  await p2.waitForFunction(() => !!navigator.serviceWorker.controller);
  const mark2 = () => p2.evaluate(() =>
    document.querySelector('meta[name="s2s-deploy"]')?.getAttribute("content") ?? null);
  const before2 = await mark2();
  expect(before2).toBe(null);            // 픽스처가 실제로 섰다(안 서면 아래 null이 무의미하다)
  ROOTS.set(SUB_OLD2, C2);
  const seen2: (string | null)[] = [];
  for (let i = 0; i < 3; i++) {
    await p2.evaluate(() => navigator.serviceWorker.getRegistration()
      .then(r => r?.update()).catch(() => null));
    await p2.reload();
    await p2.waitForFunction(() => !!(window as any).S2S);
    seen2.push(await mark2());
  }
  // 알림은 **옛 판에 아예 없다** — 코드에 그 경로가 없으므로 워커가 바뀌어도 안 뜬다
  const banner2 = await p2.evaluate(() => !!(window as any).S2S?.updateShown?.());
  await p2.close();
  expect(banner2).toBe(false);
  expect(sameSw(A2, C2)).toBe(false);      // 이 팔의 재배포는 워커를 바꾼다

  led.sw_strategy_control = {
    /**
     * **②의 하한**(2차 리뷰어 [2]) — 옛 판에 워커가 바뀌는 재배포를 줬을 때.
     * ⚠ **여기서 «옛 판도 받는다»가 나와도 그것은 실패가 아니다** — 그것이 관측이고,
     * 그 관측이 ②의 주장을 «전달»에서 «알림»으로 좁힌다.
     */
    rebuild_arm: {
      sw_bytes_equal: { a2_vs_c2: sameSw(A2, C2) },
      scope: SUB_OLD2, before: before2, reloads_seen: seen2, banner_shown: banner2,
      reading: "옛 판에 **워커가 바뀌는** 재배포를 주면 `reloads_seen`이 그 결과를 든다 — "
        + "옛 판도 `skipWaiting`+`clients.claim`을 가지므로 새 워커가 서면 새 캐시를 채운다. "
        + "**알림은 어느 경우에도 안 뜬다**(`banner_shown` — 옛 판에 그 경로가 없다). "
        + "즉 옛 판이 **못 하는 일 둘**은 ① 문서만 바뀐 배포를 받는 것 ② 새 판이 있다고 "
        + "말하는 것이고, 전달 자체는 워커가 바뀌면 결국 된다.",
    },
    // **옛 판이 어디서 왔는가**(17차 리뷰어 [4]) — 재구성한 스텁이 아니라 **그 커밋의 본문**이다
    legacy_source: {
      file: "web/e2e/fixtures/legacy_sw.js",
      provenance: "2026-08-19 17차 지시 0-2 **이전**의 `web/public/sw.js` 본문을 그대로 뜬 것"
        + "(`git show HEAD:web/public/sw.js`의 본문부 — 빌드가 넣는 머리 4줄은 이 팔이 현행 "
        + "빌드의 것을 그대로 얹는다). 앱 쪽을 고쳐도 이 파일은 안 고친다 — 비교 대상이 "
        + "«옛 판»이어야 비교가 성립한다",
    },
    // ⚠ **어느 두 판본의 비교인지 이름을 붙인다**(④와 같은 규약 — 17차 리뷰어 [4])
    sw_bytes_equal: { a_vs_b: sameSw(A, B) },
    // **두 전략이 실제로 무엇이 다른가**를 본문 표지로 낸다 — "차이는 전략 하나"의 근거
    sw_traits: { legacy: swTraits(A), new_strategy: swTraits(NEW_REF) },
    same_operation_as_arm4: "`registration.update()`를 새로고침마다 부른다(④의 ②단계와 같다)",
    before, reloads_seen: seen, after_cache_clear: afterClear,
    reading: "**옛 판은 새로고침 3회로도 못 받고**(`reloads_seen`이 전부 `null`) "
      + "**캐시를 지우면 받는다**(`after_cache_clear`). 사람이 겪은 그 상황이 이 팔이다 — "
      + "*'새로고침 여러 번으로도 안 바뀌었고, 캐시를 지워야 했다'*. "
      + "④의 통과는 따라서 **문서를 network-first로 돌린 것의 효력**이다. "
      + "⚠ 두 판본의 `sw.js`가 **바이트까지 같다**(`sw_bytes_equal.a_vs_b`) — 이 팔 **안에서** "
      + "재배포가 워커를 안 바꾼다는 뜻이다. **두 팔 사이의 차이**는 `sw_traits`가 든다: "
      + "옛 판은 `network_first_documents`·`stale_while_revalidate_assets`·`body_reads_commit`이 "
      + "거짓이고 `skip_waiting`·`clients_claim`은 **둘 다 참**이다 — 즉 «즉시 인계»는 두 판이 "
      + "같다. ⚠⚠ 그러므로 «두 팔의 차이가 fetch 전략 하나»는 **본문만 보면 정확하지 않다**: "
      + "판본을 무엇으로 만드는가도 함께 다르다(그것이 이 고장의 나머지 절반이다). "
      + "**다만 이 팔에서는 그 차이가 발화하지 않는다** — 두 판본의 `sw.js`가 바이트까지 같고"
      + "(`sw_bytes_equal.a_vs_b`), 어느 판본 규칙이든 같은 바이트는 같은 판본이다. "
      + "그래서 **이 팔에서 실제로 갈리는 것은 문서를 어디서 가져오는가 하나**이고, 그 하나가 "
      + "«3회로도 못 받는다»를 만든다. ⚠ 주입된 머리 4줄은 두 변형본이 **같은 빌드의 것을 "
      + "공유**하므로 대조 대상이 아니다(`swTraits`가 머리를 뺀 본문만 본다).",
  };
});
