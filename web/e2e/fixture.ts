// **종단 확인의 공통 픽스처** — 합성 상자를 넣고 **참 소실점으로** 카메라를 세운다.
//
// 왜 따로 뺐나: `e2e/stage.spec.ts` 안에 있던 `setup`을 G의 하네스(`touch_route.spec.ts`)가
// 그대로 필요로 했다. 복사하면 **픽스처가 둘이 되고** 한쪽만 고쳐지는 자리가 생긴다(#17의
// 하네스판이다 — 같은 이름의 장면이 두 값을 갖는다). 그래서 옮기고 둘 다 여기를 부른다.
import type { Page } from "@playwright/test";

declare global {
  interface Window { S2S: any; __SC: any }
}

/**
 * 합성 상자를 넣고 **참 소실점으로** 규칙을 세운다 — 사람이 완벽히 맞춘 극한.
 *
 * `boxes = 2`면 **첫 상자와 면을 맞댄 두 번째 상자**를 함께 넣는다(L-D.3).
 * 상자 하나로는 안 되는 것 셋이 있다:
 *   ① **승격 연쇄가 픽스처 상한에 갇힌다** — 장면당 12획이면 깊이 4가 거의 상한이다
 *   ② 뷰 하나에 **구조가 하나**뿐이라 "이어 그리기"가 같은 덩어리 안에서만 일어난다
 *   ③ 지연·스크린샷 회귀가 **획 24개 규모**에서 어떤지 모른다
 * 두 번째 상자는 `axes[0]` 방향으로 첫 상자의 `a`만큼 밀어 **면을 공유**한다.
 */
export async function setupScene(page: Page, opts: { boxes?: 1 | 2 } = {}) {
  // ⚠⚠ **저장 복원 경쟁을 픽스처에서 끊는다**(2026-08-17 3차에서 간헐 실패로 드러났다).
  // `getDoc2` 복원은 비동기라, 아래 `clear` 클릭과 획 주입 사이의 `await import` 틈에
  // **앞 시험의 자동 저장본**이 끼어들 수 있다 — 그러면 획 수·규칙 상태가 실행마다 갈리고,
  // 상태 패널(물음)이 떠 `#stage` 높이가 변해 **제스처 회전량까지** 달라졌다
  // (`touch_route` dpr 2 팔이 1.2551 ↔ 1.9817로 흔들린 원인). 지우고 새로 연다.
  await page.evaluate(() => new Promise<void>(res => {
    const q = indexedDB.deleteDatabase("sketch2space");
    q.onsuccess = q.onerror = q.onblocked = () => res();
  }));
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as { S2S: unknown }).S2S);
  return page.evaluate(async ({ boxes }) => {
    const S = window.S2S;
    document.querySelector<HTMLButtonElement>('#bar button[data-act="clear"]')!.click();
    const m = await import("/test/scene3d.ts");
    const doc = await import("/src/ui/doc.ts");

    const el = document.getElementById("ink") as HTMLCanvasElement;
    const size: [number, number] = [el.clientWidth, el.clientHeight];
    const sc = m.scene(35, 15, 1000, size);
    const O: [number, number, number] = [0.6, -0.4, 4.2];
    const A = 1.2;
    const edges = m.boxEdges(sc, O, A, 1.0, 0.9);
    if (boxes === 2) {
      // 치수를 달리해 두 상자가 구분되게 한다(같으면 스크린샷에서 어느 쪽인지 안 보인다).
      const e0 = sc.axes[0];
      const O2: [number, number, number] =
        [O[0] + e0[0] * A, O[1] + e0[1] * A, O[2] + e0[2] * A];
      edges.push(...m.boxEdges(sc, O2, 0.9, 1.0, 0.7));
    }
    // 결정론적 난수 — `Math.random` 금지(CLAUDE.md §5)
    let s0 = 12345 >>> 0;
    const r = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296; };
    const drawn = m.drawEdges(sc, edges, "medium", r, 0.37, 0.006, 0);
    for (const e of drawn) S.doc().strokes.push(doc.newSStroke(e.pts2d, S.doc().currentView));
    // **참 소실점을 규칙 상태로 넣는다** — 사람이 완벽히 그은 극한이다.
    // 규칙의 순서를 지킨다: **첫 수평 소실점이 지평선을 정의한다**
    S.cam.loadRules({
      slots: [0, 1, 2].map(ax => ({
        kind: "vp", at: [sc.vps[ax][0], sc.vps[ax][1]],
        // ⚠ `orthocenter`는 **더 이상 만들어지지 않는다**(2026-08-17 A-4) — 수직 소실점은
        // 사용자가 그은 기울어진 세로선에서 나온다. 여기서는 **참값을 직접 넣는 것**이므로
        // 그 출처로 적는다(하네스는 "사람이 완벽히 그은 극한"을 흉내 낸다).
        source: ax === 0 ? "two_lines" : ax === 1 ? "horizon_x_line" : "tilted_vertical",
        support: 2,
      })),
      horizon: sc.vps[0][1],
      waiting: [], depthLines: [], verticalLines: [],
    });
    S.refresh();
    window.__SC = sc;
    return { canvas: size, strokes: S.doc().strokes.length, hasCamera: !!S.cam.ctx(),
             boxes: boxes ?? 1,
             lifted: S.doc().strokes.filter((s: { seg3d?: unknown }) => s.seg3d).length };
  }, { boxes: opts.boxes ?? 1 });
}

/**
 * 픽스처 + **자동 잠금까지**(F: 카메라가 서는 순간 잠긴다 — `confirmNow`가 그 앱 경로다).
 * 3D가 서 있어야 하는 하네스는 이것을 부른다.
 */
export async function setupConfirmed(page: Page, opts: { boxes?: 1 | 2 } = {}) {
  const s = await setupScene(page, opts);
  return page.evaluate(async (s) => {
    window.S2S.confirmNow();
    return { ...s, standing: window.S2S.standing(),
             lifted: window.S2S.doc().strokes.filter((x: { seg3d?: unknown }) => x.seg3d).length };
  }, s);
}
