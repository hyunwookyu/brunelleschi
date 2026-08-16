import { test } from "@playwright/test";
import { writeFileSync } from "node:fs";
declare global { interface Window { S2S: any } }

test("probe basic flow", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  await page.evaluate(() => new Promise<void>(res => {
    const q = indexedDB.deleteDatabase("sketch2space");
    q.onsuccess = q.onerror = q.onblocked = () => res();
  }));
  await page.reload();
  await page.waitForFunction(() => !!window.S2S);

  const box = await page.locator("#ink").boundingBox();
  const X = (fx: number) => box!.x + box!.width * fx;
  const Y = (fy: number) => box!.y + box!.height * fy;
  const draw = async (x1: number, y1: number, x2: number, y2: number) => {
    await page.mouse.move(X(x1), Y(y1));
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(X(x1 + (x2 - x1) * i / 8), Y(y1 + (y2 - y1) * i / 8));
    await page.mouse.up();
    await page.waitForTimeout(60);
  };

  const st = async (tag: string) => page.evaluate((t) => {
    const S = window.S2S;
    return { tag: t, order: S.order(), standing: S.standing(),
             strokes: S.doc().strokes.length,
             lifted: S.doc().strokes.filter((s: any) => s.seg3d).length,
             channels: S.doc().strokes.map((s: any) => ({ ch: s.channel, l: !!s.seg3d, axis: s.axis })) };
  }, tag);

  // ① 빈 화면에 선 하나 → 화면에 남는가
  await draw(0.3, 0.75, 0.7, 0.75);      // 가로선
  console.log(JSON.stringify(await st("after_horizontal")));
  // ② 깊이선 → 3D
  await draw(0.3, 0.75, 0.45, 0.55);     // 왼아래에서 중앙쪽 기울어진 깊이선
  console.log(JSON.stringify(await st("after_depth")));
  // ③ 세로선
  await draw(0.3, 0.75, 0.3, 0.45);
  console.log(JSON.stringify(await st("after_vertical")));
  // ④ 결과선 채널로 덧긋기 (보조선 위)
  await page.evaluate(() => window.S2S.setChannel("result"));
  await draw(0.3, 0.75, 0.7, 0.75);
  console.log(JSON.stringify(await st("after_result_stroke")));
  // ⑤ 스냅 확인 — 보조선 끝점 근처
  const snap = await page.evaluate(() => {
    const S = window.S2S;
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const w = el.clientWidth, h = el.clientHeight;
    return { targets: S.snapTargets(), at: S.snap([0.3 * w, 0.75 * h]),
             ortho: S.orthoSnap([100, 100], [300, 103]) };
  });
  console.log("SNAP:", JSON.stringify(snap));
  console.log("ERRORS:", JSON.stringify(errors));
  // 잉크·3D 픽셀
  const px = await page.evaluate(() => {
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const g = el.getContext("2d")!;
    const d = g.getImageData(0, 0, el.width, el.height).data;
    let ink = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 10) ink++;
    return { ink };
  });
  console.log("PX:", JSON.stringify(px));
  writeFileSync("probe_shot.png", await page.screenshot());
});
