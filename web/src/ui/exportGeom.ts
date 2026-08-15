// S-9 **내보내기** — 다른 도구로 가져간다. OBJ(폴리라인)와 glTF(LINE_STRIP).
//
// ## 왜 면이 아니라 선인가
// 이 도구는 **면을 만들지 않는다**(D-S20, S-8). 그리지 않은 기하를 지어내지 않기 때문이다.
// 그러므로 내보내는 것도 선이다 — 튜브 메쉬는 **화면에 보이라고 만든 표현**이고
// (굵기는 그린 속도에서 온다) 원본은 점열이다. 튜브를 삼각형으로 내보내면 받는 쪽에서
// "이것이 모델링된 형상"으로 읽힌다. **폴리라인이 원본에 가장 가깝다.**
//
// ## 좌표계
// 내부 좌표는 **카메라 좌표계**다 — x 오른쪽 · y **아래** · z 화면 안쪽(`geom3d`).
// 밖으로 나갈 때는 관례(Y 위 · −Z 앞)로 바꾼다: `(x, −y, −z)`.
// x축 180° 회전이므로 **손잡이(handedness)가 바뀌지 않는다** — 뷰포트의 `world.rotation.x = π`와
// 같은 변환이다(뒤집기를 두 군데서 다르게 하면 3D 뷰와 내보낸 파일이 거울상이 된다).
import type { Stroke } from "../s3d/stroke.js";
import type { Vec3 } from "../s3d/geom3d.js";

/** 내부 좌표 → 내보내기 좌표. **이 한 줄이 규약의 전부다.** */
export const toExportFrame = (p: Vec3): Vec3 => [p[0], -p[1], -p[2]];

export interface ExportOpts {
  /** 획 색(축 색 또는 미확정 주황). 없으면 회색 하나로 나간다. */
  colorOf?: (s: Stroke) => string;
  /** 파일 머리말에 남길 한 줄. */
  note?: string;
}

export interface ExportResult<T> {
  data: T;
  /** 실제로 나간 획 수. */
  strokes: number;
  /** **빠진 획 수와 이유**. 조용히 줄이지 않는다 — 미배치 획은 3D 좌표가 없다. */
  skippedUnplaced: number;
  points: number;
}

const F = (v: number) => (Math.abs(v) < 1e-12 ? "0" : v.toFixed(6).replace(/\.?0+$/, ""));

/**
 * **OBJ 폴리라인**. `v`(정점) + `l`(선) 요소만 쓴다. 면(`f`)은 없다 — 만든 적이 없다.
 * 획 하나가 `o` 그룹 하나이므로 받는 쪽에서 획 단위로 고를 수 있다.
 */
export function toObj(strokes: Stroke[], opts: ExportOpts = {}): ExportResult<string> {
  const out: string[] = [
    "# SKETCH2SPACE — 손으로 그린 투시도가 그대로 3차원이 된다",
    "# 폴리라인만 있습니다(면을 만들지 않는 도구입니다 — D-S20).",
    "# 좌표: Y 위 · -Z 앞. 내부(카메라) 좌표에서 (x, -y, -z)로 옮겼습니다.",
  ];
  if (opts.note) out.push(`# ${opts.note}`);
  let base = 1, n = 0, pts = 0, skipped = 0;
  for (const s of strokes) {
    if (s.pts3d.length < 2) { skipped += 1; continue; }
    out.push(`o ${s.id}`);
    // 축·색은 주석으로 남긴다 — OBJ에 그것을 담을 자리가 없고, 재료를 만들면
    // .mtl 파일이 따라붙어야 한다(A-3: 가장 단순한 것).
    out.push(`# axis=${s.axis}${opts.colorOf ? ` color=${opts.colorOf(s)}` : ""}`);
    for (const p of s.pts3d) {
      const q = toExportFrame(p);
      out.push(`v ${F(q[0])} ${F(q[1])} ${F(q[2])}`);
    }
    out.push("l " + s.pts3d.map((_, i) => base + i).join(" "));
    base += s.pts3d.length;
    pts += s.pts3d.length;
    n += 1;
  }
  return { data: out.join("\n") + "\n", strokes: n, points: pts, skippedUnplaced: skipped };
}

/** `#rrggbb` → glTF의 **선형** RGB. baseColorFactor는 sRGB가 아니다. */
export function srgbToLinear(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? parseInt(m[1], 16) : 0x999999;
  const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(c => {
    const u = c / 255;
    return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
  });
  return [ch[0], ch[1], ch[2]];
}

/** Uint8Array → base64. 브라우저·노드 어디서나 같은 결과여야 한다(자체 구현). */
export function toBase64(bytes: Uint8Array): string {
  const T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += T[a >> 2];
    out += T[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += i + 1 < bytes.length ? T[((b & 15) << 2) | ((c ?? 0) >> 6)] : "=";
    out += i + 2 < bytes.length ? T[c & 63] : "=";
  }
  return out;
}

/**
 * **glTF 2.0**(.gltf, 버퍼는 data URI로 넣는다 — 파일 하나로 끝난다).
 *
 * 각 획이 `LINE_STRIP`(mode 3) 프리미티브 하나다. 색은 재료의 `baseColorFactor`이고
 * **unlit이 아니다** — 대부분의 뷰어가 선을 조명 없이 그리므로 굳이 확장을 걸지 않는다.
 */
export function toGltf(strokes: Stroke[], opts: ExportOpts = {}): ExportResult<object> {
  const use = strokes.filter(s => s.pts3d.length >= 2);
  const skipped = strokes.length - use.length;
  const total = use.reduce((k, s) => k + s.pts3d.length, 0);
  const buf = new Float32Array(total * 3);
  const accessors: object[] = [], bufferViews: object[] = [];
  const meshes: object[] = [], nodes: object[] = [], materials: object[] = [];
  const matIndex = new Map<string, number>();
  let off = 0;

  use.forEach((s, i) => {
    const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
    const byteOffset = off * 4;
    for (const p of s.pts3d) {
      const q = toExportFrame(p);
      for (let k = 0; k < 3; k++) {
        buf[off++] = q[k];
        if (q[k] < lo[k]) lo[k] = q[k];
        if (q[k] > hi[k]) hi[k] = q[k];
      }
    }
    bufferViews.push({ buffer: 0, byteOffset, byteLength: s.pts3d.length * 12, target: 34962 });
    accessors.push({ bufferView: i, componentType: 5126, count: s.pts3d.length,
                     type: "VEC3", min: lo, max: hi });
    const hex = opts.colorOf?.(s) ?? "#999999";
    let mat = matIndex.get(hex);
    if (mat == null) {
      mat = materials.length;
      matIndex.set(hex, mat);
      const [r, g, b] = srgbToLinear(hex);
      materials.push({ name: hex, pbrMetallicRoughness: {
        baseColorFactor: [r, g, b, 1], metallicFactor: 0, roughnessFactor: 1 } });
    }
    meshes.push({ name: s.id, primitives: [{ attributes: { POSITION: i }, mode: 3, material: mat }] });
    nodes.push({ mesh: i, name: s.id });
  });

  const bytes = new Uint8Array(buf.buffer, 0, total * 12);
  const gltf = {
    asset: { version: "2.0", generator: "SKETCH2SPACE (S-9)",
             copyright: opts.note ?? undefined },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes, meshes, materials, accessors, bufferViews,
    buffers: [{ byteLength: total * 12,
                uri: "data:application/octet-stream;base64," + toBase64(bytes) }],
  };
  return { data: gltf, strokes: use.length, points: total, skippedUnplaced: skipped };
}

/** 파일 하나를 내려받는다. 브라우저 전용 — 측정 코드는 위 순수 함수만 쓴다. */
export function download(text: string, name: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
